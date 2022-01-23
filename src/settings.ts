import * as consts from 'src/consts';
import { LatLng } from 'leaflet';
import { SplitDirection } from 'obsidian';

export type PluginSettings = {
	// Deprecated
	markerIcons?: Record<string, any>;
	markerIconRules?: MarkerIconRule[];
	zoomOnGoFromNote: number;
	// Deprecated
	tilesUrl?: string;
	mapSources: TileSource[];
	chosenMapSource?: number;
	chosenMapMode?: MapLightDark;
	defaultMapCenter?: LatLng;
	defaultZoom?: number;
	defaultTags?: string[];
	autoZoom: boolean;
	markerClickBehavior?: 'samePane' | 'secondPane' | 'alwaysNew';
	newPaneSplitDirection?: SplitDirection;
	newNoteNameFormat?: string;
	newNotePath?: string;
	newNoteTemplate?: string;
	snippetLines?: number;
	debug?: boolean;
	openIn?: OpenInSettings[];
	urlParsingRules?: UrlParsingRule[];
	mapControls?: MapControls;
	maxClusterRadiusPixels: number;
	searchProvider?: 'osm' | 'google';
	geocodingApiKey?: string;
}

export type MapLightDark = 'auto' | 'light' | 'dark';

export type TileSource = {
	name: string;
	urlLight: string;
	urlDark?: string;
	currentMode?: MapLightDark;
}

export type OpenInSettings = {
	name: string;
	urlPattern: string;
}

export type UrlParsingRule = {
	name: string;
	regExp: string;
	order: 'latFirst' | 'lngFirst';
	preset: boolean;
}

export type MapControls = {
	filtersDisplayed: boolean;
	viewDisplayed: boolean;
}

export type MarkerIconRule = {
	ruleName: string;
	preset: boolean;
	iconDetails: any;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	markerIconRules: [
		{ruleName: "default", preset: true, iconDetails: {"prefix": "fas", "icon": "fa-circle", "markerColor": "blue"}},
		{ruleName: "#trip", preset: false, iconDetails: {"prefix": "fas", "icon": "fa-hiking", "markerColor": "green"}},
		{ruleName: "#trip-water", preset: false, iconDetails: {"prefix": "fas", "markerColor": "blue"}},
		{ruleName: "#dogs", preset: false, iconDetails: {"prefix": "fas", "icon": "fa-paw"}},
	],
	zoomOnGoFromNote: 15,
	tilesUrl: consts.TILES_URL_OPENSTREETMAP,
	autoZoom: true,
	markerClickBehavior: 'samePane',
	newNoteNameFormat: 'Location added on {{date:YYYY-MM-DD}}T{{date:HH-mm}}',
	snippetLines: 3,
	debug: false,
	openIn: [{name: 'Google Maps', urlPattern: 'https://maps.google.com/?q={x},{y}'}],
	urlParsingRules: [
		{name: 'Google Maps', regExp: /https:\/\/\S*\@([0-9\.\-]+),([0-9\.\-]+)\S*/.source, order: 'latFirst', preset: true},
		{name: 'OpenStreetMap Show Address', regExp: /https:\/\/www.openstreetmap.org\S*query=([0-9\.\-]+%2C[0-9\.\-]+)\S*/.source, order: 'latFirst', preset: true}
	],
	mapControls: {filtersDisplayed: true, viewDisplayed: true},
	maxClusterRadiusPixels: 20,
	searchProvider: 'osm',
	mapSources: [{name: 'OpenStreetMap', urlLight: consts.TILES_URL_OPENSTREETMAP}],
	chosenMapMode: 'auto'
};

export function convertLegacyMarkerIcons(settings: PluginSettings): boolean {
	if (settings.markerIcons) {
		settings.markerIconRules = [];
		for (let key in settings.markerIcons) {
			const newRule: MarkerIconRule = {ruleName: key, preset: key === 'default', iconDetails: settings.markerIcons[key]};
			settings.markerIconRules.push(newRule);
		}
		settings.markerIcons = null;
		return true;
	}
	return false;
}

export function convertLegacyTilesUrl(settings: PluginSettings): boolean {
	if (settings.tilesUrl) {
		settings.mapSources = [{name: 'Default', urlLight: settings.tilesUrl}];
		settings.tilesUrl = null;
		return true;
	}
	return false;
}
