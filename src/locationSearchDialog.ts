import { Editor, App, SuggestModal, TFile, Instruction } from 'obsidian';
import * as leaflet from 'leaflet';

import MapViewPlugin from 'src/main';
import { PluginSettings } from 'src/settings';
import { GeoSearcher, GeoSearchResult } from 'src/geosearch';
import { getIconFromOptions } from 'src/markerIcons';
import * as utils from 'src/utils';
import * as consts from 'src/consts';

export class SuggestInfo extends GeoSearchResult {
    icon?: leaflet.ExtraMarkers.IconOptions;
}

type DialogAction = 'newNote' | 'addToNote' | 'custom';

export class LocationSearchDialog extends SuggestModal<SuggestInfo> {
    private plugin: MapViewPlugin;
    private settings: PluginSettings;
    private searcher: GeoSearcher;
    private lastSearchTime = 0;
    private delayInMs = 250;
    private lastSearch = '';
    private lastSearchResults: SuggestInfo[] = [];
    private includeResults: SuggestInfo[] = [];
    private hasIcons: boolean = false;

    private dialogAction: DialogAction;
    private editor: Editor = null;

    // If dialogAction is 'custom', this will launch upon selection
    public customOnSelect: (
        selection: SuggestInfo,
        evt: MouseEvent | KeyboardEvent
    ) => void;
    // If specified, this rectangle is used as a parameter for the various geocoding providers, so they can
    // prioritize results that are closer to the current view
    public searchArea: leaflet.LatLngBounds | null = null;

    constructor(
        app: App,
        plugin: MapViewPlugin,
        settings: PluginSettings,
        dialogAction: DialogAction,
        title: string,
        editor: Editor = null,
        includeResults: SuggestInfo[] = null,
        hasIcons: boolean = false,
        moreInstructions: Instruction[] = null
    ) {
        super(app);
        this.plugin = plugin;
        this.settings = settings;
        this.searcher = new GeoSearcher(app, settings);
        this.dialogAction = dialogAction;
        this.editor = editor;
        this.includeResults = includeResults;
        this.hasIcons = hasIcons;

        this.setPlaceholder(
            title + ': type a place name or paste a string to parse'
        );
        let instructions = [{ command: 'enter', purpose: 'to use' }];
        if (moreInstructions)
            instructions = instructions.concat(moreInstructions);
        this.setInstructions(instructions);
        this.inputEl.addEventListener('keypress', (ev: KeyboardEvent) => {
            // In the case of a custom select function, trigger it also for Shift+Enter.
            // Obsidian doesn't have an API for that, so we find the selected item in a rather patchy way,
            // and manually close the dialog
            if (
                ev.key == 'Enter' &&
                ev.shiftKey &&
                this.customOnSelect != null
            ) {
                const chooser = (this as any).chooser;
                const selectedItem = chooser?.selectedItem;
                const values = chooser?.values;
                if (chooser && values) {
                    this.onChooseSuggestion(values[selectedItem], ev);
                    this.close();
                }
            }
        });
    }

    getSuggestions(query: string) {
        let result: SuggestInfo[] = [];
        // Get results from the "to include" list, e.g. existing markers
        let resultsToInclude: SuggestInfo[] = [];
        if (this.includeResults)
            for (const toInclude of this.includeResults) {
                if (
                    query.length == 0 ||
                    toInclude.name.toLowerCase().includes(query.toLowerCase())
                )
                    resultsToInclude.push(toInclude);
                if (resultsToInclude.length >= consts.MAX_MARKER_SUGGESTIONS)
                    break;
            }
        result = result.concat(resultsToInclude);

        // From this point onward, results are added asynchronously.
        // We make sure to add them *after* the synchronuous results, otherwise
        // it will be very annoying for a user who may have already selected something.
        if (query == this.lastSearch) {
            result = result.concat(this.lastSearchResults);
        }
        this.getSearchResultsWithDelay(query);
        return result;
    }

    renderSuggestion(value: SuggestInfo, el: HTMLElement) {
        el.addClass('map-search-suggestion');
        if (this.hasIcons) {
            let iconDiv = el.createDiv('search-icon-div');
            const compiledIcon = getIconFromOptions(
                value.icon ?? consts.SEARCH_RESULT_MARKER,
                this.plugin.iconCache
            );
            let iconElement: HTMLElement = compiledIcon.createIcon();
            let style = iconElement.style;
            style.marginLeft = style.marginTop = '0';
            style.position = 'relative';
            iconDiv.append(iconElement);
            let textDiv = el.createDiv('search-text-div');
            textDiv.appendText(value.name);
        } else el.appendText(value.name);
    }

    onChooseSuggestion(value: SuggestInfo, evt: MouseEvent | KeyboardEvent) {
        if (this.dialogAction == 'newNote')
            this.plugin.newFrontMatterNote(value.location, evt, value.name);
        else if (this.dialogAction == 'addToNote')
            this.addToNote(value.location, evt, value.name);
        else if (this.dialogAction == 'custom' && this.customOnSelect != null)
            this.customOnSelect(value, evt);
    }

    async addToNote(
        location: leaflet.LatLng,
        ev: MouseEvent | KeyboardEvent,
        query: string
    ) {
        const locationString = `[${location.lat},${location.lng}]`;
        utils.verifyOrAddFrontMatter(this.editor, 'location', locationString);
    }

    async getSearchResultsWithDelay(query: string) {
        if (query === this.lastSearch || query.length < 3) return;
        const timestamp = Date.now();
        this.lastSearchTime = timestamp;
        const Sleep = (ms: number) =>
            new Promise((resolve) => setTimeout(resolve, ms));
        await Sleep(this.delayInMs);
        if (this.lastSearchTime != timestamp) {
            // Search is canceled by a newer search
            return;
        }
        // After the sleep our search is still the last -- so the user stopped and we can go on
        this.lastSearch = query;
        this.lastSearchResults = await this.searcher.search(
            query,
            this.searchArea
        );
        (this as any).updateSuggestions();
    }
}
