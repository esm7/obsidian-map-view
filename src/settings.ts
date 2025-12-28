import { LatLng, type PathOptions } from 'leaflet';
import { type SplitDirection, Notice } from 'obsidian';
import { type MapState, type LegacyMapState, mergeStates } from 'src/mapState';
import MapViewPlugin from 'src/main';
import * as consts from 'src/consts';

export type GeoHelperType = 'url' | 'commandline';
export type LegacyOpenBehavior = 'samePane' | 'secondPane' | 'alwaysNew';
export type OpenBehavior =
    | 'replaceCurrent'
    | 'dedicatedPane'
    | 'alwaysNewPane'
    | 'dedicatedTab'
    | 'alwaysNewTab'
    | 'lastUsed';
export type LinkNamePopupBehavior = 'never' | 'always' | 'mobileOnly';

export type PluginSettings = {
    defaultState: MapState;
    // Since the plugin evolves with time, we assume saved states to be partial, i.e. they may not include
    // all the fields of a full map state.
    savedStates: Partial<MapState[]>;
    displayRules: DisplayRule[];
    zoomOnGoFromNote: number;
    mapSources: TileSource[];
    frontMatterKey: string;
    chosenMapMode?: MapLightDark;
    autoZoom: boolean;
    onlyOneExpanded: boolean;
    letZoomBeyondMax: boolean;
    markerClickBehavior: OpenBehavior;
    markerCtrlClickBehavior: OpenBehavior;
    markerMiddleClickBehavior: OpenBehavior;
    openMapBehavior: OpenBehavior;
    openMapCtrlClickBehavior: OpenBehavior;
    openMapMiddleClickBehavior: OpenBehavior;
    newPaneSplitDirection: SplitDirection;
    newNoteNameFormat: string;
    newNotePath: string;
    newNoteTemplate: string;
    showNoteNamePopup: boolean;
    showLinkNameInPopup: LinkNamePopupBehavior;
    showNativeObsidianHoverPopup: boolean;
    showNotePreview: boolean;
    showClusterPreview: boolean;
    debug: boolean;
    openIn: OpenInSettings[];
    urlParsingRules: UrlParsingRule[];
    mapControlsSections: MapControlsSections;
    mapControlsMinimized: boolean;
    maxClusterRadiusPixels: number;
    searchProvider: 'osm' | 'google';
    osmUser: string;
    searchDelayMs: number;
    geocodingApiKey: string;
    useGooglePlacesNew2025: boolean;
    googlePlacesDataFields: string;
    saveHistory: boolean;
    queryForFollowActiveNote: string;
    supportRealTimeGeolocation: boolean;
    fixFrontMatterOnPaste: boolean;
    geoHelperPreferApp: boolean;
    geoHelperType: GeoHelperType;
    geoHelperCommand: string;
    geoHelperUrl: string;
    tagForGeolocationNotes: string;
    handleGeolinksInNotes: boolean;
    handlePathEmbeds: boolean;
    showGeolinkPreview: boolean;
    zoomOnGeolinkPreview: number;
    handleGeolinkContextMenu: boolean;
    routingUrl: string;
    routingGraphHopperApiKey: string;
    routingGraphHopperProfiles: string;
    routingGraphHopperExtra: any;
    cacheAllTiles: boolean;
    offlineMaxTileAgeMonths: number;
    offlineMaxStorageGb: number;
    loadLayersAhead: boolean;
    handleGeoJsonCodeBlocks: boolean;
};

export type DepracatedFields = {
    markerIcons?: Record<string, any>;
    markerIconRules?: MarkerIconRule[];
    tilesUrl?: string;
    chosenMapSource?: number;
    defaultMapCenter?: LatLng;
    defaultZoom?: number;
    defaultTags?: string[];
    snippetLines?: number;
    useGooglePlaces?: boolean;
};

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

export type UrlParsingRuleType = 'latLng' | 'lngLat' | 'fetch';
export type UrlParsingContentType = 'latLng' | 'lngLat' | 'googlePlace';

export type UrlParsingRule = {
    name: string;
    regExp: string;
    ruleType: UrlParsingRuleType;
    contentParsingRegExp?: string;
    contentType?: UrlParsingContentType;
    preset: boolean;
};

export type LegacyUrlParsingRule = UrlParsingRule & {
    order: 'latFirst' | 'lngFirst';
};

export type MapControlsSections = {
    filtersDisplayed: boolean;
    viewDisplayed: boolean;
    linksDisplayed: boolean;
    presetsDisplayed: boolean;
    editDisplayed: boolean;
};

export type MarkerIconRule = {
    ruleName: string;
    preset: boolean;
    iconDetails: any;
};

export type IconBadgeOptions = {
    badge?: string;
    textColor?: string;
    backColor?: string;
    cssFilters?: string;
    border?: string;
};

export type DisplayRule = {
    query: string;
    preset: boolean;
    iconDetails?: any;
    pathOptions?: PathOptions;
    badgeOptions?: IconBadgeOptions;
};

export const EMPTY_DISPLAY_RULE: Partial<DisplayRule> = {
    iconDetails: { icon: '', markerColor: '', shape: '', opacity: 1.0 },
    pathOptions: { color: '', weight: 0, opacity: 0 },
    badgeOptions: {
        badge: '',
        textColor: '',
        backColor: '',
        cssFilters: '',
        border: '',
    },
};

export const DEFAULT_SETTINGS: PluginSettings = {
    defaultState: {
        name: 'Default',
        mapZoom: 1.0,
        mapCenter: new LatLng(40.44694705960048, -180.70312500000003),
        query: '',
        queryError: false,
        chosenMapSource: 0,
        forceHistorySave: false,
        followActiveNote: false,
        embeddedHeight: 300,
        autoFit: false,
        lock: false,
        showLinks: false,
        linkColor: 'red',
        markerLabels: 'off',
        editMode: false,
    },
    savedStates: [],
    displayRules: [
        {
            query: '',
            preset: true,
            iconDetails: {
                prefix: 'fas',
                icon: 'fa-circle',
                markerColor: 'blue',
                opacity: 1.0,
            },
            pathOptions: {
                color: 'blue',
                weight: 5,
                opacity: 0.8,
            },
            badgeOptions: {},
        },
        {
            query: 'tag:#trip',
            preset: false,
            iconDetails: {
                prefix: 'fas',
                icon: 'fa-hiking',
                markerColor: 'green',
            },
        },
        {
            query: 'tag:#trip-water',
            preset: false,
            iconDetails: { prefix: 'fas', markerColor: 'blue' },
        },
        {
            query: 'tag:#dogs',
            preset: false,
            iconDetails: { prefix: 'fas', icon: 'fa-paw' },
        },
    ],
    zoomOnGoFromNote: 15,
    autoZoom: true,
    onlyOneExpanded: true,
    markerClickBehavior: 'replaceCurrent',
    markerCtrlClickBehavior: 'dedicatedPane',
    markerMiddleClickBehavior: 'dedicatedTab',
    openMapBehavior: 'replaceCurrent',
    openMapCtrlClickBehavior: 'dedicatedPane',
    openMapMiddleClickBehavior: 'dedicatedTab',
    newPaneSplitDirection: 'vertical',
    newNoteNameFormat: 'Location added on {{date:YYYY-MM-DD}}T{{date:HH-mm}}',
    newNotePath: '',
    newNoteTemplate: '',
    showNoteNamePopup: true,
    showLinkNameInPopup: 'always',
    showNativeObsidianHoverPopup: false,
    showNotePreview: true,
    showClusterPreview: true,
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
            ruleType: 'latLng',
            preset: true,
        },
        {
            name: 'Generic Lat,Lng',
            regExp: /([0-9\.\-]+),\s*([0-9\.\-]+)/.source,
            ruleType: 'latLng',
            preset: true,
        },
        {
            name: 'Geolocation Link',
            regExp: /\[.*\]\(geo:([0-9\.\-]+),([0-9\.\-]+)\)/.source,
            ruleType: 'latLng',
            preset: true,
        },
    ],
    mapControlsSections: {
        filtersDisplayed: true,
        viewDisplayed: true,
        linksDisplayed: false,
        presetsDisplayed: false,
        editDisplayed: false,
    },
    mapControlsMinimized: false,
    maxClusterRadiusPixels: 25,
    searchProvider: 'osm',
    osmUser: '',
    searchDelayMs: 250,
    geocodingApiKey: '',
    useGooglePlacesNew2025: false,
    googlePlacesDataFields: '',
    mapSources: [
        {
            name: 'CartoDB',
            urlLight:
                'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
            preset: true,
        },
    ],
    frontMatterKey: 'location',
    chosenMapMode: 'auto',
    saveHistory: true,
    letZoomBeyondMax: false,
    queryForFollowActiveNote: 'path:"$PATH$"',
    supportRealTimeGeolocation: false,
    fixFrontMatterOnPaste: true,
    geoHelperPreferApp: false,
    geoHelperType: 'url',
    geoHelperCommand: 'chrome',
    geoHelperUrl: 'https://esm7.github.io/obsidian-geo-helper/',
    tagForGeolocationNotes: '',
    handleGeolinksInNotes: true,
    handlePathEmbeds: true,
    showGeolinkPreview: false,
    zoomOnGeolinkPreview: 10,
    handleGeolinkContextMenu: true,
    routingUrl:
        'https://www.google.com/maps/dir/?api=1&origin={x0},{y0}&destination={x1},{y1}',
    routingGraphHopperApiKey: '',
    routingGraphHopperProfiles: 'foot, bike, car',
    routingGraphHopperExtra: {},
    cacheAllTiles: true,
    // 0 means never automatically purge
    offlineMaxTileAgeMonths: 6,
    // 0 means never automatically purge
    offlineMaxStorageGb: 2,
    loadLayersAhead: true,
    handleGeoJsonCodeBlocks: true,
};

export function convertLegacyMarkerIcons(
    settings: PluginSettings & DepracatedFields,
): boolean {
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
        delete settings.markerIcons;
        return true;
    }
    return false;
}

export function convertLegacyTilesUrl(
    settings: PluginSettings & DepracatedFields,
): boolean {
    if (settings.tilesUrl) {
        settings.mapSources = [
            {
                name: 'Default',
                urlLight: settings.tilesUrl,
                maxZoom: consts.DEFAULT_MAX_TILE_ZOOM,
            },
        ];
        settings.tilesUrl = null;
        return true;
    }
    return false;
}

export function convertLegacyDefaultState(
    settings: PluginSettings & DepracatedFields,
): boolean {
    if (
        settings.defaultTags ||
        settings.defaultZoom ||
        settings.defaultMapCenter ||
        settings.chosenMapSource
    ) {
        settings.defaultState = mergeStates(DEFAULT_SETTINGS.defaultState, {
            name: 'Default',
            mapZoom:
                settings.defaultZoom || DEFAULT_SETTINGS.defaultState.mapZoom,
            mapCenter:
                settings.defaultMapCenter ||
                DEFAULT_SETTINGS.defaultState.mapCenter,
            query:
                settings.defaultTags.join(' OR ') ||
                DEFAULT_SETTINGS.defaultState.query,
            chosenMapSource:
                settings.chosenMapSource ??
                DEFAULT_SETTINGS.defaultState.chosenMapSource,
        });
        settings.defaultTags =
            settings.defaultZoom =
            settings.defaultMapCenter =
            settings.chosenMapSource =
                null;
        return true;
    }
    return false;
}

export function removeLegacyPresets1(
    settings: PluginSettings & DepracatedFields,
): boolean {
    const googleMapsParsingRule = settings.urlParsingRules.findIndex(
        (rule) => rule.name == 'Google Maps' && rule.preset,
    );
    if (googleMapsParsingRule > -1) {
        settings.urlParsingRules.splice(googleMapsParsingRule, 1);
        return true;
    }
    if (
        settings.mapSources.findIndex(
            (item) => item.name == DEFAULT_SETTINGS.mapSources[0].name,
        ) === -1
    ) {
        settings.mapSources.unshift(DEFAULT_SETTINGS.mapSources[0]);
        return true;
    }
    return false;
}

export function convertTagsToQueries(settings: PluginSettings): boolean {
    let changed = false;
    let defaultState = settings.defaultState as LegacyMapState;
    if (defaultState.tags && defaultState.tags.length > 0) {
        defaultState.query = defaultState.tags.join(' OR ');
        delete defaultState.tags;
        changed = true;
    }
    for (let preset of settings.savedStates) {
        let legacyPreset = preset as LegacyMapState;
        if (legacyPreset.tags && legacyPreset.tags.length > 0) {
            legacyPreset.query = legacyPreset.tags.join(' OR ');
            delete legacyPreset.tags;
            changed = true;
        }
    }
    return changed;
}

export function convertUrlParsingRules1(settings: PluginSettings): boolean {
    let changed = false;
    for (let rule of settings.urlParsingRules) {
        const legacyRule = rule as LegacyUrlParsingRule;
        if (legacyRule.order) {
            rule.ruleType =
                legacyRule.order === 'latFirst' ? 'latLng' : 'lngLat';
            delete legacyRule.order;
            changed = true;
        }
    }
    return changed;
}

export function convertLegacyOpenBehavior(settings: PluginSettings): boolean {
    let changed = false;
    const legacyMarkerClick = settings.markerClickBehavior as any;
    if (legacyMarkerClick === 'samePane') {
        settings.markerClickBehavior = 'replaceCurrent';
        settings.markerCtrlClickBehavior = 'dedicatedPane';
        changed = true;
    } else if (legacyMarkerClick === 'secondPane') {
        settings.markerClickBehavior = 'dedicatedPane';
        settings.markerCtrlClickBehavior = 'replaceCurrent';
        changed = true;
    } else if (legacyMarkerClick === 'alwaysNew') {
        settings.markerClickBehavior = 'alwaysNewPane';
        settings.markerCtrlClickBehavior = 'replaceCurrent';
        changed = true;
    }
    return changed;
}

export function convertLegacyGooglePlaces(settings: PluginSettings): boolean {
    let changed = false;
    if ((settings as DepracatedFields).useGooglePlaces) {
        (settings as DepracatedFields).useGooglePlaces = false;
        settings.useGooglePlacesNew2025 = true;
        changed = true;
        new Notice(
            'IMPORTANT! Map View now uses the new "Google Places (New)" API, which requires that you update your API key. See the "Migrating to Google Places API (New)" section of the README. Your geo searches might fail until you do this update!',
            0,
        );
    }
    return changed;
}

export function convertMarkerIconRulesToDisplayRules(
    settings: PluginSettings & DepracatedFields,
) {
    let changed = false;
    if (settings.markerIconRules && settings.markerIconRules.length > 0) {
        // Make sure not to add to any defaults
        settings.displayRules = [];
        for (const rule of settings.markerIconRules) {
            let displayRule: DisplayRule = null;
            if (rule.preset) {
                // If it's the user's default rule we're converting, take the icon details, then the path options and the badge options
                // from the plugin's default (as the user doesn't have any yet)
                const defaultRule = DEFAULT_SETTINGS.displayRules.find(
                    (rule) => rule.preset == true,
                );
                displayRule = {
                    query: '',
                    preset: true,
                    iconDetails: rule.iconDetails,
                    pathOptions: defaultRule.pathOptions,
                    badgeOptions: defaultRule.badgeOptions,
                };
            } else if (rule.ruleName.trim().length > 0) {
                displayRule = {
                    query: `tag:${rule.ruleName}`,
                    preset: false,
                    iconDetails: rule.iconDetails,
                };
            }
            if (displayRule) {
                settings.displayRules.push(displayRule);
                changed = true;
            }
        }
    }
    // Remove empty display rules that are not the default, or ones with an empty tag, which might
    // have been the result of a faulty conversion (see https://github.com/esm7/obsidian-map-view/issues/359)
    const fixedRules = settings.displayRules.filter((rule) => {
        const query = rule.query.trim();
        return (
            rule.preset === true ||
            (query.length > 0 && query !== 'tag:' && query !== 'tag:#')
        );
    });
    if (fixedRules.length != settings.displayRules.length) {
        changed = true;
        settings.displayRules = fixedRules;
    }
    delete settings.markerIconRules;
    return changed;
}

/*
 * The more Map View evolves, fields get added to the MapState class, leading to old saved states having
 * missing fields.
 * This completes missing fields from the default settings.
 */
function completePartialSavedStates(settings: PluginSettings) {
    const newStates: MapState[] = [];
    for (const savedState of settings.savedStates) {
        const state = mergeStates(DEFAULT_SETTINGS.defaultState, savedState);
        newStates.push(state);
    }
    settings.savedStates = newStates;
}

export async function convertLegacySettings(
    settings: PluginSettings,
    plugin: MapViewPlugin,
) {
    let changed = false;
    // Convert old settings formats that are no longer supported
    if (convertLegacyMarkerIcons(settings)) {
        changed = true;
        new Notice(
            'Map View: legacy marker icons were converted to the new format',
        );
    }
    if (convertLegacyTilesUrl(settings)) {
        changed = true;
        new Notice(
            'Map View: legacy tiles URL was converted to the new format',
        );
    }
    if (convertLegacyDefaultState(settings)) {
        changed = true;
        new Notice(
            'Map View: legacy default state was converted to the new format',
        );
    }
    if (removeLegacyPresets1(settings)) {
        changed = true;
        new Notice(
            'Map View: legacy URL parsing rules and/or map sources were converted. See the release notes',
        );
    }
    if (convertTagsToQueries(settings)) {
        changed = true;
        new Notice(
            'Map View: legacy tag queries were converted to the new query format',
        );
    }
    if (convertUrlParsingRules1(settings)) {
        changed = true;
        new Notice(
            'Map View: URL parsing rules were converted to the new format',
        );
    }
    if (convertLegacyOpenBehavior(settings)) {
        changed = true;
        new Notice(
            'Map View: marker click settings were converted to the new settings format (check the settings for new options!)',
        );
    }
    if (convertLegacyGooglePlaces(settings)) changed = true;
    if (convertMarkerIconRulesToDisplayRules(settings)) {
        changed = true;
        new Notice(
            'Map View: legacy marker icon rules were converted to the new "display rules" format.',
        );
    }

    completePartialSavedStates(settings);

    if (changed) plugin.saveSettings();
}
