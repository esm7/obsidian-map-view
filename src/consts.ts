import * as leaflet from 'leaflet';

export const MAP_VIEW_NAME = 'map';
export const MINI_MAP_VIEW_NAME = 'minimap';

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
export const ROUTING_SOURCE_MARKER = {
    prefix: 'fas',
    icon: 'fa-flag',
    markerColor: 'red',
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
