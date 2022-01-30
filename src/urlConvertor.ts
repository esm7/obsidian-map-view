import { App, Editor, EditorPosition } from 'obsidian';

import * as leaflet from 'leaflet';
import { PluginSettings } from 'src/settings';
import * as utils from 'src/utils';

export class UrlConvertor {
	private settings: PluginSettings;

	constructor(app: App, settings: PluginSettings) {
		this.settings = settings;
	}

	findMatchInLine(editor: Editor) {
		const cursor = editor.getCursor();
		const result = this.parseLocationFromUrl(editor.getLine(cursor.line));
		return result?.location;
	}

	parseLocationFromUrl(line: string) {
		for (const rule of this.settings.urlParsingRules) {
			const regexp = RegExp(rule.regExp, 'g');
			const results = line.matchAll(regexp);
			for (let result of results) {
				try {
					return {
						location: new leaflet.LatLng(parseFloat(result[1]), parseFloat(result[2])),
						index: result.index,
						matchLength: result[0].length,
						ruleName: rule.name
					};
				}
				catch (e) { }
			}
		}
		return null;
	}

	insertLocationToEditor(location: leaflet.LatLng, editor: Editor, replaceStart?: EditorPosition, replaceLength?: number) {
		const locationString = `[](geo:${location.lat},${location.lng})`;
		const cursor = editor.getCursor();
		if (replaceStart && replaceLength) {
			editor.replaceRange(locationString, replaceStart, {line: replaceStart.line, ch: replaceStart.ch + replaceLength});
		}
		else
			editor.replaceSelection(locationString);
		// We want to put the cursor right after the beginning of the newly-inserted link
		const newCursorPos = replaceStart ? replaceStart.ch + 1 : cursor.ch + 1;
		editor.setCursor({line: cursor.line, ch: newCursorPos});
		utils.verifyOrAddFrontMatter(editor);
	}

	convertUrlAtCursorToGeolocation(editor: Editor) {
		const cursor = editor.getCursor();
		const result = this.parseLocationFromUrl(editor.getLine(cursor.line));
		if (result)
			this.insertLocationToEditor(result.location, editor, {line: cursor.line, ch: result.index}, result.matchLength);
	}
}
