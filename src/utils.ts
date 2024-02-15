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
import MapViewPlugin from 'src/main';

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

export function escapeDoubleQuotes(s: string) {
    const escapePattern = /"/g;
    const replaced = s.replace(escapePattern, '\\$&');
    return replaced;
}

type NewNoteType = 'singleLocation' | 'multiLocation';

const CURSOR = '$CURSOR$';

function sanitizeFileName(s: string) {
    const illegalChars = /[\/\?<>:\*\|":]/g;
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
    frontMatterKey: string,
    templatePath?: string
): Promise<[TFile, number]> {
    // `$CURSOR$` is used to set the cursor
    let content =
        newNoteType === 'singleLocation'
            ? `---\n${frontMatterKey}: "${location}"\n---\n\n${CURSOR}`
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
export async function verifyOrAddFrontMatter(
    app: App,
    editor: Editor,
    file: TFile,
    fieldName: string,
    fieldValue: string
): Promise<boolean> {
    let locationAdded = false;
    await app.fileManager.processFrontMatter(file, (frontmatter: any) => {
        if (fieldName in frontmatter) {
            locationAdded = false;
            return;
        }
        frontmatter[fieldName] = fieldValue;
        locationAdded = true;
    });
    return locationAdded;
}

export async function verifyOrAddFrontMatterForInline(
    app: App,
    editor: Editor,
    file: TFile,
    settings: settings.PluginSettings
): Promise<boolean> {
    // If the user has a custom tag to denote a location, and this tag exists in the note, there's no need to add
    // a front-matter
    const tagNameToSearch = settings.tagForGeolocationNotes?.trim();
    if (
        tagNameToSearch?.length > 0 &&
        editor.getValue()?.contains(tagNameToSearch)
    )
        return false;
    // Otherwise, verify this note has a front matter with an empty 'locations' tag
    return await verifyOrAddFrontMatter(app, editor, file, 'locations', '');
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

export function getView(app: App, leafToUse?: WorkspaceLeaf): MarkdownView {
    let view =
        leafToUse && leafToUse.view instanceof MarkdownView
            ? leafToUse.view
            : app.workspace.getActiveViewOfType(MarkdownView);
    return view;
}

export function getEditor(app: App, leafToUse?: WorkspaceLeaf): Editor {
    let view = getView(app, leafToUse);
    if (view) return view.editor;
    return null;
}

export function getFile(app: App, leafToUse?: WorkspaceLeaf): TFile {
    let view = getView(app, leafToUse);
    if (view) return view.file;
    return null;
}

/**
 * Insert a geo link into the editor at the cursor position
 * @param location The geolocation to convert to text and insert
 * @param editor The Obsidian Editor instance
 * @param replaceStart The EditorPosition to start the replacement at. If null will replace any text selected
 * @param replaceLength The EditorPosition to stop the replacement at. If null will replace any text selected
 */
export async function insertLocationToEditor(
    app: App,
    location: leaflet.LatLng,
    editor: Editor,
    file: TFile,
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
    await verifyOrAddFrontMatterForInline(app, editor, file, settings);
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
export function getAllTagNames(app: App, plugin: MapViewPlugin): string[] {
    // Start from all the known tags by markers (which may be inline tags or Obsidian tags), and add to that all
    // the known Obsidian tags, so we can suggest them to the user too
    let tags = plugin.allTags;
    const allFiles = app.vault.getMarkdownFiles();
    for (const file of allFiles) {
        const fileCache = app.metadataCache.getFileCache(file);
        const fileTagNames = getAllTags(fileCache) || [];
        fileTagNames.forEach((tag) => tags.add(tag));
    }
    const sortedTags = Array.from(tags).sort();
    return sortedTags;
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
