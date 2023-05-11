import { App } from 'obsidian';
import * as geosearch from 'leaflet-geosearch';
import * as leaflet from 'leaflet';

import { PluginSettings } from 'src/settings';
import { UrlConvertor } from 'src/urlConvertor';
import { FileMarker } from 'src/markers';
import * as consts from 'src/consts';
import { GooglePlacesAPI } from './geosearchGoogleApi';

/**
 * A generic result of a geosearch
 */
export class GeoSearchResult {
    // The name to display
    name: string;
    location: leaflet.LatLng;
    resultType: 'searchResult' | 'url' | 'existingMarker';
    existingMarker?: FileMarker;
}

type searchProviderParms = {
    query: string;
    location?: string;
};

export type GeoSearcherProvider =
    | geosearch.OpenStreetMapProvider
    | geosearch.GoogleProvider
    | GooglePlacesAPI;

export class GeoSearcher {
    public searchProvider: GeoSearcherProvider;
    private settings: PluginSettings;
    private urlConvertor: UrlConvertor;

    constructor(app: App, settings: PluginSettings) {
        this.settings = settings;
        this.urlConvertor = new UrlConvertor(app, settings);
        if (settings.searchProvider == 'osm')
            this.searchProvider = new geosearch.OpenStreetMapProvider();
        else if (this.usingGooglePlacesSearch) {
            this.searchProvider = new GooglePlacesAPI(settings);
        } else if (settings.searchProvider == 'google') {
            this.searchProvider = new geosearch.GoogleProvider({
                params: { key: settings.geocodingApiKey },
            });
        }
    }

    async search(
        query: string,
        searchArea: leaflet.LatLngBounds | null = null
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

        let params: searchProviderParms = {
            query: query,
        };

        if (this.usingGooglePlacesSearch() && searchArea) {
            const centerOfSearch = searchArea?.getCenter();
            params.location = `${centerOfSearch.lat},${centerOfSearch.lng}`;
        }
        let searchResults = await this.searchProvider.search(params);

        if (!this.usingGooglePlacesSearch()) {
            searchResults = searchResults.slice(
                0,
                consts.MAX_EXTERNAL_SEARCH_SUGGESTIONS
            );
        }

        results = results.concat(
            searchResults.map(
                (result) =>
                    ({
                        name: result.label,
                        location: new leaflet.LatLng(result.y, result.x),
                        resultType: 'searchResult',
                    } as GeoSearchResult)
            )
        );

        return results;
    }

    usingGooglePlacesSearch(): boolean {
        return (
            this.settings.searchProvider == 'google' &&
            this.settings.useGooglePlaces &&
            this.settings.geocodingApiKey !== null
        );
    }
}
