import { Editor, App, TFile, Menu, MenuItem } from 'obsidian';

import * as moment_ from 'moment';
import * as leaflet from 'leaflet';
import * as path from 'path';

import * as settings from './settings';

export function formatWithTemplates(s: string) {
	const datePattern = /{{date:([a-zA-Z\-\/\.\:]*)}}/g;
	const replaced = s.replace(datePattern, (_, pattern) => {
		// @ts-ignore
		return moment().format(pattern);
	});
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

export async function goToEditorLocation(editor: Editor, fileLocation: number, highlight: boolean) {
	if (fileLocation) {
		let pos = editor.offsetToPos(fileLocation);
		if (highlight) {
			editor.setSelection({ch: 0, line: pos.line}, {ch: 1000, line: pos.line});
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

// Returns true if a replacement was made
export function verifyOrAddFrontMatter(editor: Editor): boolean {
	const content = editor.getValue();
	const frontMatterRegex = /^---(.*)^---/ms;
	const frontMatter = content.match(frontMatterRegex);
	const locations = content.match(/^---.*locations:.*^---/ms);
	const cursorLocation = editor.getCursor();
	// That's not the best usage of the API, and rather be converted to editor transactions or something else
	// that can preserve the cursor position better
	if (frontMatter && !locations) {
		const replaced = `---${frontMatter[1]}locations:\n---`;
		editor.setValue(content.replace(frontMatterRegex, replaced));
		editor.setCursor({line: cursorLocation.line + 1, ch: cursorLocation.ch});
		return true;
	} else if (!frontMatter) {
		const newFrontMatter = '---\nlocations:\n---\n\n';
		editor.setValue(newFrontMatter + content);
		editor.setCursor({line: cursorLocation.line + newFrontMatter.split('\n').length - 1, ch: cursorLocation.ch});
		return true;
	}
	return false;
}

export function populateOpenInItems(menu: Menu, location: leaflet.LatLng, settings: settings.PluginSettings) {
	for (let setting of settings.openIn) {
		if (!setting.name || !setting.urlPattern)
			continue;
		const fullUrl = setting.urlPattern.replace('{x}', location.lat.toString()).replace('{y}', location.lng.toString());
		menu.addItem((item: MenuItem) => {
			item.setTitle(`Open in ${setting.name}`);
			item.onClick(_ev => {
				open(fullUrl);
			});
		})
	}
}
