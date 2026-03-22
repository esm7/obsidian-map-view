import { App, Plugin, TFile } from 'obsidian';
import { GeoSearcher } from 'src/geosearch';
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
