import { App, Editor, EditorPosition } from 'obsidian';

import * as leaflet from 'leaflet';
import { PluginSettings } from 'src/settings';
import * as utils from 'src/utils';


interface FindResult {
	location: leaflet.LatLng;
	index: number,
	matchLength: number,
	ruleName: string
}

/**
 * A class to convert a string (usually a URL) into coordinate format
 */
export class CoordinateParser {
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
	 * Get coordinate from an encoded string (usually a URL).
	 * Will try each url parsing rule until one succeeds.
	 * @param str The string to decode
	 */
	parseString(str: string): FindResult | null {
		for (const rule of this.settings.urlParsingRules) {
			const regexp = RegExp(rule.regExp, 'g');
			const results = str.matchAll(regexp);
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
	 * Parse the line where the cursor is in the editor
	 * @param editor The obsidian Editor instance to use
	 */
	parseEditorLine(editor: Editor): FindResult | null {
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		return this.parseString(line);
	}

	/**
	 * Insert a geo link into the editor at the cursor position
	 * @param editor The obsidian Editor instance
	 * @param coordinate The coordinate to insert into the editor
	 * @param replaceStart The EditorPosition to start the replacement at. If null will replace any text selected
	 * @param replaceEnd The EditorPosition to stop the replacement at. If null will replace any text selected
	 */
	editorInsertGeolocation(editor: Editor, coordinate: leaflet.LatLng, replaceStart?: EditorPosition, replaceEnd?: EditorPosition) {
		const locationString = `[](geo:${coordinate.lat},${coordinate.lng})`;
		let newCursorPos: EditorPosition;
		if (replaceStart && replaceEnd) {
			editor.replaceRange(locationString, replaceStart, replaceEnd);
			newCursorPos = {line: replaceStart.line, ch: replaceStart.ch + 1};
		} else {
			const cursor = editor.getCursor();
			editor.replaceSelection(locationString);
			newCursorPos = {line: cursor.line, ch: cursor.ch + 1};
		}

		// Put the cursor after the opening square bracket
		editor.setCursor(newCursorPos);
		// TODO: This will modify in a second operation.
		//  Is there a way to make it apply in one operation so that one undo undoes both changes
		utils.verifyOrAddFrontMatter(editor, 'locations', '');
	}

	/**
	 * Replace the text at the cursor location with a geo link
	 * @param editor The obsidian Editor instance
	 */
	editorLineToGeolocation(editor: Editor): void {
		const result = this.parseEditorLine(editor)
		if (result) {
			this.editorInsertGeolocation(
				editor,
				result.location,
				{
					line: editor.getCursor().line,
					ch: result.index
				},
				{
					line: editor.getCursor().line,
					ch: result.index + result.matchLength
				}
			);
		}
	}
}
