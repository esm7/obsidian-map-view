import {
    App,
    TFile,
    getAllTags,
    CachedMetadata,
    HeadingCache,
    BlockCache,
    LinkCache,
    parseLinktext,
    resolveSubpath,
} from 'obsidian';
import * as leaflet from 'leaflet';
import 'leaflet-extra-markers';
import 'leaflet-extra-markers/dist/css/leaflet.extra-markers.min.css';

import { PluginSettings } from 'src/settings';
import { getIconFromRules, IconFactory, IconOptions } from 'src/markerIcons';
import { MapState } from 'src/mapState';
import * as consts from 'src/consts';
import * as regex from 'src/regex';
import { djb2Hash, getHeadingAndBlockForFilePosition } from 'src/utils';
import wildcard from 'wildcard';
import { settings } from 'cluster';

type MarkerId = string;

export type FileWithMarkers = {
    file: TFile;
    markers: FileMarker[];
};

export class Edge {
    /** The first location of the edge */
    public marker1: FileMarker;
    /** The second location of the edge */
    public marker2: FileMarker;
    /** The leaflet polyline of the edge. An edge may exist only logically without a polyline (after being generated
     * from the map markers) */
    public polyline?: leaflet.Polyline;

    constructor(
        marker1: FileMarker,
        marker2: FileMarker,
        polyline: leaflet.Polyline = null
    ) {
        this.marker1 = marker1;
        this.marker2 = marker2;
        this.polyline = polyline;
    }
}

export abstract class BaseGeoLayer {
    public layerType: 'fileMarker';
    /** The file object on which this location was found */
    public file: TFile;
    /** An ID to recognize the marker */
    public id: MarkerId;
    /** In the case of an inline location, the position within the file where the location was found */
    public fileLocation?: number;
    /** The leaflet layer on the map */
    public geoLayer?: leaflet.Layer;
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

    /**
     * Is this geographic layer identical to the other object.
     * Used to compare to existing data to minimise creation.
     * @param other The other object to compare to
     */
    abstract isSame(other: BaseGeoLayer): boolean;

    /** Get the bounds of the data */
    abstract getBounds(): leaflet.LatLng[];
}

/** An object that represents a single marker in a file, which is either a complete note with a geolocation, or an inline geolocation inside a note */
export class FileMarker extends BaseGeoLayer {
    public geoLayer?: leaflet.Marker;
    public location: leaflet.LatLng;
    public icon?: leaflet.Icon<IconOptions>;
    private _edges: Edge[] = [];

    /**
     * Construct a new FileMarker object
     * @param file The file the pin comes from
     * @param location The geolocation
     */
    constructor(file: TFile, location: leaflet.LatLng) {
        super(file);
        this.layerType = 'fileMarker';
        this.location = location;
        this.generateId();
    }

    get isFrontmatterMarker(): boolean {
        return !this.fileLine;
    }

    // Important note: an Edge(u, v) object exists both in the list of u and in the list of v
    get edges(): Edge[] {
        return this._edges;
    }

    addEdge(edge: Edge) {
        this._edges.push(edge);
    }

    // Remove the polylines, which are the physical representation of the edges on the map, without removing
    // the logical edges
    removePolylines() {
        for (const edge of this._edges) {
            edge.polyline?.remove();
            edge.polyline = null;
        }
    }

    // Removes the edges that belong to this marker. This requires removing both sides of the edge
    removeEdges(listToRemoveFrom: leaflet.Polyline[]) {
        for (const edge of this._edges) {
            // Make sure the 2nd marker of the edge doesn't keep holding the edge
            if (edge.marker1 != this) edge.marker1._edges.remove(edge);
            if (edge.marker2 != this) edge.marker2._edges.remove(edge);
            // Remove the polyline from the container's polylines map
            if (edge.polyline) listToRemoveFrom.remove(edge.polyline);
            // Remove the polyline of the edge
            edge.polyline?.remove();
            edge.polyline = null;
        }
        this._edges.length = 0;
    }

    // Returns true if the two markers are linked by an existing edge
    isLinkedTo(marker: FileMarker) {
        return (
            this.edges.find((edge) => {
                return edge.marker1 == marker || edge.marker2 == marker;
            }) != undefined
        );
    }

    isSame(other: BaseGeoLayer): boolean {
        return (
            other instanceof FileMarker &&
            this.file.name === other.file.name &&
            this.location.toString() === other.location.toString() &&
            this.fileLocation === other.fileLocation &&
            this.fileLine === other.fileLine &&
            this.extraName === other.extraName &&
            // This comparison is heavy when many edges are present, but I'm not sure there's a reasonable way
            // around it (maybe just an internal optimization for the comparison)
            this.edges == other.edges &&
            this.icon?.options?.iconUrl === other.icon?.options?.iconUrl &&
            // @ts-ignore
            this.icon?.options?.icon === other.icon?.options?.icon &&
            // @ts-ignore
            this.icon?.options?.iconColor === other.icon?.options?.iconColor &&
            // @ts-ignore
            this.icon?.options?.markerColor === other.icon?.options?.markerColor
        );
    }

    generateId() {
        this.id = generateMarkerId(
            this.file.name,
            this.location.lat.toString(),
            this.location.lng.toString(),
            this.fileLocation,
            this.fileLine
        );
    }

    getBounds(): leaflet.LatLng[] {
        return [this.location];
    }
}

export function generateMarkerId(
    fileName: string,
    lat: string,
    lng: string,
    fileLocation?: number,
    fileLine?: number
): string {
    return (
        djb2Hash(fileName) +
        lat +
        lng +
        'loc-' +
        (fileLocation
            ? fileLocation
            : fileLine
            ? 'nofileloc' + fileLine
            : 'nofileline')
    );
}

export type MarkersMap = Map<MarkerId, BaseGeoLayer>;

/**
 * Create a FileMarker for every front matter and inline geolocation in the given file.
 * Properties that are not essential for filtering, e.g. marker icons, are not created here yet.
 * @param mapToAppendTo The list of markers to append to
 * @param file The file object to parse
 * @param settings The plugin settings
 * @param app The Obsidian App instance
 * @param skipMetadata If true will not find markers in the front matter
 */
export async function buildAndAppendFileMarkers(
    mapToAppendTo: BaseGeoLayer[],
    file: TFile,
    settings: PluginSettings,
    app: App,
    skipMetadata?: boolean
) {
    const fileCache = app.metadataCache.getFileCache(file);
    const frontMatter = fileCache?.frontmatter;
    const tagNameToSearch = settings.tagForGeolocationNotes?.trim();
    if (frontMatter || tagNameToSearch?.length > 0) {
        if (frontMatter && !skipMetadata) {
            const location = getFrontMatterLocation(file, app, settings);
            if (location) {
                verifyLocation(location);
                let marker = new FileMarker(file, location);
                marker.tags = getAllTags(fileCache);
                mapToAppendTo.push(marker);
            }
        }
        if (
            (frontMatter && 'locations' in frontMatter) ||
            (tagNameToSearch?.length > 0 &&
                wildcard(tagNameToSearch, getAllTags(fileCache)))
        ) {
            const markersFromFile = await getMarkersFromFileContent(
                file,
                settings,
                app
            );
            mapToAppendTo.push(...markersFromFile);
        }
    }
}

/**
 * Create FileMarker instances for all the files in the given list
 * @param files The list of file objects to find geolocations in.
 * @param settings The plugin settings
 * @param app The Obsidian App instance
 */
export async function buildMarkers(
    files: TFile[],
    settings: PluginSettings,
    app: App
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
    app: App
) {
    for (const marker of markers) {
        if (marker instanceof FileMarker) {
            marker.icon = getIconFromRules(
                marker.tags,
                settings.markerIconRules,
                iconFactory
            );
        } else {
            throw 'Unsupported object type ' + marker.constructor.name;
        }
    }
}

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
 * Find all inline geolocations in a string
 * @param content The file contents to find the coordinates in
 */
export function matchInlineLocation(content: string): RegExpMatchArray[] {
    // Old syntax of ` `location: ... ` `. This syntax doesn't support a name so we leave an empty capture group
    const locationRegex1 = regex.INLINE_LOCATION_OLD_SYNTAX;
    // New syntax of `[name](geo:...)` and an optional tags as `tag:tagName` separated by whitespaces
    const locationRegex2 = regex.INLINE_LOCATION_WITH_TAGS;
    const matches1 = content.matchAll(locationRegex1);
    const matches2 = content.matchAll(locationRegex2);
    return Array.from(matches1).concat(Array.from(matches2));
}

/**
 * Build markers from inline locations in the file body.
 * Properties non-essential for filtering, e.g. the marker icon, are not built here yet.
 * @param file The file object to load
 * @param settings The plugin settings
 * @param app The Obsidian App instance
 */
export async function getMarkersFromFileContent(
    file: TFile,
    settings: PluginSettings,
    app: App
): Promise<FileMarker[]> {
    let markers: FileMarker[] = [];
    // Get the tags of the file, to these we will add the tags associated with each individual marker (inline tags)
    const metadata = app.metadataCache.getFileCache(file);
    const fileTags = getAllTags(metadata);
    const content = await app.vault.read(file);
    const matches = matchInlineLocation(content);
    for (const match of matches) {
        try {
            const location = new leaflet.LatLng(
                parseFloat(match.groups.lat),
                parseFloat(match.groups.lng)
            );
            verifyLocation(location);
            const marker = new FileMarker(file, location);
            if (match.groups.name && match.groups.name.length > 0)
                marker.extraName = match.groups.name;
            if (match.groups.tags) {
                // Parse the list of tags
                const tagRegex = regex.INLINE_TAG_IN_NOTE;
                const tags = match.groups.tags.matchAll(tagRegex);
                for (const tag of tags)
                    if (tag.groups.tag) marker.tags.push('#' + tag.groups.tag);
            }
            marker.tags = marker.tags.concat(fileTags);
            marker.fileLocation = match.index;
            marker.geolocationMatch = match;
            marker.fileLine =
                content.substring(0, marker.fileLocation).split('\n').length -
                1;
            const [heading, block] = getHeadingAndBlockForFilePosition(
                metadata,
                marker.fileLocation
            );
            marker.fileHeading = heading;
            marker.fileBlock = block;
            // Regenerate the ID because the marker details changed since it was generated
            marker.generateId();
            markers.push(marker);
        } catch (e) {
            console.log(
                `Error converting location in file ${file.name}: could not parse ${match[0]}`,
                e
            );
        }
    }
    return markers;
}

/**
 * Get the geolocation stored in the front matter of a file
 * @param file The file to load the front matter from
 * @param app The Obsidian App instance
 */
export function getFrontMatterLocation(
    file: TFile,
    app: App,
    settings: PluginSettings
): leaflet.LatLng {
    const fileCache = app.metadataCache.getFileCache(file);
    const frontMatter = fileCache?.frontmatter;
    if (frontMatter && settings.frontMatterKey in frontMatter) {
        try {
            const frontMatterLocation = frontMatter[settings.frontMatterKey];
            // V1 format: an array in the format of `location: [lat,lng]`
            if (frontMatterLocation?.length == 2) {
                // Allow arrays of either strings or numbers
                const lat = parseFloat(frontMatterLocation[0]);
                const lng = parseFloat(frontMatterLocation[1]);
                if (Number.isNaN(lat) || Number.isNaN(lng)) {
                    console.log(
                        'Unknown location format:',
                        frontMatterLocation
                    );
                    return null;
                }
                const location = new leaflet.LatLng(
                    frontMatter.location[0],
                    frontMatter.location[1]
                );
                verifyLocation(location);
                return location;
            } else {
                // V2 format: a string in the format of `location: "lat,lng"` (which is more compatible with
                // Obsidian's property editor)
                const locationV2 = frontMatterLocation.match(regex.COORDINATES);
                if (
                    locationV2 &&
                    locationV2.groups &&
                    locationV2.groups.lat &&
                    locationV2.groups.lng
                ) {
                    const location = new leaflet.LatLng(
                        locationV2.groups.lat,
                        locationV2.groups.lng
                    );
                    verifyLocation(location);
                    return location;
                } else
                    console.log(
                        `Unknown front matter location format: `,
                        location
                    );
            }
        } catch (e) {
            console.log(`Error converting location in file ${file.name}:`, e);
        }
    }
    return null;
}

export function addEdgesToMarkers(
    markers: BaseGeoLayer[],
    app: App,
    showLinks: boolean,
    allPolylines: leaflet.Polyline[]
) {
    if (!showLinks) return;

    let filesWithMarkersMap: Map<string, FileWithMarkers> = new Map();
    for (const marker of markers) {
        if (marker instanceof FileMarker) {
            let path = marker.file.path;
            if (!filesWithMarkersMap.has(path)) {
                filesWithMarkersMap.set(path, {
                    file: marker.file,
                    markers: [],
                });
            }
            marker.removeEdges(allPolylines);
            filesWithMarkersMap.get(path).markers.push(marker);
        }
    }
    let nodesSeen: Set<string> = new Set();
    for (let fileWithMarkers of filesWithMarkersMap.values()) {
        addEdgesFromFile(
            markers,
            fileWithMarkers,
            filesWithMarkersMap,
            app,
            nodesSeen
        );
    }
}

/**
 * Add all the edges for a given file, i.e. the edges for all the markers that link out from this file.
 */
function addEdgesFromFile(
    markers: BaseGeoLayer[],
    source: FileWithMarkers,
    filesWithMarkersMap: Map<string, FileWithMarkers>,
    app: App,
    nodesSeen: Set<string>
) {
    const file = source.file;
    const path = file.path;
    if (nodesSeen.has(path)) {
        // Bail out if a cycle (loop) has been detected
        return;
    }
    nodesSeen.add(path);
    const fileCache = app.metadataCache.getFileCache(file);
    // What's done here is as follows.
    // - For every link in the source file to 'destinationFile'...
    //   - For every marker X in 'destinationFile'...
    //     - If the link points to marker X, link *all* of the source file markers to destination marker X.
    for (const link of fileCache?.links || []) {
        let destination = app.metadataCache.getFirstLinkpathDest(
            link.link,
            path
        );
        if (destination?.path && filesWithMarkersMap.has(destination.path)) {
            // Both the source file and the destination file have markers;
            // Let's transverse these markers and connect the ones that are actually linked.
            // It can be all the pairs between the files, but in case of more specialized links (heading or block links),
            // it can be just some of them.
            let destinationFileWithMarkers = filesWithMarkersMap.get(
                destination.path
            );
            for (let destinationMarker of destinationFileWithMarkers.markers) {
                if (isMarkerLinkedFrom(destinationMarker, link, app)) {
                    // The link really points to destinationMarker, therefore all the markers in the source file
                    // are to be linked to this destination marker.
                    for (let sourceMarker of source.markers) {
                        if (sourceMarker != destinationMarker) {
                            const edge = new Edge(
                                sourceMarker,
                                destinationMarker
                            );
                            sourceMarker.addEdge(edge);
                            destinationMarker.addEdge(edge);
                        }
                    }
                }
            }
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
    tagsSet: Set<string>
) {
    for (const marker of markers) {
        marker.tags.forEach((tag) => tagsSet.add(tag));
    }
}

/**
 * Returns true if the marker is linked from the given link reference.
 * If the link includes a header or a block reference and the marker is an inline marker, 'true' is returned
 * only if the marker is in that header/block. A front-matter marker is considered link regardless of the block/header.
 */
export function isMarkerLinkedFrom(
    marker: FileMarker,
    linkCache: LinkCache,
    app: App
) {
    const parsedLink = parseLinktext(linkCache.link);
    const fileMatches =
        parsedLink.path.toLowerCase() === marker.file.basename.toLowerCase() ||
        linkCache.displayText.toLowerCase() ===
            marker.file.basename.toLowerCase();
    // If the link is not pointing at the marker's file at all, there's nothing more to talk about
    if (!fileMatches) return false;

    // Now if it's a front matter marker, being the right file is all we need
    if (marker.isFrontmatterMarker) return true;
    // If the link doesn't have a subpath, being the right file is all we need too
    if (!parsedLink.subpath) return true;

    // If we get here, the link we received has a subpath (meaning it links to a header/block) and the marker
    // is an inline one. We will therefore return true only if the marker itself has a header/block and it matches
    // the link
    if (!marker.fileBlock && !marker.fileHeading) {
        return false;
    }

    const markerFileCache = app.metadataCache.getFileCache(marker.file);
    const subpath = resolveSubpath(markerFileCache, parsedLink?.subpath);
    if (subpath) {
        if (
            marker.fileBlock &&
            subpath.type === 'block' &&
            subpath.block.id == marker.fileBlock.id
        )
            return true;
        if (
            marker.fileHeading &&
            subpath.type === 'heading' &&
            subpath.current.heading == marker.fileHeading.heading &&
            subpath.current.level == marker.fileHeading.level
        )
            return true;
    }
    return false;
}
