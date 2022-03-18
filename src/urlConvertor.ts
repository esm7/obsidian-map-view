import { App, Editor, EditorPosition } from 'obsidian';

import * as leaflet from 'leaflet';
import { PluginSettings } from 'src/settings';
import * as utils from 'src/utils';

/** A class to convert a string (usually a URL) into coordinate format */
export class UrlConvertor {
	private settings: PluginSettings;

	/**
	 * construct an instance of CoordinateParser
	 * @param app The obsidian App instance
	 * @param settings The plugin settings
	 */
	constructor(app: App, settings: PluginSettings) {
		this.settings = settings;
	}

	/**
	 * Parse the line where the cursor is in the editor
	 * @param editor The obsidian Editor instance to use
	 */
	findMatchInLine(editor: Editor) {
		const cursor = editor.getCursor();
		const result = this.parseLocationFromUrl(editor.getLine(cursor.line));
		return result?.location;
	}

	/**
	 * Get coordinate from an encoded string (usually a URL).
	 * Will try each url parsing rule until one succeeds.
	 * @param line The string to decode
	 */
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

	/**
	 * Insert a geo link into the editor at the cursor position
	 * @param location The coordinate to insert into the editor
	 * @param editor The obsidian Editor instance
	 * @param replaceStart The EditorPosition to start the replacement at. If null will replace any text selected
	 * @param replaceLength The EditorPosition to stop the replacement at. If null will replace any text selected
	 */
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
		utils.verifyOrAddFrontMatter(editor, 'locations', '');
	}

	/**
	 * Replace the text at the cursor location with a geo link
	 * @param editor The obsidian Editor instance
	 */
	convertUrlAtCursorToGeolocation(editor: Editor) {
		const cursor = editor.getCursor();
		const result = this.parseLocationFromUrl(editor.getLine(cursor.line));
		if (result)
			this.insertLocationToEditor(result.location, editor, {line: cursor.line, ch: result.index}, result.matchLength);
	}
}
