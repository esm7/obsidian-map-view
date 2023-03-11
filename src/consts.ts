import * as leaflet from 'leaflet';

export const MAP_VIEW_NAME = 'map';
export const MINI_MAP_VIEW_NAME = 'minimap';

// From: https://lucide.dev/icon/globe-2?search=globe (width/height removed)
export const RIBBON_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.54 15H17a2 2 0 0 0-2 2v4.54"></path><path d="M7 3.34V5a3 3 0 0 0 3 3v0a2 2 0 0 1 2 2v0c0 1.1.9 2 2 2v0a2 2 0 0 0 2-2v0c0-1.1.9-2 2-2h3.17"></path><path d="M11 21.95V18a2 2 0 0 0-2-2v0a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05"></path><circle cx="12" cy="12" r="10"></circle></svg>';

export const TILES_URL_OPENSTREETMAP =
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const SEARCH_RESULT_MARKER = {
    prefix: 'fas',
    icon: 'fa-search',
    markerColor: 'blue',
} as leaflet.ExtraMarkers.IconOptions;
export const CURRENT_LOCATION_MARKER = {
    prefix: 'fas',
    icon: 'fa-location-crosshairs',
    markerColor: 'blue',
} as leaflet.ExtraMarkers.IconOptions;
export const MAX_CLUSTER_PREVIEW_ICONS = 4;
export const HISTORY_SAVE_ZOOM_DIFF = 2;

export const LAT_LIMITS = [-90, 90];
export const LNG_LIMITS = [-180, 180];

export const MAX_QUERY_SUGGESTIONS = 20;
export const MAX_EXTERNAL_SEARCH_SUGGESTIONS = 5;
export const MAX_MARKER_SUGGESTIONS = 5;
export const MAX_ZOOM = 25;
export const DEFAULT_MAX_TILE_ZOOM = 19;
export const MIN_REAL_TIME_LOCATION_ZOOM = 13;

export const HIGHLIGHT_CLASS_NAME = 'map-view-highlight';

export const DEFAULT_EMBEDDED_HEIGHT = 300;
export const MIN_QUICK_EMBED_ZOOM = 8;
