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

import { BaseGeoLayer, verifyLocation } from 'src/baseGeoLayer';
import { type IconOptions } from 'src/markerIcons';
import {
    djb2Hash,
    hasFrontMatterLocations,
    verifyOrAddFrontMatterForInline,
    appendToNoteAtHeadingOrEnd,
} from 'src/utils';
import { type PluginSettings } from 'src/settings';
import * as regex from 'src/regex';
import MapViewPlugin from 'src/main';

export const GEOJSON_FILE_FILTER = ['gpx', 'geojson', 'md', 'kml', 'tcx'];

/*
 * An object that represents a GeoJSON layer, e.g. a path or a shape.
 * The GeoJSON may contain internal markers, which will be treated as "floating" markers.
 */
export class GeoJsonLayer extends BaseGeoLayer {
    public geoLayers: Map<number, leaflet.Layer> = new Map();
    public location: leaflet.LatLng;
    public geojson: GeoJSON;
    public pathOptions: PathOptions = {};

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
    plugin: MapViewPlugin,
): Promise<BaseGeoLayer[]> {
    let layers: BaseGeoLayer[] = [];
    if (settings.debug) console.time('buildGeoJsonLayers');
    const domParser = new DOMParser();
    for (const file of files) {
        if (file.extension === 'geojson') {
            try {
                const content = await app.vault.read(file);
                const layer = new GeoJsonLayer(file);
                layer.geojson = JSON.parse(content);
                layers.push(layer);
            } catch (e) {
                console.log(`Error parsing geojson in ${file.name}`, e);
            }
        } else if (file.extension === 'md') {
            const fileCache = app.metadataCache.getFileCache(file);
            const frontMatter = fileCache?.frontmatter;
            if (hasFrontMatterLocations(frontMatter, fileCache, settings)) {
                // Search for an inline GeoJSON
                const content = await app.vault.read(file);
                const matches = content.matchAll(regex.INLINE_GEOJSON);
                for (const match of matches) {
                    try {
                        const geoJsonString = match.groups?.content;
                        if (geoJsonString) {
                            const geoJson = JSON.parse(geoJsonString);
                            if (Object.keys(geoJson).length > 0) {
                                const layer = new GeoJsonLayer(file);
                                layer.geojson = geoJson;
                                layer.fileLocation = match.index;
                                layer.fileLine =
                                    content
                                        .substring(0, layer.fileLocation)
                                        .split('\n').length - 1;
                                // TODO add file block and heading
                                layer.generateId();
                                layers.push(layer);
                            }
                        }
                    } catch (e) {
                        console.log(
                            `Error converting inline GeoJSON in file ${file.name}:`,
                            e,
                        );
                    }
                }
            }
        } else if (
            file.extension === 'gpx' ||
            file.extension === 'kml' ||
            file.extension === 'tcx'
        ) {
            const content = await app.vault.read(file);
            try {
                const doc = domParser.parseFromString(content, 'text/xml');
                const geoJson =
                    file.extension === 'gpx'
                        ? toGeoJson.gpx(doc)
                        : file.extension === 'kml'
                          ? toGeoJson.kml(doc)
                          : file.extension === 'tcx'
                            ? toGeoJson.tcx(doc)
                            : null;
                const layer = new GeoJsonLayer(file);
                layer.geojson = geoJson;
                layer.generateId();
                layers.push(layer);
            } catch (e) {
                console.log(`Error reading path from ${file.name}:`, e);
            }
        }
    }
    if (settings.debug) console.timeLog('buildGeoJsonLayers');
    // Calculate display rules
    for (const layer of layers) {
        const [_, pathOptions] = plugin.displayRulesCache.runOn(layer);
        (layer as GeoJsonLayer).pathOptions = pathOptions;
    }
    if (settings.debug) console.timeEnd('buildGeoJsonLayers');
    return layers;
}

export async function createGeoJsonInFile(
    layer: GeoJSON,
    file: TFile,
    heading: HeadingCache | null,
    app: App,
    settings: PluginSettings,
) {
    const geoJsonString = `
\`\`\`geojson
${JSON.stringify(layer)}
\`\`\`\n`;
    await appendToNoteAtHeadingOrEnd(file, heading, geoJsonString, app);
    await verifyOrAddFrontMatterForInline(app, null, file, settings);
}
