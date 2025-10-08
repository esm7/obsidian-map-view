import { request, App, Notice } from 'obsidian';
import * as geosearch from 'leaflet-geosearch';
import * as leaflet from 'leaflet';
import queryString from 'query-string';

import { type PluginSettings } from 'src/settings';
import { UrlConvertor } from 'src/urlConvertor';
import { FileMarker } from 'src/fileMarker';
import * as consts from 'src/consts';
import * as utils from 'src/utils';

/**
 * A generic result of a geosearch
 */
export class GeoSearchResult {
    // The name to display
    name: string;
    location: leaflet.LatLng;
    resultType: 'searchResult' | 'url' | 'existingMarker';
    existingMarker?: FileMarker;
    extraLocationData?: utils.ExtraLocationData;
}

export class GeoSearcher {
    private searchProvider:
        | geosearch.OpenStreetMapProvider
        | geosearch.GoogleProvider = null;
    private settings: PluginSettings;
    private urlConvertor: UrlConvertor;

    constructor(app: App, settings: PluginSettings) {
        this.settings = settings;
        this.urlConvertor = new UrlConvertor(app, settings);
        if (settings.searchProvider == 'osm') {
            if (!settings.osmUser) {
                new Notice(
                    'Map View: the OpenStreetMap geosearch requires a user email address. Set one in the settings to be able to use this feature.',
                    5000,
                );
                return;
            }
            this.searchProvider = new geosearch.OpenStreetMapProvider({
                params: {
                    email: settings.osmUser,
                },
            });
        } else if (settings.searchProvider == 'google') {
            this.searchProvider = new geosearch.GoogleProvider({
                apiKey: settings.geocodingApiKey,
            });
        }
    }

    async search(
        query: string,
        searchArea: leaflet.LatLngBounds | null = null,
    ): Promise<GeoSearchResult[]> {
        let results: GeoSearchResult[] = [];

        // Parsed URL result
        const parsedResultOrPromise =
            this.urlConvertor.parseLocationFromUrl(query);
        if (parsedResultOrPromise) {
            const parsedResult =
                parsedResultOrPromise instanceof Promise
                    ? await parsedResultOrPromise
                    : parsedResultOrPromise;
            results.push({
                name: `Parsed from ${parsedResult.ruleName}: ${parsedResult.location.lat}, ${parsedResult.location.lng}`,
                location: parsedResult.location,
                resultType: 'url',
            });
        }

        // Google Place results
        if (
            this.settings.searchProvider == 'google' &&
            this.settings.useGooglePlacesNew2025 &&
            this.settings.geocodingApiKey
        ) {
            try {
                const placesResults = await googlePlacesSearch(
                    query,
                    this.settings,
                    searchArea?.getCenter(),
                );
                for (const result of placesResults) {
                    results.push({
                        name: result.name,
                        location: result.location,
                        resultType: 'searchResult',
                        extraLocationData: result.extraLocationData,
                    });
                }
            } catch (e) {
                console.log(
                    'Map View: Google Places search failed: ',
                    e.message,
                );
                console.log(e);
            }
        } else {
            const areaSW = searchArea?.getSouthWest() || null;
            const areaNE = searchArea?.getNorthEast() || null;
            let searchResults = await this.searchProvider.search({
                query: query,
            });
            searchResults = searchResults.slice(
                0,
                consts.MAX_EXTERNAL_SEARCH_SUGGESTIONS,
            );
            results = results.concat(
                searchResults.map(
                    (result) =>
                        ({
                            name: result.label,
                            location: new leaflet.LatLng(result.y, result.x),
                            resultType: 'searchResult',
                        }) as GeoSearchResult,
                ),
            );
        }

        return results;
    }
}

export async function googlePlacesSearch(
    query: string,
    settings: PluginSettings,
    centerOfSearch: leaflet.LatLng | null,
): Promise<GeoSearchResult[]> {
    if (settings.searchProvider != 'google' || !settings.useGooglePlacesNew2025)
        return [];
    const googleApiKey = settings.geocodingApiKey;

    // Request body for the new Places API
    const requestBody = {
        textQuery: query,
        // Include locationBias if we have a center of search
        ...(centerOfSearch && {
            locationBias: {
                circle: {
                    center: {
                        latitude: centerOfSearch.lat,
                        longitude: centerOfSearch.lng,
                    },
                    radius: 5000.0, // 5km radius
                },
            },
        }),
    };

    // Places API ("New" - 2025)
    const googleUrl = 'https://places.googleapis.com/v1/places:searchText';

    try {
        const ALWAYS_FIELDS = ['displayName', 'formattedAddress', 'location'];
        // For the query, prepare the fields in the format of places.displayName, places.formattedAddress etc.
        // Add the user fields to the ones we always need.
        const userFields = settings.googlePlacesDataFields
            .split(',')
            .map((field) => field.trim())
            .filter((field) => field !== '');
        let queryFields = ALWAYS_FIELDS.concat(userFields).map(
            (fieldName) => `places.${fieldName}`,
        );
        const googleContent = await request({
            url: googleUrl,
            method: 'POST',
            body: JSON.stringify(requestBody),
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': googleApiKey,
                'X-Goog-FieldMask': queryFields.join(','),
            },
        });

        const jsonContent = JSON.parse(googleContent);

        let results: GeoSearchResult[] = [];
        if (
            jsonContent &&
            'places' in jsonContent &&
            jsonContent.places.length > 0
        ) {
            for (const place of jsonContent.places) {
                if (
                    place.location &&
                    place.location.latitude &&
                    place.location.longitude
                ) {
                    const geolocation = new leaflet.LatLng(
                        place.location.latitude,
                        place.location.longitude,
                    );

                    const displayName =
                        place.displayName?.text || 'Unknown Place';
                    const address = place.formattedAddress || '';

                    results.push({
                        name: `${displayName} (${address})`,
                        location: geolocation,
                        resultType: 'searchResult',
                        extraLocationData: { googleMapsPlaceData: place },
                    } as GeoSearchResult);
                }
            }
        }
        return results;
    } catch (e) {
        console.log('Map View: Google Places API error:', e);
        return [];
    }
}

export function searchDelayMs(settings: PluginSettings) {
    const MIN_OSM_DELAY_MS = 1000;
    if (
        settings.searchProvider === 'osm' &&
        settings.searchDelayMs < MIN_OSM_DELAY_MS
    )
        return MIN_OSM_DELAY_MS;
    else return settings.searchDelayMs;
}
