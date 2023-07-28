import {
    WorkspaceLeaf,
    MarkdownView,
    Editor,
    EditorPosition,
    App,
    TFile,
    getAllTags,
} from 'obsidian';

import * as moment_ from 'moment';
import * as leaflet from 'leaflet';
import * as path from 'path';
import * as settings from './settings';
import * as consts from './consts';
import { BaseMapView } from './baseMapView';

/**
 * An ordered stack (latest first) of the latest used leaves.
 * Maintained by the main plugin object.
 */
export let lastUsedLeaves: WorkspaceLeaf[] = [];

export function getLastUsedValidMarkdownLeaf() {
    for (const leaf of lastUsedLeaves) {
        if (
            (leaf as any).parent &&
            leaf.view instanceof MarkdownView &&
            !leaf.getViewState()?.pinned
        ) {
            return leaf;
        }
    }
    return null;
}

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

export function formatEmbeddedWithTemplates(s: string, fileName: string) {
    const fileNamePattern = /\$filename\$/g;
    const replaced = s.replace(fileNamePattern, fileName);
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
): Promise<[TFile, number]> {
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
    const filePath = path?.join
        ? path.join(directory, fileName)
        : directory
        ? directory + '/' + fileName
        : fileName;
    let fullName = sanitizeFileName(filePath);
    if (await app.vault.adapter.exists(fullName + '.md'))
        fullName += Math.random() * 1000;
    const cursorLocation = content.indexOf(CURSOR);
    content = content.replace(CURSOR, '');
    try {
        const file = await app.vault.create(
            fullName + '.md',
            content + templateContent
        );
        return [file, cursorLocation];
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

export function verifyOrAddFrontMatterForInline(
    editor: Editor,
    settings: settings.PluginSettings
): boolean {
    // If the user has a custom tag to denote a location, and this tag exists in the note, there's no need to add
    // a front-matter
    const tagNameToSearch = settings.tagForGeolocationNotes?.trim();
    if (
        tagNameToSearch?.length > 0 &&
        editor.getValue()?.contains(tagNameToSearch)
    )
        return false;
    // Otherwise, verify this note has a front matter with an empty 'locations' tag
    return verifyOrAddFrontMatter(editor, 'locations', '');
}

export function replaceFollowActiveNoteQuery(
    file: TFile,
    settings: settings.PluginSettings
) {
    return settings.queryForFollowActiveNote.replace(/\$PATH\$/g, file.path);
}

/**
 * Returns an open leaf of a map view type, if such exists.
 */
export function findOpenMapView(app: App) {
    const maps = app.workspace.getLeavesOfType(consts.MAP_VIEW_NAME);
    if (maps && maps.length > 0) return maps[0].view as BaseMapView;
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
 * Insert a geo link into the editor at the cursor position
 * @param location The geolocation to convert to text and insert
 * @param editor The Obsidian Editor instance
 * @param replaceStart The EditorPosition to start the replacement at. If null will replace any text selected
 * @param replaceLength The EditorPosition to stop the replacement at. If null will replace any text selected
 */
export function insertLocationToEditor(
    location: leaflet.LatLng,
    editor: Editor,
    settings: settings.PluginSettings,
    replaceStart?: EditorPosition,
    replaceLength?: number
) {
    const locationString = `[](geo:${location.lat},${location.lng})`;
    const cursor = editor.getCursor();
    if (replaceStart && replaceLength) {
        editor.replaceRange(locationString, replaceStart, {
            line: replaceStart.line,
            ch: replaceStart.ch + replaceLength,
        });
    } else editor.replaceSelection(locationString);
    // We want to put the cursor right after the beginning of the newly-inserted link
    const newCursorPos = replaceStart ? replaceStart.ch + 1 : cursor.ch + 1;
    editor.setCursor({ line: cursor.line, ch: newCursorPos });
    verifyOrAddFrontMatterForInline(editor, settings);
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
    const allFiles = app.vault.getMarkdownFiles();
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

export function isMobile(app: App): boolean {
    return (app as any)?.isMobile;
}

export function trimmedFileName(file: TFile) {
    const MAX_LENGTH = 12;
    const name = file.basename;
    if (name.length > MAX_LENGTH)
        return (
            name.slice(0, MAX_LENGTH / 2) +
            '...' +
            name.slice(name.length - MAX_LENGTH / 2)
        );
    else return name;
}

export function mouseEventToOpenMode(
    settings: settings.PluginSettings,
    ev: MouseEvent,
    settingType: 'openMap' | 'openNote'
) {
    // There are events that don't include middle-click information (some 'click' handlers), so in such cases
    // we invoke this function from keyDown, and don't want to invoke it twice in case it wasn't actually
    // a middle click
    if (settingType === 'openNote') {
        if (ev.button === 1) return settings.markerMiddleClickBehavior;
        else if (ev.ctrlKey) return settings.markerCtrlClickBehavior;
        else return settings.markerClickBehavior;
    } else {
        if (ev.button === 1) return settings.openMapMiddleClickBehavior;
        else if (ev.ctrlKey) return settings.openMapCtrlClickBehavior;
        else return settings.openMapBehavior;
    }
}

export function djb2Hash(s: string) {
    var hash = 5381;
    for (var i = 0; i < s.length; i++) {
        hash = (hash << 5) + hash + s.charCodeAt(i); /* hash * 33 + c */
    }
    return hash.toString();
}
