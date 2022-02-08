import {WorkspaceLeaf, MarkdownView, Editor, App, TFile, Menu, MenuItem, stringifyYaml, parseYaml, Notice} from 'obsidian';

import * as moment_ from 'moment';
import * as leaflet from 'leaflet';
import * as path from 'path';
import * as settings from './settings';
import * as consts from './consts';
import { MapView } from './mapView';

export function formatWithTemplates(s: string, query = '') {
	const datePattern = /{{date:([a-zA-Z\-\/\.\:]*)}}/g;
	const queryPattern = /{{query}}/g;
	const replaced = s.replace(datePattern, (_, pattern) => {
		// @ts-ignore
		return moment().format(pattern);
	}).replace(queryPattern, query);
	
	return replaced;
}

type NewNoteType = 'singleLocation' | 'multiLocation';

const CURSOR = '$CURSOR$';

export async function newNote(app: App, newNoteType: NewNoteType, directory: string, fileName: string,
	location: string, templatePath?: string): Promise<TFile>
{
	// `$CURSOR$` is used to set the cursor
	let content = newNoteType === 'singleLocation' ?
		`---\nlocation: [${location}]\n---\n\n${CURSOR}` :
		`---\nlocations:\n---\n\n\[${CURSOR}](geo:${location})\n`;
	let templateContent = '';
	if (templatePath)
		templateContent = await app.vault.adapter.read(templatePath);
	let fullName = path.join(directory || '', fileName);
	if (await app.vault.adapter.exists(fullName + '.md'))
		fullName += Math.random() * 1000;
	try {
		return app.vault.create(fullName + '.md', content + templateContent);
	}
	catch (e) {
		throw Error(`Cannot create file named ${fullName}: ${e}`);
	}
}

/**
 * Go to a character index in the note
 * @param editor The obsidian Editor instance
 * @param characterIndex The character index in the file to go to
 * @param highlight If true will select the whole line
 */
export async function goToEditorLocation(editor: Editor, characterIndex: number, highlight: boolean) {
	if (characterIndex) {
		let pos = editor.offsetToPos(characterIndex);
		if (highlight) {
			const lineContent = editor.getLine(pos.line);
			editor.setSelection({ch: 0, line: pos.line}, {ch: lineContent.length, line: pos.line});
		} else {
			editor.setCursor(pos);
			editor.refresh();
		}
	}
	editor.focus();
}

export async function handleNewNoteCursorMarker(editor: Editor) {
	const templateValue = editor.getValue();
	const cursorMarkerIndex = templateValue.indexOf(CURSOR);
	if (cursorMarkerIndex > -1) {
		editor.setValue(templateValue.replace(CURSOR, ''));
		await goToEditorLocation(editor, cursorMarkerIndex, false);
	}
}

/**
 * A utility for reading, modifying and writing back front matter.
 * Load front matter from the current file and pass it to edit_callback.
 * The returned value from the callback replaces the original front matter
 * Return true if the yaml is changed
 * @param editor The obsidian editor instance
 * @param edit_callback The callback to modify the parsed object. Must return the modified object or null if no changes were made.
 */
export function updateFrontMatter(
	editor: Editor,
	edit_callback: (frontMatter: any) => any | null
){
	const content = editor.getValue();
	const frontMatterRegex = /^---(.*?)\n---/s;
	const frontMatterMatch = content.match(frontMatterRegex);
	let frontMatter: any
	if (frontMatterMatch){
		// found valid front matter
		const frontMatterYaml = frontMatterMatch[1];
		try {
			// parse the front matter into an object for easier handling
			frontMatter = parseYaml(frontMatterYaml);
		} catch (error) {
			new Notice("Could not parse front matter yaml.\n" + error);
			return false
		}
		if (typeof frontMatter === "object") {
			frontMatter = edit_callback(frontMatter);
			if (frontMatter) {
				const newFrontMatter = `---\n${stringifyYaml(frontMatter)}\n---`;
				const cursorLocation = editor.getCursor();
				editor.setValue(content.replace(frontMatterRegex, newFrontMatter));
				editor.setCursor({line: cursorLocation.line + 1, ch: cursorLocation.ch});
				return true;
			}
		} else {
			new Notice("Expected yaml front matter root to be an object/dictionary.");
		}
	} else {
		// did not find valid front matter
		frontMatter = {};
		frontMatter = edit_callback(frontMatter);
		if (frontMatter) {
			const newFrontMatter = `---\n${stringifyYaml(frontMatter)}\n---\n\n`;
			const cursorLocation = editor.getCursor();
			editor.setValue(newFrontMatter + content);
			editor.setCursor({line: cursorLocation.line + newFrontMatter.split('\n').length - 1, ch: cursorLocation.ch});
			return true;
		}
	}
	return false;
}

/**
 * Create or modify a front matter that has the field `fieldName: fieldValue`.
 * Returns true if a change to the note was made.
 * @param editor The obsidian Editor instance
 * @param key_name The key to set in the yaml front matter
 * @param default_value The default value to populate with if not defined. Defaults to null.
 */
export function frontMatterSetDefault(editor: Editor, key_name: string, default_value?: any): boolean {
	return updateFrontMatter(
		editor,
		(frontMatter) => {
			if (frontMatter.hasOwnProperty(key_name)) {
				// if the front matter already has this key
				if (frontMatter[key_name] === null && default_value !== null) {
					// if the key exists but the value is null
					frontMatter[key_name] = default_value
					return frontMatter
				}
				return null;
			} else {
				frontMatter[key_name] = default_value
				return frontMatter
			}
		}
	)
}

/**
 * Populate a context menu from the user configurable urls
 * @param menu The menu to attach
 * @param coordinate The coordinate to use in the menu item
 * @param settings Plugin settings
 */
export function populateOpenInItems(menu: Menu, coordinate: leaflet.LatLng, settings: settings.PluginSettings) {
	for (let setting of settings.openIn) {
		if (!setting.name || !setting.urlPattern)
			continue;
		const fullUrl = setting.urlPattern.replace('{x}', coordinate.lat.toString()).replace('{y}', coordinate.lng.toString());
		menu.addItem((item: MenuItem) => {
			item.setTitle(`Open in ${setting.name}`);
			item.onClick(_ev => {
				open(fullUrl);
			});
		})
	}
}

export function findOpenMapView(app: App) {
	const maps = app.workspace.getLeavesOfType(consts.MAP_VIEW_NAME);
	if (maps && maps.length > 0)
		return maps[0].view as MapView;
}

export async function getEditor(app: App, leafToUse?: WorkspaceLeaf) : Promise<Editor> {
	let view = leafToUse && leafToUse.view instanceof MarkdownView ?
		leafToUse.view :
		app.workspace.getActiveViewOfType(MarkdownView);
	if (view)
		return view.editor;
	return null;
}
