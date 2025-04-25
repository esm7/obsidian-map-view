import * as leaflet from 'leaflet';
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

import { BaseGeoLayer, verifyLocation } from 'src/baseGeoLayer';
import { type IconOptions } from 'src/markerIcons';
import { djb2Hash, getHeadingAndBlockForFilePosition } from 'src/utils';
import { type PluginSettings } from 'src/settings';
import * as regex from 'src/regex';

export const GEOJSON_FILE_FILTER = ['gpx', 'geojson'];

/** An object that represents a single marker in a file, which is either a complete note with a geolocation, or an inline geolocation inside a note */
export class GeoJsonLayer extends BaseGeoLayer {
    public location: leaflet.LatLng;
    public geojson: GeoJSON;

    /**
     * Construct a new GeoJsonLayer object
     * @param file The file the pin comes from
     * @param location The geolocation
     */
    constructor(file: TFile) {
        super(file);
        this.layerType = 'geojson';
        this.generateId();
    }

    generateId() {
        this.id = generateLayerId(
            this.file.name,
            this.fileLocation,
            this.fileLine,
        );
    }

    getBounds(): leaflet.LatLng[] {
        return [this.location];
    }

    isSame(other: BaseGeoLayer): boolean {
        return (
            other instanceof GeoJsonLayer &&
            this.file.name === other.file.name &&
            this.fileLocation === other.fileLocation &&
            this.fileLine === other.fileLine
        );
    }
}

export type FileWithGeoJsons = {
    file: TFile;
    layers: GeoJsonLayer[];
};

function generateLayerId(
    fileName: string,
    fileLocation?: number,
    fileLine?: number,
): string {
    return (
        djb2Hash(fileName) +
        'loc-' +
        (fileLocation
            ? fileLocation
            : fileLine
              ? 'nofileloc' + fileLine
              : 'nofileline')
    );
}

export async function buildGeoJsonLayers(
    files: TFile[],
    settings: PluginSettings,
    app: App,
): Promise<BaseGeoLayer[]> {
    return [];
}
