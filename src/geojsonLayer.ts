import * as leaflet from 'leaflet';
import { type PathOptions } from 'leaflet';
import 'leaflet-extra-markers';
import 'leaflet-extra-markers/dist/css/leaflet.extra-markers.min.css';
import { App, TFile, Notice } from 'obsidian';
import { type GeoJSON } from 'geojson';
import * as toGeoJson from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';

import { BaseGeoLayer, addTagsToLayer } from 'src/baseGeoLayer';
import { type IconOptions } from 'src/markerIcons';
import {
    djb2Hash,
    hasFrontMatterLocations,
    verifyOrAddFrontMatterForInline,
    appendToNoteAtHeadingOrEnd,
    makeInlineTagsList,
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
    public text: string = '';
    public sourceType: 'geojson' | 'gpx';

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

    runDisplayRules(plugin: MapViewPlugin) {
        const [_, pathOptions] = plugin.displayRulesCache.runOn(this);
        this.pathOptions = pathOptions;
    }

    populateMetadata() {
        let properties: any = (this.geojson as any)?.properties;
        if (
            !properties &&
            (this.geojson as any)?.features &&
            (this.geojson as any).features.length > 0
        ) {
            properties = (this.geojson as any).features[0]?.properties;
        }
        if (properties) {
            this.extraName = properties?.name ?? '';
            this.text = properties?.desc ?? '';
        }
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
                layer.sourceType = 'geojson';
                layer.populateMetadata();
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
                                layer.populateMetadata();
                                layer.generateId();
                                if (match.groups.tags)
                                    addTagsToLayer(layer, match.groups.tags);
                                layer.sourceType = 'geojson';
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
                layer.populateMetadata();
                layer.generateId();
                layer.sourceType = 'gpx';
                layers.push(layer);
            } catch (e) {
                console.log(`Error reading path from ${file.name}:`, e);
            }
        }
    }
    if (settings.debug) console.timeLog('buildGeoJsonLayers');
    // Calculate display rules
    for (const layer of layers) {
        layer.runDisplayRules(plugin);
    }
    if (settings.debug) console.timeEnd('buildGeoJsonLayers');
    return layers;
}

function geoJsonString(geojson: GeoJSON, tags: string[]) {
    let geoJsonString = `\`\`\`geojson
${JSON.stringify(geojson)}
\`\`\`\n`;
    if (tags.length > 0) {
        geoJsonString += makeInlineTagsList(tags) + '\n';
    }
    return geoJsonString;
}

export async function createGeoJsonInFile(
    geojson: GeoJSON,
    file: TFile,
    heading: string | null,
    tags: string[],
    app: App,
    settings: PluginSettings,
) {
    await appendToNoteAtHeadingOrEnd(
        file,
        heading,
        '\n' + geoJsonString(geojson, tags),
        app,
    );
    await verifyOrAddFrontMatterForInline(app, null, file, settings);
}

export async function editGeoJson(
    layer: GeoJsonLayer,
    geojson: GeoJSON,
    settings: PluginSettings,
    app: App,
) {
    if (layer.sourceType !== 'geojson') {
        new Notice(
            'The edit tool currently supports only GeoJSON objects. Your changes will not be saved.',
        );
        return;
    }
    if (layer.fileLocation) {
        // Step 1: delete the GeoJson from the file
        const fileContent = await app.vault.read(layer.file);
        const contentBeforeGeoJson = fileContent.substring(
            0,
            layer.fileLocation,
        );
        const contentAfterGeoJson = fileContent.substring(layer.fileLocation);
        // Find the GeoJSON to remove
        const match = contentAfterGeoJson.match(regex.INLINE_GEOJSON);
        if (!match) {
            console.log(
                `No GeoJSON block found at the specified location in ${layer.file.name}`,
            );
            return;
        }
        const matchEnd = match[0].length;
        const newContent =
            contentBeforeGeoJson +
            geoJsonString(geojson, layer.tags) +
            contentAfterGeoJson.substring(matchEnd);
        await app.vault.modify(layer.file, newContent);
    } else {
        await app.vault.modify(layer.file, JSON.stringify(geojson));
    }
}
