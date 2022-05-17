import { App, TFile, getAllTags } from 'obsidian';
import wildcard from 'wildcard';
import * as leaflet from 'leaflet';
import 'leaflet-extra-markers';
import 'leaflet-extra-markers/dist/css/leaflet.extra-markers.min.css';
// Ugly hack for obsidian-leaflet compatability, see https://github.com/esm7/obsidian-map-view/issues/6
// @ts-ignore
let localL = L;

import { PluginSettings, MarkerIconRule } from 'src/settings';
import * as consts from 'src/consts';

type MarkerId = string;

/** An object that represents a single marker in a file, which is either a complete note with a geolocation, or an inline geolocation inside a note */
export class FileMarker {
    /** The file object on which this location was found */
    file: TFile;
    /** In the case of an inline location, the position within the file where the location was found */
    fileLocation?: number;
    /** In case of an inline location, the line within the file where the geolocation was found */
    fileLine?: number;
    location: leaflet.LatLng;
    icon?: leaflet.Icon<leaflet.BaseIconOptions>;
    mapMarker?: leaflet.Marker;
    /** An ID to recognize the marker */
    id: MarkerId;
    /** Snippet of the file to show in the map marker popup */
    snippet?: string;
    /** Optional extra name that can be set for geolocation links (this is the link name rather than the file name) */
    extraName?: string;
    /** Tags that this marker includes */
    tags: string[] = [];

    /**
     * Construct a new FileMarker object
     * @param file The file the pin comes from
     * @param location The geolocation
     */
    constructor(file: TFile, location: leaflet.LatLng) {
        this.file = file;
        this.location = location;
        this.id = this.generateId();
    }

    isSame(other: FileMarker) {
        return (
            this.file.name === other.file.name &&
            this.location.toString() === other.location.toString() &&
            this.fileLocation === other.fileLocation &&
            this.extraName === other.extraName &&
            this.icon?.options?.iconUrl === other.icon?.options?.iconUrl &&
            // @ts-ignore
            this.icon?.options?.icon === other.icon?.options?.icon &&
            // @ts-ignore
            this.icon?.options?.iconColor === other.icon?.options?.iconColor &&
            // @ts-ignore
            this.icon?.options?.markerColor ===
                other.icon?.options?.markerColor &&
            // @ts-ignore
            this.icon?.options?.shape === other.icon?.options?.shape
        );
    }

    generateId(): MarkerId {
        return (
            this.file.name +
            this.location.lat.toString() +
            this.location.lng.toString()
        );
    }
}

export type MarkersMap = Map<MarkerId, FileMarker>;

/**
 * Create a FileMarker for every front matter and inline geolocation in the given file.
 * @param mapToAppendTo The list of file markers to append to
 * @param file The file object to parse
 * @param settings The plugin settings
 * @param app The Obsidian App instance
 * @param skipMetadata If true will not find markers in the front matter
 */
export async function buildAndAppendFileMarkers(
    mapToAppendTo: FileMarker[],
    file: TFile,
    settings: PluginSettings,
    app: App,
    skipMetadata?: boolean
) {
    const fileCache = app.metadataCache.getFileCache(file);
    const frontMatter = fileCache?.frontmatter;
    if (frontMatter) {
        if (!skipMetadata) {
            const location = getFrontMatterLocation(file, app);
            if (location) {
                verifyLocation(location);
                let leafletMarker = new FileMarker(file, location);
                leafletMarker.icon = getIconForMarker(
                    leafletMarker,
                    settings,
                    app
                );
                mapToAppendTo.push(leafletMarker);
            }
        }
        if ('locations' in frontMatter) {
            const markersFromFile = await getMarkersFromFileContent(
                file,
                settings,
                app
            );
            mapToAppendTo.push(...markersFromFile);
        }
    }
}

/**
 * Create FileMarker instances for all the files in the given list
 * @param files The list of file objects to find geolocations in.
 * @param settings The plugin settings
 * @param app The Obsidian App instance
 */
export async function buildMarkers(
    files: TFile[],
    settings: PluginSettings,
    app: App
): Promise<FileMarker[]> {
    if (settings.debug) console.time('buildMarkers');
    let markers: FileMarker[] = [];
    for (const file of files) {
        await buildAndAppendFileMarkers(markers, file, settings, app);
    }
    if (settings.debug) console.timeEnd('buildMarkers');
    return markers;
}

function checkTagPatternMatch(tagPattern: string, tags: string[]) {
    let match = wildcard(tagPattern, tags);
    return match && match.length > 0;
}

/**
 * Create a leaflet icon for the marker
 * @param marker The FileMarker to create the icon for
 * @param settings The plugin settings
 * @param app The Obsidian App instance
 */
function getIconForMarker(
    marker: FileMarker,
    settings: PluginSettings,
    app: App
): leaflet.Icon {
    const fileCache = app.metadataCache.getFileCache(marker.file);
    // Combine the file tags with the marker-specific tags
    const tags = getAllTags(fileCache).concat(marker.tags);
    return getIconFromRules(tags, settings.markerIconRules);
}

export function getIconFromRules(tags: string[], rules: MarkerIconRule[]) {
    // We iterate over the rules and apply them one by one, so later rules override earlier ones
    let result = rules.find((item) => item.ruleName === 'default').iconDetails;
    for (const rule of rules) {
        if (checkTagPatternMatch(rule.ruleName, tags)) {
            result = Object.assign({}, result, rule.iconDetails);
        }
    }
    return getIconFromOptions(result);
}

export function getIconFromOptions(
    iconSpec: leaflet.BaseIconOptions
): leaflet.Icon {
    // Ugly hack for obsidian-leaflet compatability, see https://github.com/esm7/obsidian-map-view/issues/6
    // @ts-ignore
    const backupL = L;
    try {
        // @ts-ignore
        L = localL;
        return leaflet.ExtraMarkers.icon(iconSpec);
    } finally {
        // @ts-ignore
        L = backupL;
    }
}

/**
 * Make sure that the coordinates are valid world coordinates
 * -90 <= longitude <= 90 and -180 <= latitude <= 180
 * @param location
 */
export function verifyLocation(location: leaflet.LatLng) {
    if (
        location.lng < consts.LNG_LIMITS[0] ||
        location.lng > consts.LNG_LIMITS[1]
    )
        throw Error(`Lng ${location.lng} is outside the allowed limits`);
    if (
        location.lat < consts.LAT_LIMITS[0] ||
        location.lat > consts.LAT_LIMITS[1]
    )
        throw Error(`Lat ${location.lat} is outside the allowed limits`);
}

/**
 * Find all inline geolocations in a string
 * @param content The file contents to find the coordinates in
 */
export function matchInlineLocation(content: string): RegExpMatchArray[] {
    // Old syntax of ` `location: ... ` `. This syntax doesn't support a name so we leave an empty capture group
    const locationRegex1 =
        /`location:\s*\[?(?<lat>[+-]?([0-9]*[.])?[0-9]+)\s*,\s*(?<lng>[+-]?([0-9]*[.])?[0-9]+)]?`/g;
    // New syntax of `[name](geo:...)` and an optional tags as `tag:tagName` separated by whitespaces
    const locationRegex2 =
        /\[(?<name>.*?)]\(geo:(?<lat>[+-]?([0-9]*[.])?[0-9]+),(?<lng>[+-]?([0-9]*[.])?[0-9]+)\)[ \t]*(?<tags>(tag:[\w\/\-]+[\s.]+)*)/g;
    const matches1 = content.matchAll(locationRegex1);
    const matches2 = content.matchAll(locationRegex2);
    return Array.from(matches1).concat(Array.from(matches2));
}

/**
 * Build markers from inline locations in the file body
 * @param file The file object to load
 * @param settings The plugin settings
 * @param app The Obsidian App instance
 */
async function getMarkersFromFileContent(
    file: TFile,
    settings: PluginSettings,
    app: App
): Promise<FileMarker[]> {
    let markers: FileMarker[] = [];
    const content = await app.vault.read(file);
    const matches = matchInlineLocation(content);
    for (const match of matches) {
        try {
            const location = new leaflet.LatLng(
                parseFloat(match.groups.lat),
                parseFloat(match.groups.lng)
            );
            verifyLocation(location);
            const marker = new FileMarker(file, location);
            if (match.groups.name && match.groups.name.length > 0)
                marker.extraName = match.groups.name;
            if (match.groups.tags) {
                // Parse the list of tags
                const tagRegex = /tag:(?<tag>[\w\/\-]+)/g;
                const tags = match.groups.tags.matchAll(tagRegex);
                for (const tag of tags)
                    if (tag.groups.tag) marker.tags.push('#' + tag.groups.tag);
            }
            marker.fileLocation = match.index;
            marker.fileLine =
                content.substring(0, marker.fileLocation).split('\n').length -
                1;
            marker.icon = getIconForMarker(marker, settings, app);
            marker.snippet = await makeTextSnippet(
                file,
                content,
                marker.fileLocation,
                settings
            );
            markers.push(marker);
        } catch (e) {
            console.log(
                `Error converting location in file ${file.name}: could not parse ${match[0]}`,
                e
            );
        }
    }
    return markers;
}

async function makeTextSnippet(
    file: TFile,
    fileContent: string,
    fileLocation: number,
    settings: PluginSettings
) {
    let snippet = '';
    if (settings.snippetLines && settings.snippetLines > 0) {
        // We subtract 1 because the central (location) line will always be displayed
        let linesAbove = Math.round((settings.snippetLines - 1) / 2);
        let linesBelow = settings.snippetLines - 1 - linesAbove;
        // Start from the beginning of the line on which the location was found, then go back
        let snippetStart = fileContent.lastIndexOf('\n', fileLocation);
        while (linesAbove > 0 && snippetStart > -1) {
            const prevLine = fileContent.lastIndexOf('\n', snippetStart - 1);
            const line = fileContent.substring(snippetStart, prevLine);
            // If the new line above contains another location, don't include it and stop
            if (matchInlineLocation(line).length > 0) break;
            snippetStart = prevLine;
            linesAbove -= 1;
        }
        // Either if we reached the beginning of the file (-1) or if we stopped due to a newline, we want a step forward
        snippetStart += 1;
        // Always include the line with the location
        let snippetEnd = fileContent.indexOf('\n', fileLocation);
        // Now continue forward
        while (linesBelow > 0 && snippetEnd > -1) {
            const nextLine = fileContent.indexOf('\n', snippetEnd + 1);
            const line = fileContent.substring(
                snippetEnd,
                nextLine > -1 ? nextLine : fileContent.length
            );
            // If the new line below contains another location, don't include it and stop
            if (matchInlineLocation(line).length > 0) break;
            snippetEnd = nextLine;
            linesBelow -= 1;
        }
        if (snippetEnd === -1) snippetEnd = fileContent.length;
        snippet = fileContent.substring(snippetStart, snippetEnd);
        snippet = snippet.replace(
            /\`location:.*\`/g,
            '<span class="map-view-location">`location:...`</span>'
        );
        snippet = snippet.replace(
            /(\[.*\])\(.+\)/g,
            '<span class="map-view-location">$1(geo:...)</span>'
        );
    }
    return snippet;
}

/**
 * Get the geolocation stored in the front matter of a file
 * @param file The file to load the front matter from
 * @param app The Obsidian App instance
 */
export function getFrontMatterLocation(file: TFile, app: App): leaflet.LatLng {
    const fileCache = app.metadataCache.getFileCache(file);
    const frontMatter = fileCache?.frontmatter;
    if (frontMatter && frontMatter?.location) {
        try {
            const location = frontMatter.location;
            // We have a single location at hand
            if (
                location.length == 2 &&
                typeof location[0] === 'number' &&
                typeof location[1] === 'number'
            ) {
                const location = new leaflet.LatLng(
                    frontMatter.location[0],
                    frontMatter.location[1]
                );
                verifyLocation(location);
                return location;
            } else console.log(`Unknown: `, location);
        } catch (e) {
            console.log(`Error converting location in file ${file.name}:`, e);
        }
    }
    return null;
}
