import * as leaflet from 'leaflet';
import { type PathOptions } from 'leaflet';
import 'leaflet-extra-markers';
import 'leaflet-extra-markers/dist/css/leaflet.extra-markers.min.css';
import {
    App,
    TFile,
    getAllTags,
    type HeadingCache,
    type BlockCache,
    type LinkCache,
    parseLinktext,
    resolveSubpath,
    type FrontmatterLinkCache,
} from 'obsidian';
import wildcard from 'wildcard';
import { type GeoJSON } from 'geojson';
import * as toGeoJson from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';

import { BaseGeoLayer } from 'src/baseGeoLayer';
import { type IconOptions } from 'src/markerIcons';
import {
    djb2Hash,
    getHeadingAndBlockForFilePosition,
    hasFrontMatterLocations,
    verifyOrAddFrontMatterForInline,
} from 'src/utils';
import { type PluginSettings } from 'src/settings';
import * as regex from 'src/regex';
import MapViewPlugin from 'src/main';

/*
 * An object that represents a marker that is not stored in a note in the regular Map View manner,
 * most notably an internal GeoJSON marker that needs to be represented somehow.
 */
export class FloatingMarker extends BaseGeoLayer {
    // A floating marker corresponds to a specific leaflet.Layer object, and therefore does not
    // use this map
    public geoLayers: Map<number, leaflet.Layer> = null;
    public geoLayer: leaflet.Layer;
    public location: leaflet.LatLng;
    public header: string;
    public description: string;

    /**
     * Construct a new GeoJsonLayer object
     * @param file The file the pin comes from
     * @param location The geolocation
     */
    constructor(file: TFile, existingMarker: leaflet.Marker) {
        super(file);
        this.layerType = 'floatingMarker';
        this.generateId();
    }

    generateId() {
        // Not really used
        this.id = '';
    }

    getBounds(): leaflet.LatLng[] {
        return [this.location];
    }

    isSame(other: BaseGeoLayer): boolean {
        return (
            other instanceof FloatingMarker && other.geoLayer == this.geoLayer
        );
    }
}
