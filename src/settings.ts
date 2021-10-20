import * as consts from 'src/consts';
import { LatLng } from 'leaflet';
import { SplitDirection } from 'obsidian';

export type PluginSettings = {
	darkMode: boolean;
	markerIcons: Record<string, any>;
	zoomOnGoFromNote: number;
	tilesUrl: string;
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
	mapControls?: MapControls;
	maxClusterRadiusPixels: number;
}

export type OpenInSettings = {
	name: string;
	urlPattern: string;
}

export type MapControls = {
	filtersDisplayed: boolean;
	viewDisplayed: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	darkMode: false,
	markerIcons: {
		"default": {"prefix": "fas", "icon": "fa-circle", "markerColor": "blue"},
		"#trip": {"prefix": "fas", "icon": "fa-hiking", "markerColor": "green"},
		"#trip-water": {"prefix": "fas", "markerColor": "blue"},
		"#dogs": {"prefix": "fas", "icon": "fa-paw"},
	},
	zoomOnGoFromNote: 15,
	tilesUrl: consts.TILES_URL_OPENSTREETMAP,
	autoZoom: true,
	markerClickBehavior: 'samePane',
	newNoteNameFormat: 'Location added on {{date:YYYY-MM-DD}}T{{date:HH-mm}}',
	snippetLines: 3,
	debug: false,
	openIn: [{name: 'Google Maps', urlPattern: 'https://maps.google.com/?q={x},{y}'}],
	mapControls: {filtersDisplayed: true, viewDisplayed: true},
	maxClusterRadiusPixels: 20
};
