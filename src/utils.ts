import {
    WorkspaceLeaf,
    MarkdownView,
    Editor,
    App,
    TFile,
    Menu,
    MenuItem,
    getAllTags,
} from 'obsidian';

import * as moment_ from 'moment';
import * as leaflet from 'leaflet';
import * as path from 'path';
import * as settings from './settings';
import * as consts from './consts';
import { MapView } from './mapView';

export function formatWithTemplates(s: string, query = '') {
    const datePattern = /{{date:([a-zA-Z\-\/\.\:]*)}}/g;
    const queryPattern = /{{query}}/g;
    const replaced = s
        .replace(datePattern, (_, pattern) => {
            // @ts-ignore
            return moment().format(pattern);
        })
        .replace(queryPattern, query);

    return replaced;
}

type NewNoteType = 'singleLocation' | 'multiLocation';

const CURSOR = '$CURSOR$';

function sanitizeFileName(s: string) {
    const illegalChars = /[\?<>:\*\|":]/g;
    return s.replace(illegalChars, '-');
}

/**
 * Create a new markdown note and populate with the location
 * @param app The Obsidian App instance
 * @param newNoteType The location format to encode as
 * @param directory The directory path to put the file in
 * @param fileName The name of the file
 * @param location The geolocation
 * @param templatePath Optional path to a template to use for constructing the new file
 */
export async function newNote(
    app: App,
    newNoteType: NewNoteType,
    directory: string,
    fileName: string,
    location: string,
    templatePath?: string
): Promise<TFile> {
    // `$CURSOR$` is used to set the cursor
    let content =
        newNoteType === 'singleLocation'
            ? `---\nlocation: [${location}]\n---\n\n${CURSOR}`
            : `---\nlocations:\n---\n\n\[${CURSOR}](geo:${location})\n`;
    let templateContent = '';
    if (templatePath && templatePath.length > 0)
        templateContent = await app.vault.adapter.read(templatePath);
	if (!directory) directory = '';
	if (!fileName) fileName = '';
	// Apparently in Obsidian Mobile there is no path.join function, not sure why.
	// So in case the path module doesn't contain `join`, we do it manually, assuming Unix directory structure.
	const filePath = path?.join ? path.join(directory, fileName) : (directory ? directory + '/' + fileName : fileName);
    let fullName = sanitizeFileName(filePath);
    if (await app.vault.adapter.exists(fullName + '.md'))
        fullName += Math.random() * 1000;
    try {
        return app.vault.create(fullName + '.md', content + templateContent);
    } catch (e) {
		console.log('Map View: cannot create file', fullName);
        throw Error(`Cannot create file named ${fullName}: ${e}`);
    }
}

/**
 * Go to a character index in the note
 * @param editor The Obsidian Editor instance
 * @param fileLocation The character index in the file to go to
 * @param highlight If true will select the whole line
 */
export async function goToEditorLocation(
    editor: Editor,
    fileLocation: number,
    highlight: boolean
) {
    if (fileLocation) {
        let pos = editor.offsetToPos(fileLocation);
        if (highlight) {
            const lineContent = editor.getLine(pos.line);
            editor.setSelection(
                { ch: 0, line: pos.line },
                { ch: lineContent.length, line: pos.line }
            );
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

// Creates or modifies a front matter that has the field `fieldName: fieldValue`.
// Returns true if a change to the note was made.
export function verifyOrAddFrontMatter(
    editor: Editor,
    fieldName: string,
    fieldValue: string
): boolean {
    const content = editor.getValue();
    const frontMatterRegex = /^---(.*?)^---/ms;
    const frontMatter = content.match(frontMatterRegex);
    const existingFieldRegex = new RegExp(`^---.*${fieldName}:.*^---`, 'ms');
    const existingField = content.match(existingFieldRegex);
    const cursorLocation = editor.getCursor();
    // That's not the best usage of the API, and rather be converted to editor transactions or something else
    // that can preserve the cursor position better
    if (frontMatter && !existingField) {
        const replaced = `---${frontMatter[1]}${fieldName}: ${fieldValue}\n---`;
        editor.setValue(content.replace(frontMatterRegex, replaced));
        editor.setCursor({
            line: cursorLocation.line + 1,
            ch: cursorLocation.ch,
        });
        return true;
    } else if (!frontMatter) {
        const newFrontMatter = `---\n${fieldName}: ${fieldValue}\n---\n\n`;
        editor.setValue(newFrontMatter + content);
        editor.setCursor({
            line: cursorLocation.line + newFrontMatter.split('\n').length - 1,
            ch: cursorLocation.ch,
        });
        return true;
    }
    return false;
}

/**
 * Populate a context menu from the user configurable URLs
 * @param menu The menu to attach
 * @param location The geolocation to use in the menu item
 * @param settings Plugin settings
 */
export function populateOpenInItems(
    menu: Menu,
    location: leaflet.LatLng,
    settings: settings.PluginSettings
) {
    for (let setting of settings.openIn) {
        if (!setting.name || !setting.urlPattern) continue;
        const fullUrl = setting.urlPattern
            .replace('{x}', location.lat.toString())
            .replace('{y}', location.lng.toString());
        menu.addItem((item: MenuItem) => {
            item.setTitle(`Open in ${setting.name}`);
            item.onClick((_ev) => {
                open(fullUrl);
            });
        });
    }
}

/**
 * Returns an open leaf of a map view type, if such exists.
 */
export function findOpenMapView(app: App) {
    const maps = app.workspace.getLeavesOfType(consts.MAP_VIEW_NAME);
    if (maps && maps.length > 0) return maps[0].view as MapView;
}

export async function getEditor(
    app: App,
    leafToUse?: WorkspaceLeaf
): Promise<Editor> {
    let view =
        leafToUse && leafToUse.view instanceof MarkdownView
            ? leafToUse.view
            : app.workspace.getActiveViewOfType(MarkdownView);
    if (view) return view.editor;
    return null;
}

/**
 * Matches a string with a regex according to a position (typically of a cursor).
 * Will return a result only if a match exists and the given position is part of it.
 */
export function matchByPosition(
    s: string,
    r: RegExp,
    position: number
): RegExpMatchArray {
    const matches = s.matchAll(r);
    for (const match of matches) {
        if (
            match.index <= position &&
            position <= match.index + match[0].length
        )
            return match;
    }
    return null;
}

/**
 * Returns a list of all the Obsidian tags
 */
export function getAllTagNames(app: App): string[] {
    let tags: string[] = [];
    const allFiles = app.vault.getFiles();
    for (const file of allFiles) {
        const fileCache = app.metadataCache.getFileCache(file);
        const fileTagNames = getAllTags(fileCache) || [];
        if (fileTagNames.length > 0) {
            tags = tags.concat(
                fileTagNames.filter((tagName) => tags.indexOf(tagName) < 0)
            );
        }
    }
    tags = tags.sort();
    return tags;
}
