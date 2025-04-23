import { App, TFile } from 'obsidian';
import * as leaflet from 'leaflet';
import 'leaflet-extra-markers';
import 'leaflet-extra-markers/dist/css/leaflet.extra-markers.min.css';

import { type PluginSettings } from 'src/settings';
import { getIconFromRules, IconFactory } from 'src/markerIcons';
import { type MapState } from 'src/mapState';
import { BaseGeoLayer } from 'src/baseGeoLayer';
import { buildAndAppendFileMarkers, FileMarker } from 'src/fileMarker';

/**
 * Create FileMarker instances for all the files in the given list
 * @param files The list of file objects to find geolocations in.
 * @param settings The plugin settings
 * @param app The Obsidian App instance
 */
export async function buildMarkers(
    files: TFile[],
    settings: PluginSettings,
    app: App,
): Promise<BaseGeoLayer[]> {
    if (settings.debug) console.time('buildMarkers');
    let markers: BaseGeoLayer[] = [];
    for (const file of files) {
        await buildAndAppendFileMarkers(markers, file, settings, app);
    }
    if (settings.debug) console.timeEnd('buildMarkers');
    return markers;
}

/**
 * Add more data to the markers, e.g. icons and other items that were not needed for the stage of filtering
 * them. This includes edges based on links, if active.
 * Modifies the markers in-place.
 */
export function finalizeMarkers(
    markers: BaseGeoLayer[],
    state: MapState,
    settings: PluginSettings,
    iconFactory: IconFactory,
    app: App,
) {
    for (const marker of markers) {
        if (marker instanceof FileMarker) {
            marker.icon = getIconFromRules(
                marker.tags,
                settings.markerIconRules,
                iconFactory,
            );
        } else {
            throw 'Unsupported object type ' + marker.constructor.name;
        }
    }
}

/**
 * Maintains a global set of tags.
 * This is needed on top of Obsidian's own tag system because Map View also has inline tags.
 * These can be identical to Obsidian tags, but there may be inline tags that are not Obsidian tags, and
 * we want them to show on suggestions.
 */
export function cacheTagsFromMarkers(
    markers: BaseGeoLayer[],
    tagsSet: Set<string>,
) {
    for (const marker of markers) {
        marker.tags.forEach((tag) => tagsSet.add(tag));
    }
}
