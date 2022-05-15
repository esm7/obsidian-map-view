import * as consts from 'src/consts';
import { LatLng } from 'leaflet';
import { SplitDirection } from 'obsidian';
import { DEFAULT_MAX_TILE_ZOOM } from 'src/consts';

export type PluginSettings = {
    defaultState: MapState;
    savedStates: MapState[];
    // Deprecated
    markerIcons?: Record<string, any>;
    markerIconRules?: MarkerIconRule[];
    zoomOnGoFromNote: number;
    // Deprecated
    tilesUrl?: string;
    // Deprecated
    chosenMapSource?: number;
    mapSources: TileSource[];
    chosenMapMode?: MapLightDark;
    // Deprecated
    defaultMapCenter?: LatLng;
    // Deprecated
    defaultZoom?: number;
    // Deprecated
    defaultTags?: string[];
    autoZoom: boolean;
    markerClickBehavior?: 'samePane' | 'secondPane' | 'alwaysNew';
    newPaneSplitDirection?: SplitDirection;
    newNoteNameFormat?: string;
    newNotePath?: string;
    newNoteTemplate?: string;
    // Deprecated
    snippetLines?: number;
    showNotePreview?: boolean;
    showClusterPreview?: boolean;
    debug?: boolean;
    openIn?: OpenInSettings[];
    urlParsingRules?: UrlParsingRule[];
    mapControls?: MapControls;
    maxClusterRadiusPixels: number;
    searchProvider?: 'osm' | 'google';
    geocodingApiKey?: string;
    saveHistory?: boolean;
};

/** Represents a logical state of the map, in separation from the map display */
export type MapState = {
    name: string;
    mapZoom: number;
    mapCenter: LatLng;
    /** The tags that the user specified (including the # character) */
    tags: string[];
    chosenMapSource?: number;
    forceHistorySave?: boolean;
};

export function mergeStates(state1: MapState, state2: MapState): MapState {
    // Overwrite an existing state with a new one, that may have null or partial values which need to be ignored
    // and taken from the existing state
    const clearedState = Object.fromEntries(
        Object.entries(state2).filter(([_, value]) => value != null)
    );
    return { ...state1, ...clearedState };
}

const xor = (a: any, b: any) => (a && !b) || (!a && b);

export function areStatesEqual(state1: MapState, state2: MapState) {
    if (!state1 || !state2) return false;
    if (xor(state1.mapCenter, state2.mapCenter)) return false;
    if (state1.mapCenter) {
        // To compare locations we need to construct an actual LatLng object because state1 may just
        // be a simple dict and not an actual LatLng
        const mapCenter1 = new LatLng(
            state1.mapCenter.lat,
            state1.mapCenter.lng
        );
        const mapCenter2 = new LatLng(
            state2.mapCenter.lat,
            state2.mapCenter.lng
        );
        if (mapCenter1.distanceTo(mapCenter2) > 1000) return false;
    }
    return (
        JSON.stringify(state1.tags) == JSON.stringify(state2.tags) &&
        state2.mapZoom == state2.mapZoom &&
        state1.chosenMapSource == state2.chosenMapSource
    );
}

export type MapLightDark = 'auto' | 'light' | 'dark';

export type TileSource = {
    name: string;
    urlLight: string;
    urlDark?: string;
    currentMode?: MapLightDark;
    preset?: boolean;
    ignoreErrors?: boolean;
    maxZoom?: number;
};

export type OpenInSettings = {
    name: string;
    urlPattern: string;
};

export type UrlParsingRule = {
    name: string;
    regExp: string;
    order: 'latFirst' | 'lngFirst';
    preset: boolean;
};

export type MapControls = {
    filtersDisplayed: boolean;
    viewDisplayed: boolean;
    presetsDisplayed: boolean;
};

export type MarkerIconRule = {
    ruleName: string;
    preset: boolean;
    iconDetails: any;
};

export const DEFAULT_SETTINGS: PluginSettings = {
    defaultState: {
        name: 'Default',
        mapZoom: 1.0,
        mapCenter: new LatLng(40.44694705960048, -180.70312500000003),
        tags: [],
        chosenMapSource: 0,
    },
    savedStates: [],
    markerIconRules: [
        {
            ruleName: 'default',
            preset: true,
            iconDetails: {
                prefix: 'fas',
                icon: 'fa-circle',
                markerColor: 'blue',
            },
        },
        {
            ruleName: '#trip',
            preset: false,
            iconDetails: {
                prefix: 'fas',
                icon: 'fa-hiking',
                markerColor: 'green',
            },
        },
        {
            ruleName: '#trip-water',
            preset: false,
            iconDetails: { prefix: 'fas', markerColor: 'blue' },
        },
        {
            ruleName: '#dogs',
            preset: false,
            iconDetails: { prefix: 'fas', icon: 'fa-paw' },
        },
    ],
    zoomOnGoFromNote: 15,
    autoZoom: true,
    markerClickBehavior: 'samePane',
    newNoteNameFormat: 'Location added on {{date:YYYY-MM-DD}}T{{date:HH-mm}}',
    showNotePreview: true,
    showClusterPreview: false,
    debug: false,
    openIn: [
        {
            name: 'Google Maps',
            urlPattern: 'https://maps.google.com/?q={x},{y}',
        },
    ],
    urlParsingRules: [
        {
            name: 'OpenStreetMap Show Address',
            regExp: /https:\/\/www.openstreetmap.org\S*query=([0-9\.\-]+%2C[0-9\.\-]+)\S*/
                .source,
            order: 'latFirst',
            preset: true,
        },
        {
            name: 'Generic Lat,Lng',
            regExp: /([0-9\.\-]+), ([0-9\.\-]+)/.source,
            order: 'latFirst',
            preset: true,
        },
    ],
    mapControls: {
        filtersDisplayed: true,
        viewDisplayed: true,
        presetsDisplayed: false,
    },
    maxClusterRadiusPixels: 20,
    searchProvider: 'osm',
    mapSources: [
        {
            name: 'CartoDB',
            urlLight:
                'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
            maxZoom: DEFAULT_MAX_TILE_ZOOM,
            preset: true,
        },
    ],
    // mapSources: [{name: 'OpenStreetMap', urlLight: consts.TILES_URL_OPENSTREETMAP}],
    chosenMapMode: 'auto',
    saveHistory: true,
};

export function convertLegacyMarkerIcons(settings: PluginSettings): boolean {
    if (settings.markerIcons) {
        settings.markerIconRules = [];
        for (let key in settings.markerIcons) {
            const newRule: MarkerIconRule = {
                ruleName: key,
                preset: key === 'default',
                iconDetails: settings.markerIcons[key],
            };
            settings.markerIconRules.push(newRule);
        }
        settings.markerIcons = null;
        return true;
    }
    return false;
}

export function convertLegacyTilesUrl(settings: PluginSettings): boolean {
    if (settings.tilesUrl) {
        settings.mapSources = [
            {
                name: 'Default',
                urlLight: settings.tilesUrl,
                maxZoom: DEFAULT_MAX_TILE_ZOOM,
            },
        ];
        settings.tilesUrl = null;
        return true;
    }
    return false;
}

export function convertLegacyDefaultState(settings: PluginSettings): boolean {
    if (
        settings.defaultTags ||
        settings.defaultZoom ||
        settings.defaultMapCenter ||
        settings.chosenMapSource
    ) {
        settings.defaultState = {
            name: 'Default',
            mapZoom:
                settings.defaultZoom || DEFAULT_SETTINGS.defaultState.mapZoom,
            mapCenter:
                settings.defaultMapCenter ||
                DEFAULT_SETTINGS.defaultState.mapCenter,
            tags: settings.defaultTags || DEFAULT_SETTINGS.defaultState.tags,
            chosenMapSource:
                settings.chosenMapSource ??
                DEFAULT_SETTINGS.defaultState.chosenMapSource,
        };
        settings.defaultTags =
            settings.defaultZoom =
            settings.defaultMapCenter =
            settings.chosenMapSource =
                null;
        return true;
    }
    return false;
}

export function removeLegacyPresets1(settings: PluginSettings): boolean {
    const googleMapsParsingRule = settings.urlParsingRules.findIndex(
        (rule) => rule.name == 'Google Maps' && rule.preset
    );
    if (googleMapsParsingRule > -1) {
        settings.urlParsingRules.splice(googleMapsParsingRule, 1);
        return true;
    }
    if (
        settings.mapSources.findIndex(
            (item) => item.name == DEFAULT_SETTINGS.mapSources[0].name
        ) === -1
    ) {
        settings.mapSources.unshift(DEFAULT_SETTINGS.mapSources[0]);
        return true;
    }
    return false;
}
