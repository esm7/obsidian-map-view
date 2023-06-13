import { App, Editor, EditorPosition, request } from 'obsidian';
import * as querystring from 'query-string';

import * as leaflet from 'leaflet';
import { PluginSettings, UrlParsingRule } from 'src/settings';
import * as utils from 'src/utils';

export type ParsedLocation = {
    location: leaflet.LatLng;
    index: number;
    matchLength: number;
    ruleName: string;
    placeName?: string;
};

/** A class to convert a string (usually a URL) into geolocation format */
export class UrlConvertor {
    private settings: PluginSettings;

    constructor(app: App, settings: PluginSettings) {
        this.settings = settings;
    }

    /**
     * Parse the current editor line using the user defined URL parsers.
     * Returns leaflet.LatLng on success and null on failure.
     * @param editor The Obsidian Editor instance to use
     */
    hasMatchInLine(editor: Editor): boolean {
        const cursor = editor.getCursor();
        const result = this.parseLocationFromUrl(editor.getLine(cursor.line));
        return result != null;
    }

    /**
     * Get geolocation from an encoded string (a URL, a lat,lng string or a URL to parse).
     * Will try each url parsing rule until one succeeds.
     * The returned value can either be a parsed & ready geolocation, or it can be a promise that still needs
     * to be resolved in the background (in the case of parsing a URL).
     * To just check if the line contains a string that can be parsed, the result can be compared to null,
     * but to use the value, you must await in case it's a Promise.
     * @param line The string to decode
     */
    parseLocationFromUrl(
        line: string
    ): ParsedLocation | Promise<ParsedLocation> {
        for (const rule of this.settings.urlParsingRules) {
            const regexp = RegExp(rule.regExp, 'g');
            const results = line.matchAll(regexp);
            for (let result of results) {
                try {
                    if (rule.ruleType === 'fetch') {
                        const url = result[1];
                        if (!url || url.length <= 0) continue;
                        return this.parseGeolocationWithFetch(
                            url,
                            rule,
                            result.index,
                            result[0].length
                        );
                    } else {
                        return {
                            location:
                                rule.ruleType === 'latLng'
                                    ? new leaflet.LatLng(
                                          parseFloat(result[1]),
                                          parseFloat(result[2])
                                      )
                                    : new leaflet.LatLng(
                                          parseFloat(result[2]),
                                          parseFloat(result[1])
                                      ),
                            index: result.index,
                            matchLength: result[0].length,
                            ruleName: rule.name,
                        };
                    }
                } catch (e) {}
            }
        }
        return null;
    }

    async parseGeolocationWithFetch(
        url: string,
        rule: UrlParsingRule,
        userTextMatchIndex: number,
        userTextMatchLength: number
    ): Promise<ParsedLocation> {
        const urlContent = await request({ url: url });
        if (this.settings.debug)
            console.log('Fetch result for URL', url, ':', urlContent);
        const contentMatch = urlContent.match(rule.contentParsingRegExp);
        if (!contentMatch) return null;
        let geolocation: leaflet.LatLng = null;
        // TODO: Experimental, possibly unfinished code!
        if (rule.contentType === 'latLng' && contentMatch.length > 2)
            geolocation = new leaflet.LatLng(
                parseFloat(contentMatch[1]),
                parseFloat(contentMatch[2])
            );
        else if (rule.contentType === 'lngLat' && contentMatch.length > 2)
            geolocation = new leaflet.LatLng(
                parseFloat(contentMatch[2]),
                parseFloat(contentMatch[1])
            );
        else if (rule.contentType === 'googlePlace') {
            const placeName = contentMatch[1];
            if (this.settings.debug)
                console.log('Google Place search:', placeName);
            // TODO work in progress
            // const places = await googlePlacesSearch(placeName, this.settings);
            // if (places && places.length > 0) geolocation = places[0].location;
        }
        if (geolocation)
            return {
                location: geolocation,
                index: userTextMatchIndex,
                matchLength: userTextMatchLength,
                ruleName: rule.name,
            };
    }

    async getGeolocationFromGoogleLink(
        url: string,
        settings: PluginSettings
    ): Promise<leaflet.LatLng> {
        const content = await request({ url: url });
        if (this.settings.debug) console.log('Google link: searching url', url);
        const placeNameMatch = content.match(
            /<meta content="([^\"]*)" itemprop="name">/
        );
        if (placeNameMatch) {
            const placeName = placeNameMatch[1];
            if (this.settings.debug)
                console.log('Google link: found place name = ', placeName);
            const googleApiKey = settings.geocodingApiKey;
            const params = {
                query: placeName,
                key: googleApiKey,
            };
            const googleUrl =
                'https://maps.googleapis.com/maps/api/place/textsearch/json?' +
                querystring.stringify(params);
            const googleContent = await request({ url: googleUrl });
            const jsonContent = JSON.parse(googleContent) as any;
            if (
                jsonContent &&
                'results' in jsonContent &&
                jsonContent?.results.length > 0
            ) {
                const location = jsonContent.results[0].location;
                if (location && location.lat && location.lng)
                    return new leaflet.LatLng(location.lat, location.lng);
            }
        }
        return null;
    }

    /**
     * Replace the text at the cursor location with a geo link
     * @param editor The Obsidian Editor instance
     */
    async convertUrlAtCursorToGeolocation(editor: Editor) {
        const cursor = editor.getCursor();
        const result = this.parseLocationFromUrl(editor.getLine(cursor.line));
        let geolocation: ParsedLocation;
        if (result instanceof Promise) geolocation = await result;
        else geolocation = result;
        if (geolocation)
            utils.insertLocationToEditor(
                geolocation.location,
                editor,
                this.settings,
                { line: cursor.line, ch: geolocation.index },
                geolocation.matchLength
            );
    }
}
