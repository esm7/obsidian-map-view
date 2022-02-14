import {App, TFile, getAllTags, Menu, MenuItem} from 'obsidian';
import wildcard from 'wildcard';
import * as leaflet from 'leaflet';
import 'leaflet-extra-markers';
import 'leaflet-extra-markers/dist/css/leaflet.extra-markers.min.css';
// Ugly hack for obsidian-leaflet compatability, see https://github.com/esm7/obsidian-map-view/issues/6
// @ts-ignore
let localL = L;

import { PluginSettings, MarkerIconRule } from 'src/settings';
import * as consts from 'src/consts';
import * as utils from "src/utils";
import type {MapView} from "src/mapView"
import {GeoJsonObject} from 'geojson';

type MarkerId = string;


if (!(leaflet.Polygon.prototype as any).getLatLng) {
	// extend the Polygon behaviour to support clustering
	leaflet.Polygon.addInitHook(function() {
		console.log(this.getBounds().getCenter())
		this._latlng = this.getBounds().getCenter();
	});

	leaflet.Polygon.include({
		getLatLng: function() {
			return this._latlng;
		},
		setLatLng: function() {} // Dummy method.
	});
}



export abstract class BaseGeoLayer {
	/**
	 * The file descriptor
	 */
	file: TFile;
	/**
	 * The unique identifier for this geographic layer
	 */
	id: MarkerId;
	/**
	 * The character position in the file the coordinate comes from
	 */
	fileLocation?: number;
	/**
	 * The leaflet layer on the map
	 */
	geoLayer?: leaflet.Layer;
	/**
	 * Snippet of the file to show in the hover bubble
	 */
	snippet?: string;
	/**
	 * Optional extra name. Used by geo urls with a prefixed name
	 */
	extraName?: string;
	/**
	 * Any tags specified with the geographic layer
	 */
	tags: string[] = [];

	/**
	 * Construct a new map pin object
	 * @param file
	 */
	protected constructor(file: TFile) {
		this.file = file;
	}

	/**
	 * Init the leaflet geographic layer from the data
	 * @param map
	 */
	abstract initGeoLayer(map: MapView): void;

	/**
	 * Generate a unique identifier for this layer
	 */
	abstract generateId(): MarkerId;

	/**
	 * Is this geographic layer identical to the other object.
	 * Used to compare to existing data to minimise creation.
	 * @param other The other object to compare to
	 */
	abstract isSame(other: BaseGeoLayer): boolean;

	/**
	 * Get the bounds of the data
	 */
	abstract getBounds(): leaflet.LatLng[];
}


export class GeoJSON extends BaseGeoLayer {
	/**
	 * The raw geoJSON data
	 */
	geoJSON: GeoJsonObject;

	/**
	 * The GeoJSON leaflet object
	 */
	geoLayer?: leaflet.GeoJSON

	constructor(file: TFile, geoJSON: GeoJsonObject) {
		super(file);
		this.geoJSON = geoJSON
		this.id = this.generateId();
	}

	initGeoLayer(map: MapView) {
		try {
			this.geoLayer = new leaflet.GeoJSON(this.geoJSON);
		} catch (e) {
			console.log("geoJSON is not valid geoJSON", this.geoJSON)
			throw e;
		}
	}

	generateId(): MarkerId {
		return this.file.name + JSON.stringify(this.geoJSON);
	}

	isSame(other: BaseGeoLayer): boolean {
		return other instanceof GeoJSON &&
			other.geoJSON == this.geoJSON;
	}

	getBounds(): leaflet.LatLng[] {
		let bounds = this.geoLayer.getBounds()
		return [bounds.getNorthEast(), bounds.getSouthWest()];
	}
}


/**
 * A class to hold all the data for a map pin
 */
export class FileMarker extends BaseGeoLayer {
	geoLayer?: leaflet.Marker;

	/**
	 * The coordinate for the geographic layer
	 */
	location: leaflet.LatLng;
	/**
	 * The image icon to display
	 */
	icon?: leaflet.Icon<leaflet.BaseIconOptions>;
	/**
	 * The clickable object on the map
	 */

	/**
	 * Construct a new map pin object
	 * @param file
	 * @param location
	 */
	constructor(file: TFile, location: leaflet.LatLng) {
		super(file)
		this.location = location;
		this.id = this.generateId();
	}

	/**
	 * Is the other data equal to this
	 * @param other A BaseGeoLayer to compare to
	 */
	isSame(other: BaseGeoLayer): boolean {
		return other instanceof FileMarker &&
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
			this.icon?.options?.markerColor === other.icon?.options?.markerColor &&
			// @ts-ignore
			this.icon?.options?.shape === other.icon?.options?.shape
	}

	generateId() : MarkerId {
		return this.file.name + this.location.lat.toString() + this.location.lng.toString();
	}

	/**
	 * Create a leaflet layer and add it to the map
	 */
	initGeoLayer(map: MapView): void {
		this.icon = getIconForMarker(this, map.settings, map.app);
		// create the leaflet marker instance
		this.geoLayer = leaflet.marker(this.location, { icon: this.icon || new leaflet.Icon.Default() });
		// when clicked, open the marker in an editor
		this.geoLayer.on('click', (event: leaflet.LeafletMouseEvent) => {
			map.goToMarker(this, event.originalEvent.ctrlKey, true);
		});
		// when hovered
		this.geoLayer.on('mouseover', (event: leaflet.LeafletMouseEvent) => {
			let content = `<p class="map-view-marker-name">${this.file.name}</p>`;
			if (this.extraName)
				content += `<p class="map-view-extra-name">${this.extraName}</p>`;
			if (this.snippet)
				content += `<p class="map-view-marker-snippet">${this.snippet}</p>`;
			this.geoLayer.bindPopup(content, {closeButton: true, autoPan: false}).openPopup();
		});
		// when stop hovering
		this.geoLayer.on(
			'mouseout',
			(event: leaflet.LeafletMouseEvent) => {
				this.geoLayer.closePopup();
			}
		);
		// run when the layer is added to the map
		this.geoLayer.on(
			'add',
			(event: leaflet.LeafletEvent) => {
				this.geoLayer.getElement().addEventListener(
					'contextmenu',
					(ev: MouseEvent) => {
						// on context menu creation
						let mapPopup = new Menu(map.app);
						mapPopup.setNoIcon();
						mapPopup.addItem((item: MenuItem) => {
							item.setTitle('Open note');
							item.onClick(async ev => { map.goToMarker(this, ev.ctrlKey, true); });
						});
						mapPopup.addItem((item: MenuItem) => {
							item.setTitle('Open geolocation in default app');
							item.onClick(ev => {
								open(`geo:${this.location.lat},${this.location.lng}`);
							});
						});
						utils.populateOpenInItems(mapPopup, this.location, map.settings);
						mapPopup.showAtPosition(ev);
						ev.stopPropagation();
					}
				)
			}
		);
	}

	getBounds(): leaflet.LatLng[] {
		return [this.location];
	}
}

export type MarkersMap = Map<MarkerId, BaseGeoLayer>;

/**
 * Create file markers for every coordinate in the front matter and file body
 * @param mapToAppendTo The list of file markers to append to
 * @param file The file descriptor to parse
 * @param settings The plugin settings
 * @param app The obsidian app instance
 * @param skipMetadata If true will not find markers in the front matter
 */
export async function buildAndAppendGeoLayers(mapToAppendTo: BaseGeoLayer[], file: TFile, settings: PluginSettings, app: App, skipMetadata?: boolean) {
	const fileCache = app.metadataCache.getFileCache(file);
	const frontMatter = fileCache?.frontmatter;
	if (frontMatter) {
		if (!skipMetadata) {
			const location = getFrontMatterCoordinate(file, app);
			if (location) {
				verifyLocation(location);
				let leafletMarker = new FileMarker(file, location);
				mapToAppendTo.push(leafletMarker);
			}
			let geoJSON = getFrontMatterGeoJSON(file, app);
			if (geoJSON) {
				mapToAppendTo.push(new GeoJSON(file, geoJSON));
			}
		}
		if ('locations' in frontMatter) {
			const inlineCoordiantes = await getInlineFileMarkers(file, settings, app);
			mapToAppendTo.push(...inlineCoordiantes);
			const inlineGeoJSON = await getInlineGeoJSON(file, settings, app);
			mapToAppendTo.push(...inlineGeoJSON);
		}
	}
}

/**
 * Create file marker instances for all the files in the vault
 * @param files
 * @param settings
 * @param app
 */
export async function buildMarkers(files: TFile[], settings: PluginSettings, app: App): Promise<BaseGeoLayer[]> {
	if (settings.debug)
		console.time('buildMarkers');
	let markers: BaseGeoLayer[] = [];
	for (const file of files) {
		await buildAndAppendGeoLayers(markers, file, settings, app);
	}
	if (settings.debug)
		console.timeEnd('buildMarkers');
	return markers;
}

function checkTagPatternMatch(tagPattern: string, tags: string[]) {
	let match = wildcard(tagPattern, tags);
	return match && match.length > 0;
}

/**
 * Create a leaflet icon for the marker
 * @param marker The file marker to create the icon for
 * @param settings The plugin settings
 * @param app The obsidian app instance
 */
function getIconForMarker(marker: BaseGeoLayer, settings: PluginSettings, app: App) : leaflet.Icon {
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

/**
 * Make sure that the coordinates are valid world coordinates
 * -90 <= longitude <= 90 and -180 <= latitude <= 180
 * @param location
 */
export function verifyLocation(location: leaflet.LatLng) {
	if (location.lng < consts.LNG_LIMITS[0] || location.lng > consts.LNG_LIMITS[1])
		throw Error(`Lng ${location.lng} is outside the allowed limits`);
	if (location.lat < consts.LAT_LIMITS[0] || location.lat > consts.LAT_LIMITS[1])
		throw Error(`Lat ${location.lat} is outside the allowed limits`);
}

/**
 * Find all inline coordinates in a string
 * @param content The file contents to find the coordinates in
 */
export function matchInlineCoordinates(content: string): RegExpMatchArray[] {
	// Old syntax of ` `location: ... ` `. This syntax doesn't support a name so we leave an empty capture group
	const legacyLocationRegex = /`location:\s*\[?(?<lat>[+-]?([0-9]*[.])?[0-9]+)\s*,\s*(?<long>[+-]?([0-9]*[.])?[0-9]+)]?`/g
	// New syntax of `[name](geo:...)` and an optional tags as `tag:tagName` separated by whitespaces
	const geoURLlocationRegex = /\[(?<name>.*?)]\(geo:(?<lat>[+-]?([0-9]*[.])?[0-9]+),(?<long>[+-]?([0-9]*[.])?[0-9]+)\)[ \t]*(?<tags>(tag:[\w\/\-]+[\s.]+)*)/g;
	const legacyMatches = content.matchAll(legacyLocationRegex);
	const geoURLMatches = content.matchAll(geoURLlocationRegex);
	return Array.from(legacyMatches).concat(Array.from(geoURLMatches));
}

/**
 * Find all inline geoJSON in a string
 * @param content The file contents to find the coordinates in
 */
export function matchInlineGeoJSON(content: string): RegExpMatchArray[] {
	// New syntax of `[name](geo:...)` and an optional tags as `tag:tagName` separated by whitespaces
	const geoJSONlocationRegex = /```geoJSON\n(?<geoJSON>.*?)```/gs;
	const geoJSONMatches = content.matchAll(geoJSONlocationRegex);
	return Array.from(geoJSONMatches);
}

/**
 * Get markers from within the file body
 * @param file The file descriptor to load
 * @param settings The plugin settings
 * @param app The obsidian app instance
 */
async function getInlineFileMarkers(file: TFile, settings: PluginSettings, app: App): Promise<FileMarker[]> {
	let markers: FileMarker[] = [];
	const content = await app.vault.read(file);
	const matches = matchInlineCoordinates(content);
	for (const match of matches) {
		try {
			const location = new leaflet.LatLng(parseFloat(match.groups.lat), parseFloat(match.groups.long));
			verifyLocation(location);
			const marker = new FileMarker(file, location);
			if (match.groups.name && match.groups.name.length > 0)
				marker.extraName = match.groups.name;
			if (match.groups.tags) {
				// Parse the list of tags
				const tagRegex = /tag:(?<tag>[\w\/\-]+)/g;
				const tags = match.groups.tags.matchAll(tagRegex);
				for (const tag of tags)
					if (tag.groups.tag)
						marker.tags.push('#' + tag.groups.tag);
			}
			marker.fileLocation = match.index;
			marker.snippet = await makeTextSnippet(file, content, marker.fileLocation, settings);
			markers.push(marker);
		}
		catch (e) {
			console.log(`Error converting location in file ${file.name}: could not parse ${match[0]}`, e);
		}
	}
	return markers;
}

/**
 * Get geoJSON from within the file body
 * @param file The file descriptor to load
 * @param settings The plugin settings
 * @param app The obsidian app instance
 */
async function getInlineGeoJSON(file: TFile, settings: PluginSettings, app: App): Promise<GeoJSON[]> {
	let markers: GeoJSON[] = [];
	const content = await app.vault.read(file);
	const matches = matchInlineGeoJSON(content);
	for (const match of matches) {
		try {
			const geoJSONData = JSON.parse(match.groups.geoJSON);
			const geoJSON = new GeoJSON(file, geoJSONData);
			if (geoJSONData instanceof Object && geoJSONData.tags && geoJSONData.tags instanceof Array) {
				for (const tag of geoJSONData.tags) {
					if (tag instanceof String) {
						geoJSON.tags.push('#' + tag);
					}
				}
			}
			geoJSON.fileLocation = match.index;
			geoJSON.snippet = await makeTextSnippet(file, content, geoJSON.fileLocation, settings);
			markers.push(geoJSON);
		}
		catch (e) {
			console.log(`Error converting inline geoJSON from ${file.name}: could not parse ${match.groups.geoJSON}`, e);
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
			if (matchInlineCoordinates(line).length > 0)
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
			if (matchInlineCoordinates(line).length > 0)
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

/**
 * Get the geoJSON stored in the front matter of a file
 * @param file The file to load the front matter from
 * @param app The app to load the file from
 */
export function getFrontMatterGeoJSON(file: TFile, app: App) : GeoJsonObject {
	const fileCache = app.metadataCache.getFileCache(file);
	const frontMatter = fileCache?.frontmatter;
	if (frontMatter && frontMatter?.geoJSON) {
		console.log(frontMatter);
		return frontMatter.geoJSON;
	}
	return null;
}