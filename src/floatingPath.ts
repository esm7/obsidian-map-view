import * as leaflet from 'leaflet';
import 'leaflet-extra-markers';
import 'leaflet-extra-markers/dist/css/leaflet.extra-markers.min.css';
import { TFile } from 'obsidian';
import { type GeoJSON } from 'geojson';
import { type RoutingResult } from 'src/routing';

import { BaseGeoLayer } from 'src/baseGeoLayer';

/*
 * An object that represents a path that is not stored in a note in the regular Map View manner,
 * like a calculated route
 */
export class FloatingPath extends BaseGeoLayer {
    // A floating path corresponds to a specific GeoJSON object, and therefore does not use this map.
    public geoLayers: Map<number, leaflet.Layer> = null;
    public geoLayer: leaflet.Layer;
    public geojson: GeoJSON;
    public header: string;
    public description: string;
    public routingResult: RoutingResult;

    constructor(file: TFile, geojson: GeoJSON, existingLayer?: leaflet.Layer) {
        super(file);
        this.layerType = 'floatingPath';
        this.geoLayer = existingLayer;
        this.geojson = geojson;
        this.generateId();
    }

    generateId() {
        // Not really used
        this.id = '';
    }

    getBounds(): leaflet.LatLng[] {
        if (this.geoLayers.size > 0) {
            const firstLayer = this.geoLayers.values().next().value;
            if (firstLayer) {
                return [firstLayer.getBounds()];
            }
        }
        return [];
    }

    isSame(other: BaseGeoLayer): boolean {
        return (
            other instanceof FloatingPath &&
            other.geojson === this.geojson &&
            other.geoLayer === this.geoLayer
        );
    }
}
