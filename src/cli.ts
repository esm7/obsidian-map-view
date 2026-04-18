import { App, Plugin, TFile } from 'obsidian';
import * as leaflet from 'leaflet';
import { GeoSearcher } from 'src/geosearch';
import { calcRoute } from 'src/routing';
import type { PluginSettings } from 'src/settings';

type MapViewPlugin = Plugin & { focusNoteInMap: (file: TFile) => void };

export function registerCliHandlers(
    plugin: MapViewPlugin,
    app: App,
    settings: PluginSettings,
) {
    const nameFlag = {
        name: {
            value: '<query>',
            description: 'Location name or address to search for',
            required: true,
        },
    };

    plugin.registerCliHandler(
        'mv-geosearch',
        'Search for a location by name and return up to 10 results',
        nameFlag,
        async (params: { name: string }) => {
            const results = await new GeoSearcher(app, settings).search(
                params.name,
            );
            if (!results.length) return 'No results found.';
            return results
                .slice(0, 10)
                .map(
                    (r, i) =>
                        `${i + 1}. ${r.name} [${r.location.lat}, ${r.location.lng}]`,
                )
                .join('\n');
        },
    );

    plugin.registerCliHandler(
        'mv-geosearch-as-front-matter',
        'Search for a location and return it as a front matter property',
        nameFlag,
        async (params: { name: string }) => {
            const results = await new GeoSearcher(app, settings).search(
                params.name,
            );
            if (!results.length) return 'No results found.';
            const { lat, lng } = results[0].location;
            return `${settings.frontMatterKey}: "${lat},${lng}"`;
        },
    );

    plugin.registerCliHandler(
        'mv-geosearch-as-inline',
        'Search for a location and return it as an inline geolink',
        nameFlag,
        async (params: { name: string }) => {
            const results = await new GeoSearcher(app, settings).search(
                params.name,
            );
            if (!results.length) return 'No results found.';
            const { lat, lng } = results[0].location;
            return `[${params.name}](geo:${lat},${lng})`;
        },
    );

    plugin.registerCliHandler(
        'mv-calc-distance',
        'Calculate the direct (aerial/straight-line) distance in meters between two coordinates',
        {
            from: {
                value: '<lat,lng>',
                description:
                    'Starting coordinates as lat,lng or [lat,lng], e.g. 40.7128,-74.0060',
                required: true,
            },
            to: {
                value: '<lat,lng>',
                description:
                    'Destination coordinates as lat,lng or [lat,lng], e.g. 48.8584,2.2945',
                required: true,
            },
        },
        (params: { from: string; to: string }) => {
            const from = parseLatLng(params.from);
            const to = parseLatLng(params.to);
            if (!from)
                return `Invalid 'from' coordinates: ${params.from}. Expected format: [lat,lng]`;
            if (!to)
                return `Invalid 'to' coordinates: ${params.to}. Expected format: [lat,lng]`;
            const meters = from.distanceTo(to);
            const km = meters / 1000;
            return [
                `Distance: ${Math.round(meters)} m (${km.toFixed(2)} km)`,
                `Note: this is the straight-line (aerial) distance, not a routed distance.`,
            ].join('\n');
        },
    );

    plugin.registerCliHandler(
        'mv-calc-route',
        'Calculate a routed distance and travel time between two coordinates using the configured routing engine (requires a GraphHopper API key in Map View settings)',
        {
            from: {
                value: '<lat,lng>',
                description:
                    'Starting coordinates as lat,lng or [lat,lng], e.g. 40.7128,-74.0060',
                required: true,
            },
            to: {
                value: '<lat,lng>',
                description:
                    'Destination coordinates as lat,lng or [lat,lng], e.g. 48.8584,2.2945',
                required: true,
            },
            profile: {
                value: '<profile>',
                description:
                    'Routing profile: foot, bike, car, hike, motorcycle, racingbike, mtb',
                required: true,
            },
        },
        async (params: { from: string; to: string; profile: string }) => {
            const from = parseLatLng(params.from);
            const to = parseLatLng(params.to);
            if (!from)
                return `Invalid 'from' coordinates: ${params.from}. Expected format: [lat,lng]`;
            if (!to)
                return `Invalid 'to' coordinates: ${params.to}. Expected format: [lat,lng]`;
            try {
                const result = await calcRoute(
                    from,
                    to,
                    'graphhopper',
                    { profile: params.profile },
                    settings,
                );
                return [
                    `Profile: ${result.profileUsed}`,
                    `Distance: ${Math.round(result.distanceMeters)} m (${(result.distanceMeters / 1000).toFixed(2)} km)`,
                    `Time: ${result.timeMinutes.toFixed(1)} min`,
                    `Ascent: ${Math.round(result.totalAscentMeters)} m`,
                    `Descent: ${Math.round(result.totalDescentMeters)} m`,
                ].join('\n');
            } catch (e: any) {
                return `Routing error: ${e?.message ?? e}`;
            }
        },
    );

    function parseLatLng(str: string): leaflet.LatLng | null {
        const cleaned = str.replace(/[\[\]\s]/g, '');
        const m = cleaned.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
        if (!m) return null;
        return leaflet.latLng(parseFloat(m[1]), parseFloat(m[2]));
    }

    plugin.registerCliHandler(
        'mv-focus-note',
        'Focus a note in Map View, filtering the map to show only its locations',
        {
            file: {
                value: '<note>',
                description: 'Note name to focus (resolved like a wikilink)',
                required: true,
            },
        },
        (params: { file: string }) => {
            const file = app.metadataCache.getFirstLinkpathDest(
                params.file,
                '',
            );
            if (!file) return `Note not found: ${params.file}`;
            plugin.focusNoteInMap(file);
            return `Focused ${file.path} in Map View.`;
        },
    );
}
