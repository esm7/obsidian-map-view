import { TFile, type HeadingCache, type BlockCache } from 'obsidian';
import * as leaflet from 'leaflet';
import 'leaflet-extra-markers';
import 'leaflet-extra-markers/dist/css/leaflet.extra-markers.min.css';
import * as consts from 'src/consts';
import * as regex from 'src/regex';
import type MapViewPlugin from './main';

type MarkerId = string;

export abstract class BaseGeoLayer {
    public layerType:
        | 'fileMarker'
        | 'geojson'
        | 'floatingMarker'
        | 'floatingPath';
    /** The file object on which this location was found */
    public file: TFile;
    /** An ID to recognize the marker */
    public id: MarkerId;
    /** In the case of an inline location, the position within the file where the location was found */
    public fileLocation?: number;
    /** The leaflet layer on the map; overriden by child classes.
     * For every instance of Map View (specifically: every MapContainer), each logical layer has a different leaflet.Layer object.
     * Some layers may not exist in some MapContainers at all (e.g. if their filter does not include them).
     * Each map container has an ID, which it can use to find the leaflet.Layer object corresponding to a global BaseGeoLayer.
     */
    public abstract geoLayers: Map<number, leaflet.Layer>;
    /** In case of an inline location, the line within the file where the geolocation was found */
    public fileLine?: number;
    /** In case of an inline location, the file heading where the geolocation was found (if it's within a heading) */
    public fileHeading?: HeadingCache;
    /** In case of an inline location, the file block where the geolocation was found (if it's within a block) */
    public fileBlock?: BlockCache;
    /** In case of an inline location, geolocation match */
    public geolocationMatch?: RegExpMatchArray;
    /** Optional extra name that can be set for geolocation links (this is the link name rather than the file name) */
    public extraName?: string;
    /** Tags that this marker includes */
    public tags: string[] = [];
    /** A custom field used for optimizations */
    public touched: boolean;

    /**
     * Construct a new BaseGeoLayer object
     * @param file The file the geo data comes from
     */
    protected constructor(file: TFile) {
        this.file = file;
    }

    // /**
    //  * Init the leaflet geographic layer from the data
    //  * @param map
    //  */
    // abstract initGeoLayer(map: MapView): void;

    /** Generate a unique identifier for this layer */
    abstract generateId(): void;

    get name() {
        return this.extraName ?? this.file.basename;
    }

    /*
     * This is to be called when Obsidian signals us that a file has been renamed.
     */
    public renameContainingFile(file: TFile) {
        this.file = file;
    }

    /**
     * Is this geographic layer identical to the other object.
     * Used to compare to existing data to minimise creation.
     * @param other The other object to compare to
     */
    abstract isSame(other: BaseGeoLayer): boolean;

    /** Get the bounds of the data */
    abstract getBounds(): leaflet.LatLng[];

    public runDisplayRules(plugin: MapViewPlugin) {}
}

export type LayersMap = Map<MarkerId, BaseGeoLayer>;

/**
 * Make sure that the coordinates are valid world coordinates
 * -90 <= latitude <= 90 and -180 <= longitude <= 180
 * @param location
 */
export function verifyLocation(location: leaflet.LatLng) {
    if (
        location.lng < consts.LNG_LIMITS[0] ||
        location.lng > consts.LNG_LIMITS[1]
    )
        throw Error(`Lng ${location.lng} is outside the allowed limits`);
    if (
        location.lat < consts.LAT_LIMITS[0] ||
        location.lat > consts.LAT_LIMITS[1]
    )
        throw Error(`Lat ${location.lat} is outside the allowed limits`);
}

/**
 * Maintains a global set of tags.
 * This is needed on top of Obsidian's own tag system because Map View also has inline tags.
 * These can be identical to Obsidian tags, but there may be inline tags that are not Obsidian tags, and
 * we want them to show on suggestions.
 */
export function cacheTagsFromLayers(
    layers: BaseGeoLayer[],
    tagsSet: Set<string>,
) {
    for (const marker of layers) {
        marker.tags.forEach((tag) => tagsSet.add(tag));
    }
}

/**
 * Parse a list of inline tags (`tag:abc tag:bcd`) and add it to layer.tags in the form of ['#abc', '#bcd'].
 */
export function addTagsToLayer(layer: BaseGeoLayer, tagsString: string) {
    const tagRegex = regex.INLINE_TAG_IN_NOTE;
    const tags = tagsString.matchAll(tagRegex);
    for (const tag of tags)
        if (tag.groups.tag) layer.tags.push('#' + tag.groups.tag);
}
