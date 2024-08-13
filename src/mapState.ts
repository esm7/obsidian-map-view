import { WorkspaceLeaf } from 'obsidian';
import * as leaflet from 'leaflet';
import * as querystring from 'query-string';
import { ViewSettings } from './mapContainer';

/** Represents a logical state of the map, in separation from the map display */
export type MapState = {
    name: string;
    mapZoom: number;
    mapCenter: leaflet.LatLng;
    /** The query that the user entered */
    query: string;
    /** If true, the query was found to be erroneous */
    queryError?: boolean;
    chosenMapSource?: number;
    forceHistorySave?: boolean;
    followActiveNote?: boolean;
    embeddedHeight?: number;
    /** Ignore the zoom level and force auto-fit */
    autoFit?: boolean;
    /** Do not allow panning & zooming the map */
    lock?: boolean;
    /** Whether to show links as edges on the map */
    showLinks?: boolean;
    /** Color to use for edges */
    linkColor?: string;
    /** Marker labels */
    markerLabels?: 'off' | 'left' | 'right';
};

/** Fields that are deprecated */
export type LegacyMapState = MapState & { tags: string[] };

export function copyState(state: MapState): MapState {
    return Object.assign({}, state);
}

export function mergeStates(
    state1: MapState,
    state2: Partial<MapState>
): MapState {
    // Overwrite an existing state with a new one, that may have null or partial values which need to be ignored
    // and taken from the existing state
    const clearedState = Object.fromEntries(
        Object.entries(state2).filter(([_, value]) => value != null)
    );
    return structuredClone({ ...state1, ...clearedState });
}

const xor = (a: any, b: any) => (a && !b) || (!a && b);

export function areStatesEqual(state1: MapState, state2: MapState) {
    if (!state1 || !state2) return false;
    if (xor(state1.mapCenter, state2.mapCenter)) return false;
    if (state1.mapCenter) {
        // To compare locations we need to construct an actual LatLng object because state1 may just
        // be a simple dict and not an actual LatLng
        const mapCenter1 = new leaflet.LatLng(
            state1.mapCenter.lat,
            state1.mapCenter.lng
        );
        const mapCenter2 = new leaflet.LatLng(
            state2.mapCenter.lat,
            state2.mapCenter.lng
        );
        if (mapCenter1.distanceTo(mapCenter2) > 1000) return false;
    }
    return (
        state1.query === state2.query &&
        state1.mapZoom === state2.mapZoom &&
        state1.chosenMapSource === state2.chosenMapSource &&
        state1.embeddedHeight === state2.embeddedHeight &&
        state1.autoFit === state2.autoFit &&
        state1.lock === state2.lock &&
        state1.linkColor == state2.linkColor &&
        state1.showLinks == state2.showLinks &&
        state1.markerLabels == state2.markerLabels
    );
}

export function stateToRawObject(state: MapState) {
    return {
        name: state.name,
        mapZoom: state.mapZoom,
        centerLat: state.mapCenter.lat,
        centerLng: state.mapCenter.lng,
        query: state.query,
        chosenMapSource: state.chosenMapSource,
        autoFit: state.autoFit,
        lock: state.lock,
        showLinks: state.showLinks,
        linkColor: state.linkColor,
        markerLabels: state.markerLabels,
        ...(state.embeddedHeight && { embeddedHeight: state.embeddedHeight }),
    };
}

export function stateToUrl(state: MapState) {
    return querystring.stringify(stateToRawObject(state));
}

export function stateFromParsedUrl(obj: any) {
    return {
        name: obj.name,
        mapZoom: obj.mapZoom ? parseInt(obj.mapZoom) : null,
        mapCenter:
            obj.centerLat && obj.centerLng
                ? new leaflet.LatLng(
                      parseFloat(obj.centerLat),
                      parseFloat(obj.centerLng)
                  )
                : null,
        query: obj.query,
        chosenMapSource:
            obj.chosenMapSource != null ? parseInt(obj.chosenMapSource) : null,
        autoFit: obj?.autoFit,
        lock: obj?.lock,
        showLinks: obj.showLinks != null ? obj.showLinks : false,
        linkColor: obj?.linkColor,
        markerLabels: obj?.markerLabels,
        ...(obj.embeddedHeight && {
            embeddedHeight: parseInt(obj.embeddedHeight),
        }),
    } as MapState;
}

export function getCodeBlock(
    state: MapState,
    customViewSettings?: Partial<ViewSettings>
) {
    const params = JSON.stringify({
        ...stateToRawObject(state),
        ...(customViewSettings ? { customViewSettings } : {}),
    });
    const block = `\`\`\`mapview
${params}
\`\`\``;
    return block;
}
