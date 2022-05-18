import {
    request,
    App,
    Editor,
    Notice,
    EditorSuggest,
    EditorPosition,
    TFile,
    EditorSuggestTriggerInfo,
    EditorSuggestContext,
} from 'obsidian';
import * as geosearch from 'leaflet-geosearch';
import * as leaflet from 'leaflet';
import * as querystring from 'querystring';

import { PluginSettings } from 'src/settings';
import { UrlConvertor } from 'src/urlConvertor';
import * as consts from 'src/consts';

// TODO document
export class GeoSearchResult {
    // The name to display
    name: string;
    location: leaflet.LatLng;
    resultType: 'searchResult' | 'url' | 'existingMarker';
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
        if (settings.searchProvider == 'osm')
            this.searchProvider = new geosearch.OpenStreetMapProvider();
        else if (settings.searchProvider == 'google') {
            this.searchProvider = new geosearch.GoogleProvider({
                params: { key: settings.geocodingApiKey },
            });
        }
    }

    async search(query: string): Promise<GeoSearchResult[]> {
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
        if (this.settings.useGooglePlaces && this.settings.geocodingApiKey) {
            const placesResults = await googlePlacesSearch(
                query,
                this.settings
            );
            for (const result of placesResults)
                results.push({
                    name: result.name,
                    location: result.location,
                    resultType: 'searchResult',
                });
        } else if (!this.settings.useGooglePlaces) {
            let searchResults = await this.searchProvider.search({
                query: query,
            });
            searchResults = searchResults.slice(
                0,
                consts.MAX_EXTERNAL_SEARCH_SUGGESTIONS
            );
            results.concat(
                searchResults.map(
                    (result) =>
                        ({
                            name: result.label,
                            location: new leaflet.LatLng(result.y, result.x),
                            resultType: 'searchResult',
                        } as GeoSearchResult)
                )
            );
        }

        return results;
    }
}

export async function googlePlacesSearch(
    query: string,
    settings: PluginSettings
): Promise<GeoSearchResult[]> {
    if (settings.searchProvider != 'google' || !settings.useGooglePlaces)
        return [];
    const googleApiKey = settings.geocodingApiKey;
    const params = {
        query: query,
        key: googleApiKey,
    };
    const googleUrl =
        'https://maps.googleapis.com/maps/api/place/textsearch/json?' +
        querystring.stringify(params);
    const googleContent = await request({ url: googleUrl });
    const jsonContent = JSON.parse(googleContent) as any;
    let results: GeoSearchResult[] = [];
    if (
        jsonContent &&
        'results' in jsonContent &&
        jsonContent?.results.length > 0
    ) {
        for (const result of jsonContent.results) {
            const location = result.geometry?.location;
            if (location && location.lat && location.lng) {
                const geolocation = new leaflet.LatLng(
                    location.lat,
                    location.lng
                );
                results.push({
                    name: `${result?.name} (${result?.formatted_address})`,
                    location: geolocation,
                    resultType: 'searchResult',
                } as GeoSearchResult);
            }
        }
    }
    return results;
}
