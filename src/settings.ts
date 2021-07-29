import * as consts from 'src/consts';
import { LatLng } from 'leaflet';
import { SplitDirection, TAbstractFile, TFile } from 'obsidian';

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
	detectImageLocations: boolean;
	imageMatcher: RegExp;
};

export const DEFAULT_SETTINGS: PluginSettings = {
	darkMode: false,
	markerIcons: {
		"default": { "prefix": "fas", "icon": "fa-circle", "markerColor": "blue" },
		"#trip": { "prefix": "fas", "icon": "fa-hiking", "markerColor": "green" },
		"#trip-water": { "prefix": "fas", "markerColor": "blue" },
		"#dogs": { "prefix": "fas", "icon": "fa-paw" },
	},
	zoomOnGoFromNote: 15,
	tilesUrl: consts.TILES_URL_OPENSTREETMAP,
	autoZoom: true,
	markerClickBehavior: 'samePane',
	newNoteNameFormat: 'Location added on {{date:YYYY-MM-DD}}T{{date:HH-mm}}',
	detectImageLocations: true,
	imageMatcher: /(?:png|jpe?g|tiff)/i,
};

export function isImage(file: TAbstractFile) {
	return !!file.path.match(DEFAULT_SETTINGS.imageMatcher);
}