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

export class FileMarker {
	file: TFile;
	fileLocation?: number;
	location: leaflet.LatLng;
	icon?: leaflet.Icon<leaflet.BaseIconOptions>;
	mapMarker?: leaflet.Marker;
	id: MarkerId;
	snippet?: string;
	extraName?: string;
	tags: string[] = [];

	constructor(file: TFile, location: leaflet.LatLng) {
		this.file = file;
		this.location = location;
		this.id = this.generateId();
	}

	isSame(other: FileMarker) {
		return this.file.name === other.file.name &&
			this.location.toString() === other.location.toString() &&
			this.fileLocation === other.fileLocation &&
			this.extraName === other.extraName &&
			this.icon?.options?.iconUrl === other.icon?.options?.iconUrl &&
			// @ts-ignore
			this.icon?.options?.icon === other.icon?.options?.icon &&
			// @ts-ignore
			this.icon?.options?.iconColor === other.icon?.options?.iconColor &&
			// @ts-ignore
			this.icon?.options?.markerColor === other.icon?.options?.markerColor &&
			// @ts-ignore
			this.icon?.options?.shape === other.icon?.options?.shape
	}

	generateId() : MarkerId {
		return this.file.name + this.location.lat.toString() + this.location.lng.toString();
	}
}

export type MarkersMap = Map<MarkerId, FileMarker>;

export async function buildAndAppendFileMarkers(mapToAppendTo: FileMarker[], file: TFile, settings: PluginSettings, app: App, skipMetadata?: boolean) {
	const fileCache = app.metadataCache.getFileCache(file);
	const frontMatter = fileCache?.frontmatter;
	if (frontMatter) {
		if (!skipMetadata) {
			const location = getFrontMatterCoordinate(file, app);
			if (location) {
				verifyLocation(location);
				let leafletMarker = new FileMarker(file, location);
				leafletMarker.icon = getIconForMarker(leafletMarker, settings, app);
				mapToAppendTo.push(leafletMarker);
			}
		}
		if ('locations' in frontMatter) {
			const markersFromFile = await getMarkersFromFileContent(file, settings, app);
			mapToAppendTo.push(...markersFromFile);
		}
	}
}

export async function buildMarkers(files: TFile[], settings: PluginSettings, app: App): Promise<FileMarker[]> {
	if (settings.debug)
		console.time('buildMarkers');
	let markers: FileMarker[] = [];
	for (const file of files) {
		await buildAndAppendFileMarkers(markers, file, settings, app);
	}
	if (settings.debug)
		console.timeEnd('buildMarkers');
	return markers;
}

function checkTagPatternMatch(tagPattern: string, tags: string[]) {
	let match = wildcard(tagPattern, tags);
	return match && match.length > 0;
}

function getIconForMarker(marker: FileMarker, settings: PluginSettings, app: App) : leaflet.Icon {
	const fileCache = app.metadataCache.getFileCache(marker.file);
	// Combine the file tags with the marker-specific tags
	const tags = getAllTags(fileCache).concat(marker.tags);
	return getIconFromRules(tags, settings.markerIconRules);
}

export function getIconFromRules(tags: string[], rules: MarkerIconRule[]) {
	// We iterate over the rules and apply them one by one, so later rules override earlier ones
	let result = rules.find(item => item.ruleName === 'default').iconDetails;
	for (const rule of rules) {
		if (checkTagPatternMatch(rule.ruleName, tags)) {
			result = Object.assign({}, result, rule.iconDetails);
		}
	}
	return getIconFromOptions(result);
}

export function getIconFromOptions(iconSpec: leaflet.BaseIconOptions) : leaflet.Icon {
	// Ugly hack for obsidian-leaflet compatability, see https://github.com/esm7/obsidian-map-view/issues/6
	// @ts-ignore
	const backupL = L;
	try {
		// @ts-ignore
		L = localL;
		return leaflet.ExtraMarkers.icon(iconSpec);
	}
	finally {
		// @ts-ignore
		L = backupL;
	}
}

export function verifyLocation(location: leaflet.LatLng) {
	if (location.lng < consts.LNG_LIMITS[0] || location.lng > consts.LNG_LIMITS[1])
		throw Error(`Lng ${location.lng} is outside the allowed limits`);
	if (location.lat < consts.LAT_LIMITS[0] || location.lat > consts.LAT_LIMITS[1])
		throw Error(`Lat ${location.lat} is outside the allowed limits`);
}

export function matchInlineLocation(content: string): RegExpMatchArray[] {
	// Old syntax of ` `location: ... ` `. This syntax doesn't support a name so we leave an empty capture group
	const locationRegex1 = /\`()location:\s*\[?([0-9.\-]+)\s*,\s*([0-9.\-]+)\]?\`/g;
	// New syntax of `[name](geo:...)` and an optional tags as `tag:tagName` separated by whitespaces
	const locationRegex2 = /\[(.*?)\]\(geo:([0-9.\-]+),([0-9.\-]+)\)[ \t]*((?:tag:[\w\/\-]+[\s\.]+)*)/g;
	const matches1 = content.matchAll(locationRegex1);
	const matches2 = content.matchAll(locationRegex2);
	return Array.from(matches1).concat(Array.from(matches2));
}

async function getMarkersFromFileContent(file: TFile, settings: PluginSettings, app: App): Promise<FileMarker[]> {
	let markers: FileMarker[] = [];
	const content = await app.vault.read(file);
	const matches = matchInlineLocation(content);
	for (const match of matches) {
		try {
			const location = new leaflet.LatLng(parseFloat(match[2]), parseFloat(match[3]));
			verifyLocation(location);
			const marker = new FileMarker(file, location);
			if (match[1] && match[1].length > 0)
				marker.extraName = match[1];
			if (match[4]) {
				// Parse the list of tags
				const tagRegex = /tag:([\w\/\-]+)/g;
				const tags = match[4].matchAll(tagRegex);
				for (const tag of tags)
					if (tag[1])
						marker.tags.push('#' + tag[1]);
			}
			marker.fileLocation = match.index;
			marker.icon = getIconForMarker(marker, settings, app);
			marker.snippet = await makeTextSnippet(file, content, marker.fileLocation, settings);
			markers.push(marker);
		}
		catch (e) {
			console.log(`Error converting location in file ${file.name}: could not parse ${match[1]} or ${match[2]}`, e);
		}
	}
	return markers;
}

async function makeTextSnippet(file: TFile, fileContent: string, fileLocation: number, settings: PluginSettings) {
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
			if (matchInlineLocation(line).length > 0)
				break;
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
			const line = fileContent.substring(snippetEnd, nextLine > -1 ? nextLine : fileContent.length);
			// If the new line below contains another location, don't include it and stop
			if (matchInlineLocation(line).length > 0)
				break;
			snippetEnd = nextLine;
			linesBelow -= 1;
		}
		if (snippetEnd === -1)
			snippetEnd = fileContent.length;
		snippet = fileContent.substring(snippetStart, snippetEnd);
		snippet = snippet.replace(/\`location:.*\`/g, '<span class="map-view-location">`location:...`</span>');
		snippet = snippet.replace(/(\[.*\])\(.+\)/g, '<span class="map-view-location">$1(geo:...)</span>');
	}
	return snippet;
}

/**
 * Get the coordinates stored in the front matter of a file
 * @param file The file to load the front matter from
 * @param app The app to load the file from
 */
export function getFrontMatterCoordinate(file: TFile, app: App) : leaflet.LatLng {
	const fileCache = app.metadataCache.getFileCache(file);
	const frontMatter = fileCache?.frontmatter;
	if (frontMatter && frontMatter?.location) {
		try {
			const location = frontMatter.location;
			// We have a single location at hand
			if (location.length == 2 && typeof(location[0]) === 'number' && typeof(location[1]) === 'number') {
				const location = new leaflet.LatLng(frontMatter.location[0], frontMatter.location[1]);
				verifyLocation(location);
				return location;
			}
			else
				console.log(`Unknown: `, location);
		}
		catch (e) {
			console.log(`Error converting location in file ${file.name}:`, e);
		}
	}
	return null;
}
