import { PluginSettings } from './settings';
import * as leaflet from 'leaflet';
import { request } from 'obsidian';
import * as querystring from 'query-string';
import { GeoSearchResult } from './geosearch';
import { SearchResult } from 'leaflet-geosearch/dist/providers/provider';

export type GooglePlacesAPIQuery = { [key: string]: string };

export class GooglePlacesAPI {
    private googleApiKey: string;

    constructor(settings: PluginSettings) {
        this.googleApiKey = settings.geocodingApiKey;
    }

    async googlePlacesRequest(
        query: GooglePlacesAPIQuery,
        scope: string
    ): Promise<{}> {
        query.key = this.googleApiKey;
        const googleUrl = `https://maps.googleapis.com/maps/api/place/${scope}/json?${querystring.stringify(
            query
        )}`;
        const googleContent = await request({ url: googleUrl });
        return JSON.parse(googleContent) as any;
    }

    async search(query: GooglePlacesAPIQuery): Promise<SearchResult[]> {
        let jsonContent: any = await this.googlePlacesSearch(query);

        let results: SearchResult[] = [];
        if (
            jsonContent &&
            'results' in jsonContent &&
            jsonContent?.results.length > 0
        ) {
            for (const result of jsonContent.results) {
                const location = result.geometry?.location;
                if (location && location.lat && location.lng) {
                    results.push({
                        label: `${result?.name} (${result?.formatted_address})`,
                        y: location.lat,
                        x: location.lng,
                    } as any);
                }
            }
        }
        return results;
    }

    async googlePlacesSearch(query: GooglePlacesAPIQuery): Promise<{}> {
        return await this.googlePlacesRequest(query, 'textsearch');
    }

    async googlePlacesDetailsSearch(placeId: string): Promise<{}> {
        const params = {
            place_id: placeId,
        };
        return this.googlePlacesRequest(params, 'details');
    }
}
