import { Editor, MarkdownView, App, WorkspaceLeaf, SuggestModal, TFile } from 'obsidian';
import * as leaflet from 'leaflet';

import { PluginSettings } from 'src/settings';
import { LocationSuggest } from 'src/geosearch';
import { UrlConvertor } from 'src/urlConvertor';
import { MapView } from 'src/mapView';
import * as utils from 'src/utils';
import * as consts from 'src/consts';

class SuggestInfo {
	name: string;
	location?: leaflet.LatLng;
	type: 'searchResult' | 'url';
}

export class NewNoteDialog extends SuggestModal<SuggestInfo> {
	private settings: PluginSettings;
	private suggestor: LocationSuggest;
	private urlConvertor: UrlConvertor;
	private lastSearchTime = 0;
	private delayInMs = 250;
	private lastSearch = '';
	private lastSearchResults: SuggestInfo[] = [];

	constructor(app: App, settings: PluginSettings) {
		super(app);
		this.settings = settings;
		this.suggestor = new LocationSuggest(this.app, this.settings);
		this.urlConvertor = new UrlConvertor(this.app, this.settings);

		this.setPlaceholder('Type a search query or paste a supported URL');
		this.setInstructions([{command: 'enter', purpose: 'to use'}]);
	}

	getSuggestions(query: string) {
		let result: SuggestInfo[] = [];
		const urlResult = this.parseLocationAsUrl(query);
		if (urlResult)
			result.push(urlResult);
		if (query == this.lastSearch) {
			result = result.concat(this.lastSearchResults);
		}
		this.getSearchResultsWithDelay(query);
		return result;
	}

	renderSuggestion(value: SuggestInfo, el: HTMLElement) {
		el.setText(value.name);
	}

	onChooseSuggestion(value: SuggestInfo, evt: MouseEvent | KeyboardEvent) {
		this.newNote(value.location, evt);
	}

	async newNote(location: leaflet.LatLng, ev: MouseEvent | KeyboardEvent) {
		const locationString = `${location.lat},${location.lng}`;
		const newFileName = utils.formatWithTemplates(this.settings.newNoteNameFormat);
		const file: TFile = await utils.newNote(this.app, 'singleLocation', this.settings.newNotePath,
			newFileName, locationString, this.settings.newNoteTemplate);
		// If there is an open map view, use it to decide how and where to open the file.
		// Otherwise, open the file from the active leaf
		const mapView = utils.findOpenMapView(this.app);
		if (mapView) {
			mapView.goToFile(file, ev.ctrlKey, utils.handleNewNoteCursorMarker);
		}
		else {
			const leaf = this.app.workspace.activeLeaf;
			await leaf.openFile(file);
			const editor = await utils.getEditor(this.app);
			if (editor)
				await utils.handleNewNoteCursorMarker(editor);
		}
	}

	async getSearchResultsWithDelay(query: string) {
		// TODO merge this with LocationSuggest
		if (query === this.lastSearch || query.length < 3)
			return;
		const timestamp = Date.now();
		this.lastSearchTime = timestamp;
		const Sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
		await Sleep(this.delayInMs);
		if (this.lastSearchTime != timestamp) {
			// Search is canceled by a newer search
			return null;
		}
		// After the sleep our search is still the last -- so the user stopped and we can go on
		const results = await this.suggestor.searchProvider.search({query: query});
		const suggestions = results.map(result => ({
			name: result.label,
			location: new leaflet.LatLng(result.y, result.x),
			type: 'searchResult'
		} as SuggestInfo));
		this.lastSearchResults = suggestions;
		this.lastSearch = query;
		(this as any).updateSuggestions();
		return suggestions;
	}

	parseLocationAsUrl(query: string): SuggestInfo {
		const result = this.urlConvertor.parseLocationFromUrl(query);
		if (result)
			return {
				name: `Parsed from ${result.ruleName}: ${result.location.lat}, ${result.location.lng}`,
				location: result.location,
				type: 'url'
			};
	}
}
