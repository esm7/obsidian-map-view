import { App, TFile } from 'obsidian';
import * as leaflet from 'leaflet';

import { PluginSettings } from 'src/settings';
import * as consts from 'src/consts';

export class FileMarker {
	file: TFile;
	fileLocation?: number;
	location: leaflet.LatLng;
	icon?: leaflet.Icon<leaflet.BaseIconOptions>;
	mapMarker?: leaflet.Marker;
	id: MarkerId;

	constructor(file: TFile, location: leaflet.LatLng) {
		this.file = file;
		this.location = location;
		this.id = new MarkerId(file.name, location);
	}
}

export class MarkerId {
	public fileName: string;
	public flattenedLocation: string;

	constructor(fileName: string, location: leaflet.LatLng) {
		this.fileName = fileName;
		this.flattenedLocation = location.lat.toString() + location.lng.toString();
	}
}

export type MarkersMap = Map<MarkerId, FileMarker>;

export async function buildMarkers(files: TFile[], settings: PluginSettings, app: App) {
	let markers: FileMarker[] = [];
	for (const file of files) {
		const fileCache = app.metadataCache.getFileCache(file);
		const frontMatter = fileCache?.frontmatter;
		if (frontMatter) {
			const location = getFrontMatterLocation(file, app);
			if (location) {
				verifyLocation(location);
				let leafletMarker = new FileMarker(file, location);
				leafletMarker.icon = getIconForMarker(leafletMarker, settings, app);
				markers.push(leafletMarker);
			}
			if ('locations' in frontMatter) {
				const markersFromFile = await getMarkersFromFileContent(file, settings, app);
				markers.push(...markersFromFile);
			}
		}
	}
	return markers;
}

function getIconForMarker(marker: FileMarker, settings: PluginSettings, app: App) : leaflet.ExtraMarkers.Icon {
	let result = settings.markerIcons.default;
	const fileCache = app.metadataCache.getFileCache(marker.file);
	if (fileCache && fileCache.tags) {
		const fileTags = fileCache.tags.map(tagCache => tagCache.tag);
		// We iterate over the rules and apply them one by one, so later rules override earlier ones
		for (const tag in settings.markerIcons) {
			if (fileTags.indexOf(tag) > -1) {
				result = Object.assign({}, result, settings.markerIcons[tag]);
			}
		}
	}
	return leaflet.ExtraMarkers.icon(result);
}

function verifyLocation(location: leaflet.LatLng) {
	if (location.lng < consts.LNG_LIMITS[0] || location.lng > consts.LNG_LIMITS[1])
		throw Error(`Lng ${location.lng} is outside the allowed limits`);
	if (location.lat < consts.LAT_LIMITS[0] || location.lat > consts.LAT_LIMITS[1])
		throw Error(`Lat ${location.lat} is outside the allowed limits`);
}

async function getMarkersFromFileContent(file: TFile, settings: PluginSettings, app: App): Promise<FileMarker[]> {
	let markers: FileMarker[] = [];
	const content = await app.vault.read(file);
	const locationRegex = /\`location:\s*\[?(.+)\s*,\s*(.+)\]?\`/g;
	const matches = content.matchAll(locationRegex);
	for (const match of matches) {
		try {
			const location = new leaflet.LatLng(parseFloat(match[1]), parseFloat(match[2]));
			verifyLocation(location);
			const marker = new FileMarker(file, location);
			marker.fileLocation = match.index;
			marker.icon = getIconForMarker(marker, settings, app);
			markers.push(marker);
		}
		catch (e) {
			console.log(`Error converting location in file ${file.name}: could not parse ${match[1]} or ${match[2]}`, e);
		}
	}
	return markers;
}

export function getFrontMatterLocation(file: TFile, app: App) : leaflet.LatLng {
	const fileCache = app.metadataCache.getFileCache(file);
	const frontMatter = fileCache?.frontmatter;
	if (frontMatter && frontMatter?.location) {
		try {
			const location = frontMatter.location;
			if (!Array.isArray(frontMatter.location))
				return null;
			// We have a single location at hand
			if (location.length == 2 && typeof(location[0]) === 'number' && typeof(location[1]) === 'number') {
				const location = new leaflet.LatLng(frontMatter.location[0], frontMatter.location[1]);
				verifyLocation(location);
			}
		}
		catch (e) {
			console.log(`Error converting location in file ${file.name}:`, e);
		}
	}
	return null;
}
