import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GeoJSON } from 'geojson';

import {
    GeoJsonLayer,
    convertToGeoJson,
    buildGeoJsonLayers,
    editGeoJson,
} from 'src/geojsonLayer';
import type MapViewPlugin from 'src/main';
import type { PluginSettings } from 'src/settings';
import { makeApp, makeFile } from './testHelpers';

// Mock obsidian so getAllTags (used inside hasFrontMatterLocations via utils) is controllable
vi.mock('obsidian', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        getAllTags: vi.fn(() => []),
    };
});

// ─── helpers ──────────────────────────────────────────────────────────────────

const defaultSettings = {
    frontMatterKey: 'location',
    tagForGeolocationNotes: '',
    debug: false,
} as unknown as PluginSettings;

/** Minimal plugin mock: only needs displayRulesCache.runOn() */
function makeMockPlugin() {
    return {
        displayRulesCache: {
            runOn: vi.fn().mockReturnValue([undefined, {}]),
        },
    } as unknown as MapViewPlugin;
}

/** Wrap GeoJSON content in a triple-backtick geojson code block */
function inlineGeoJsonBlock(jsonContent: string, tags = ''): string {
    return '```geojson\n' + jsonContent + '\n```' + (tags ? '\n' + tags : '');
}

// Sample GeoJSON objects used across tests
const POINT_GEOJSON: GeoJSON = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [35.0, 32.0] },
    properties: { name: 'Test Point', desc: 'A description' },
};

const LINE_GEOJSON: GeoJSON = {
    type: 'Feature',
    geometry: {
        type: 'LineString',
        coordinates: [
            [35.0, 32.0],
            [35.1, 32.1],
        ],
    },
    properties: { name: 'Test Line' },
};

const FEATURE_COLLECTION: GeoJSON = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [35.0, 32.0] },
            properties: { name: 'Collection Name', desc: 'Collection desc' },
        },
    ],
};

const MINIMAL_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Test Track</name>
    <trkseg>
      <trkpt lat="32.0" lon="35.0"><ele>100</ele></trkpt>
      <trkpt lat="32.1" lon="35.1"><ele>110</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const MINIMAL_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Placemark>
    <name>Test Place</name>
    <Point><coordinates>35.0,32.0,0</coordinates></Point>
  </Placemark>
</kml>`;

// ─── GeoJsonLayer class ───────────────────────────────────────────────────────

describe('GeoJsonLayer', () => {
    it('constructs with layerType set to "geojson"', () => {
        const layer = new GeoJsonLayer(makeFile());
        expect(layer.layerType).toBe('geojson');
    });

    it('generates a stable ID', () => {
        const layer = new GeoJsonLayer(makeFile('notes/route.md'));
        expect(typeof layer.id).toBe('string');
        expect(layer.id.length).toBeGreaterThan(0);
    });

    it('two layers from the same file with no location share the same ID', () => {
        const file = makeFile();
        const a = new GeoJsonLayer(file);
        const b = new GeoJsonLayer(file);
        expect(a.id).toBe(b.id);
    });

    it('layers with different fileLocations have different IDs', () => {
        const file = makeFile();
        const a = new GeoJsonLayer(file);
        a.fileLocation = 10;
        a.generateId();
        const b = new GeoJsonLayer(file);
        b.fileLocation = 50;
        b.generateId();
        expect(a.id).not.toBe(b.id);
    });

    // ── populateMetadata ──

    describe('populateMetadata', () => {
        it('reads name and desc from Feature.properties', () => {
            const layer = new GeoJsonLayer(makeFile());
            layer.geojson = POINT_GEOJSON;
            layer.populateMetadata();
            expect(layer.extraName).toBe('Test Point');
            expect(layer.text).toBe('A description');
        });

        it('reads name from the first feature of a FeatureCollection', () => {
            const layer = new GeoJsonLayer(makeFile());
            layer.geojson = FEATURE_COLLECTION;
            layer.populateMetadata();
            expect(layer.extraName).toBe('Collection Name');
            expect(layer.text).toBe('Collection desc');
        });

        it('sets extraName to empty string when properties has no name', () => {
            const layer = new GeoJsonLayer(makeFile());
            layer.geojson = {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [0, 0] },
                properties: {},
            };
            layer.populateMetadata();
            expect(layer.extraName).toBe('');
        });

        it('does not crash when geojson has no properties', () => {
            const layer = new GeoJsonLayer(makeFile());
            layer.geojson = {
                type: 'FeatureCollection',
                features: [],
            };
            expect(() => layer.populateMetadata()).not.toThrow();
        });
    });

    // ── isSame ──

    describe('isSame', () => {
        // isSame checks `this.tags === other.tags` (reference equality).
        // Two independently-created layers will not share the same array object,
        // so they are only "same" when the tags reference is explicitly shared.
        it('returns true when same file, position, and tags reference', () => {
            const file = makeFile();
            const a = new GeoJsonLayer(file);
            const b = new GeoJsonLayer(file);
            b.tags = a.tags; // share the exact same array reference
            expect(a.isSame(b)).toBe(true);
        });

        it('returns false when tags arrays are different objects (even if both empty)', () => {
            const file = makeFile();
            const a = new GeoJsonLayer(file);
            const b = new GeoJsonLayer(file);
            // Each layer gets its own [] from BaseGeoLayer, so reference differs
            expect(a.isSame(b)).toBe(false);
        });

        it('returns false when file names differ', () => {
            const a = new GeoJsonLayer(makeFile('a.md'));
            const b = new GeoJsonLayer(makeFile('b.md'));
            b.tags = a.tags;
            expect(a.isSame(b)).toBe(false);
        });

        it('returns false when fileLocations differ', () => {
            const file = makeFile();
            const a = new GeoJsonLayer(file);
            a.fileLocation = 10;
            const b = new GeoJsonLayer(file);
            b.fileLocation = 20;
            b.tags = a.tags;
            expect(a.isSame(b)).toBe(false);
        });

        it('returns false when fileLines differ', () => {
            const file = makeFile();
            const a = new GeoJsonLayer(file);
            a.fileLine = 1;
            const b = new GeoJsonLayer(file);
            b.fileLine = 5;
            b.tags = a.tags;
            expect(a.isSame(b)).toBe(false);
        });
    });
});

// ─── convertToGeoJson ─────────────────────────────────────────────────────────

describe('convertToGeoJson', () => {
    it('parses a valid GeoJSON string', () => {
        const result = convertToGeoJson(
            JSON.stringify(POINT_GEOJSON),
            'geojson',
        );
        expect(result).not.toBeNull();
        expect((result as any).type).toBe('Feature');
        expect((result as any).geometry.type).toBe('Point');
    });

    it('returns null for invalid JSON', () => {
        const result = convertToGeoJson('not valid json {{{{', 'geojson');
        expect(result).toBeNull();
    });

    it('parses a minimal GPX file', () => {
        const result = convertToGeoJson(MINIMAL_GPX, 'gpx');
        expect(result).not.toBeNull();
        expect((result as any).type).toBe('FeatureCollection');
    });

    it('GPX result contains track features', () => {
        const result = convertToGeoJson(MINIMAL_GPX, 'gpx') as any;
        expect(result.features.length).toBeGreaterThan(0);
    });

    it('parses a minimal KML file', () => {
        const result = convertToGeoJson(MINIMAL_KML, 'kml');
        expect(result).not.toBeNull();
        expect((result as any).type).toBe('FeatureCollection');
    });

    it('KML result contains placemark features', () => {
        const result = convertToGeoJson(MINIMAL_KML, 'kml') as any;
        expect(result.features.length).toBeGreaterThan(0);
    });

    it('returns null for unknown extension', () => {
        const result = convertToGeoJson('anything', 'xyz');
        expect(result).toBeNull();
    });
});

// ─── buildGeoJsonLayers — .md files with inline GeoJSON ─────────────────────

describe('buildGeoJsonLayers — inline GeoJSON in .md files', () => {
    let plugin: MapViewPlugin;

    beforeEach(() => {
        plugin = makeMockPlugin();
    });

    it('returns empty array for file with no geojson blocks', async () => {
        const { app } = makeApp({ fileContent: 'Just text, no GeoJSON.' });
        const layers = await buildGeoJsonLayers(
            [makeFile()],
            defaultSettings,
            app,
            plugin,
        );
        expect(layers).toHaveLength(0);
    });

    it('returns empty array when hasFrontMatterLocations is false', async () => {
        const { app } = makeApp({
            frontmatter: {}, // no 'locations' key → hasFrontMatterLocations = false
            fileContent: inlineGeoJsonBlock(JSON.stringify(POINT_GEOJSON)),
        });
        const layers = await buildGeoJsonLayers(
            [makeFile()],
            defaultSettings,
            app,
            plugin,
        );
        expect(layers).toHaveLength(0);
    });

    it('parses a single inline GeoJSON with no tags', async () => {
        const { app } = makeApp({
            fileContent: inlineGeoJsonBlock(JSON.stringify(POINT_GEOJSON)),
        });
        const layers = await buildGeoJsonLayers(
            [makeFile()],
            defaultSettings,
            app,
            plugin,
        );
        expect(layers).toHaveLength(1);
        expect(layers[0]).toBeInstanceOf(GeoJsonLayer);
    });

    it('sets geojson on the layer', async () => {
        const { app } = makeApp({
            fileContent: inlineGeoJsonBlock(JSON.stringify(POINT_GEOJSON)),
        });
        const layers = await buildGeoJsonLayers(
            [makeFile()],
            defaultSettings,
            app,
            plugin,
        );
        expect((layers[0] as GeoJsonLayer).geojson).not.toBeNull();
        expect(((layers[0] as GeoJsonLayer).geojson as any).type).toBe(
            'Feature',
        );
    });

    it('sets sourceType to "geojson" for inline blocks', async () => {
        const { app } = makeApp({
            fileContent: inlineGeoJsonBlock(JSON.stringify(POINT_GEOJSON)),
        });
        const layers = await buildGeoJsonLayers(
            [makeFile()],
            defaultSettings,
            app,
            plugin,
        );
        expect((layers[0] as GeoJsonLayer).sourceType).toBe('geojson');
    });

    it('calls populateMetadata — sets extraName from geojson properties', async () => {
        const { app } = makeApp({
            fileContent: inlineGeoJsonBlock(JSON.stringify(POINT_GEOJSON)),
        });
        const layers = await buildGeoJsonLayers(
            [makeFile()],
            defaultSettings,
            app,
            plugin,
        );
        expect((layers[0] as GeoJsonLayer).extraName).toBe('Test Point');
    });

    it('assigns a single inline tag', async () => {
        const content = inlineGeoJsonBlock(
            JSON.stringify(LINE_GEOJSON),
            'tag:trip',
        );
        const { app } = makeApp({ fileContent: content });
        const layers = await buildGeoJsonLayers(
            [makeFile()],
            defaultSettings,
            app,
            plugin,
        );
        expect(layers).toHaveLength(1);
        expect(layers[0].tags).toContain('#trip');
    });

    it('assigns multiple inline tags', async () => {
        const content = inlineGeoJsonBlock(
            JSON.stringify(LINE_GEOJSON),
            'tag:trip tag:outdoor',
        );
        const { app } = makeApp({ fileContent: content });
        const layers = await buildGeoJsonLayers(
            [makeFile()],
            defaultSettings,
            app,
            plugin,
        );
        expect(layers[0].tags).toContain('#trip');
        expect(layers[0].tags).toContain('#outdoor');
    });

    it('assigns emoji inline tag', async () => {
        const content = inlineGeoJsonBlock(
            JSON.stringify(LINE_GEOJSON),
            'tag:🌍',
        );
        const { app } = makeApp({ fileContent: content });
        const layers = await buildGeoJsonLayers(
            [makeFile()],
            defaultSettings,
            app,
            plugin,
        );
        expect(layers[0].tags).toContain('#🌍');
    });

    it('assigns emoji-with-variation-selector inline tag', async () => {
        const content = inlineGeoJsonBlock(
            JSON.stringify(LINE_GEOJSON),
            'tag:☕️',
        );
        const { app } = makeApp({ fileContent: content });
        const layers = await buildGeoJsonLayers(
            [makeFile()],
            defaultSettings,
            app,
            plugin,
        );
        expect(layers[0].tags).toContain('#☕️');
    });

    it('assigns unicode (Hebrew) inline tag', async () => {
        const content = inlineGeoJsonBlock(
            JSON.stringify(LINE_GEOJSON),
            'tag:טיול',
        );
        const { app } = makeApp({ fileContent: content });
        const layers = await buildGeoJsonLayers(
            [makeFile()],
            defaultSettings,
            app,
            plugin,
        );
        expect(layers[0].tags).toContain('#טיול');
    });

    it('assigns mixed ASCII + emoji tags', async () => {
        const content = inlineGeoJsonBlock(
            JSON.stringify(LINE_GEOJSON),
            'tag:hiking tag:🏔️',
        );
        const { app } = makeApp({ fileContent: content });
        const layers = await buildGeoJsonLayers(
            [makeFile()],
            defaultSettings,
            app,
            plugin,
        );
        expect(layers[0].tags).toContain('#hiking');
        expect(layers[0].tags).toContain('#🏔️');
    });

    it('skips a block with invalid JSON', async () => {
        const content = inlineGeoJsonBlock('{ not valid json }');
        const { app } = makeApp({ fileContent: content });
        const layers = await buildGeoJsonLayers(
            [makeFile()],
            defaultSettings,
            app,
            plugin,
        );
        expect(layers).toHaveLength(0);
    });

    it('skips a block with empty JSON object', async () => {
        const content = inlineGeoJsonBlock('{}');
        const { app } = makeApp({ fileContent: content });
        const layers = await buildGeoJsonLayers(
            [makeFile()],
            defaultSettings,
            app,
            plugin,
        );
        expect(layers).toHaveLength(0);
    });

    it('parses multiple inline GeoJSON blocks in one file', async () => {
        const block1 = inlineGeoJsonBlock(
            JSON.stringify(POINT_GEOJSON),
            'tag:a',
        );
        const block2 = inlineGeoJsonBlock(
            JSON.stringify(LINE_GEOJSON),
            'tag:b',
        );
        const { app } = makeApp({
            fileContent: block1 + '\nSome text\n' + block2,
        });
        const layers = await buildGeoJsonLayers(
            [makeFile()],
            defaultSettings,
            app,
            plugin,
        );
        expect(layers).toHaveLength(2);
        expect(layers[0].tags).toContain('#a');
        expect(layers[1].tags).toContain('#b');
    });

    it('sets fileLocation to the character offset of the block', async () => {
        const prefix = 'Some text before\n';
        const { app } = makeApp({
            fileContent:
                prefix + inlineGeoJsonBlock(JSON.stringify(POINT_GEOJSON)),
        });
        const layers = await buildGeoJsonLayers(
            [makeFile()],
            defaultSettings,
            app,
            plugin,
        );
        expect(layers).toHaveLength(1);
        expect((layers[0] as GeoJsonLayer).fileLocation).toBe(prefix.length);
    });

    it('sets fileLine correctly', async () => {
        const content =
            'line 0\nline 1\n' +
            inlineGeoJsonBlock(JSON.stringify(POINT_GEOJSON));
        const { app } = makeApp({ fileContent: content });
        const layers = await buildGeoJsonLayers(
            [makeFile()],
            defaultSettings,
            app,
            plugin,
        );
        expect((layers[0] as GeoJsonLayer).fileLine).toBe(2);
    });

    it('generates distinct IDs for two blocks in the same file', async () => {
        const block1 = inlineGeoJsonBlock(JSON.stringify(POINT_GEOJSON));
        const block2 = inlineGeoJsonBlock(JSON.stringify(LINE_GEOJSON));
        const { app } = makeApp({ fileContent: block1 + '\n\n' + block2 });
        const layers = await buildGeoJsonLayers(
            [makeFile()],
            defaultSettings,
            app,
            plugin,
        );
        expect(layers).toHaveLength(2);
        expect(layers[0].id).not.toBe(layers[1].id);
    });

    it('calls runDisplayRules on every layer', async () => {
        const block1 = inlineGeoJsonBlock(JSON.stringify(POINT_GEOJSON));
        const block2 = inlineGeoJsonBlock(JSON.stringify(LINE_GEOJSON));
        const { app } = makeApp({ fileContent: block1 + '\n\n' + block2 });
        await buildGeoJsonLayers([makeFile()], defaultSettings, app, plugin);
        expect((plugin.displayRulesCache as any).runOn).toHaveBeenCalledTimes(
            2,
        );
    });
});

// ─── buildGeoJsonLayers — standalone .geojson files ──────────────────────────

describe('buildGeoJsonLayers — standalone .geojson files', () => {
    let plugin: MapViewPlugin;

    beforeEach(() => {
        plugin = makeMockPlugin();
    });

    it('parses a standalone .geojson file', async () => {
        const { app } = makeApp({
            fileContent: JSON.stringify(POINT_GEOJSON),
        });
        const file = makeFile('route.geojson');
        const layers = await buildGeoJsonLayers(
            [file],
            defaultSettings,
            app,
            plugin,
        );
        expect(layers).toHaveLength(1);
        expect((layers[0] as GeoJsonLayer).geojson).not.toBeNull();
    });

    it('sets sourceType to "geojson" for standalone files', async () => {
        const { app } = makeApp({ fileContent: JSON.stringify(POINT_GEOJSON) });
        const layers = await buildGeoJsonLayers(
            [makeFile('route.geojson')],
            defaultSettings,
            app,
            plugin,
        );
        expect((layers[0] as GeoJsonLayer).sourceType).toBe('geojson');
    });

    it('populates metadata (name) from a standalone .geojson file', async () => {
        const { app } = makeApp({ fileContent: JSON.stringify(POINT_GEOJSON) });
        const layers = await buildGeoJsonLayers(
            [makeFile('route.geojson')],
            defaultSettings,
            app,
            plugin,
        );
        expect((layers[0] as GeoJsonLayer).extraName).toBe('Test Point');
    });

    it('parses a FeatureCollection .geojson file', async () => {
        const { app } = makeApp({
            fileContent: JSON.stringify(FEATURE_COLLECTION),
        });
        const layers = await buildGeoJsonLayers(
            [makeFile('route.geojson')],
            defaultSettings,
            app,
            plugin,
        );
        expect(layers).toHaveLength(1);
        expect((layers[0] as GeoJsonLayer).extraName).toBe('Collection Name');
    });
});

// ─── buildGeoJsonLayers — .gpx files ──────────────────────────────────────────

describe('buildGeoJsonLayers — .gpx files', () => {
    let plugin: MapViewPlugin;

    beforeEach(() => {
        plugin = makeMockPlugin();
    });

    it('parses a .gpx file and converts it to GeoJSON', async () => {
        const { app } = makeApp({ fileContent: MINIMAL_GPX });
        const layers = await buildGeoJsonLayers(
            [makeFile('track.gpx')],
            defaultSettings,
            app,
            plugin,
        );
        expect(layers).toHaveLength(1);
        expect((layers[0] as GeoJsonLayer).geojson).not.toBeNull();
    });

    it('sets sourceType to "gpx"', async () => {
        const { app } = makeApp({ fileContent: MINIMAL_GPX });
        const layers = await buildGeoJsonLayers(
            [makeFile('track.gpx')],
            defaultSettings,
            app,
            plugin,
        );
        expect((layers[0] as GeoJsonLayer).sourceType).toBe('gpx');
    });

    it('parses a .kml file and converts it to GeoJSON', async () => {
        const { app } = makeApp({ fileContent: MINIMAL_KML });
        const layers = await buildGeoJsonLayers(
            [makeFile('places.kml')],
            defaultSettings,
            app,
            plugin,
        );
        expect(layers).toHaveLength(1);
        expect((layers[0] as GeoJsonLayer).geojson).not.toBeNull();
    });

    it('kml layer has sourceType "gpx" (gpx is the generic non-geojson type)', async () => {
        const { app } = makeApp({ fileContent: MINIMAL_KML });
        const layers = await buildGeoJsonLayers(
            [makeFile('places.kml')],
            defaultSettings,
            app,
            plugin,
        );
        // sourceType is set to 'gpx' for all non-geojson file extensions
        expect((layers[0] as GeoJsonLayer).sourceType).toBe('gpx');
    });
});

// ─── editGeoJson ──────────────────────────────────────────────────────────────

describe('editGeoJson', () => {
    it('does nothing (shows Notice) when sourceType is not "geojson"', async () => {
        const { app } = makeApp();
        const layer = new GeoJsonLayer(makeFile());
        layer.sourceType = 'gpx';
        layer.fileLocation = 10;

        await editGeoJson(layer, POINT_GEOJSON, defaultSettings, app);

        // vault.modify should never be called
        expect(app.vault.modify).not.toHaveBeenCalled();
    });

    it('replaces file content with JSON when fileLocation is falsy (standalone file)', async () => {
        const { app } = makeApp();
        const layer = new GeoJsonLayer(makeFile('route.geojson'));
        layer.sourceType = 'geojson';
        // fileLocation defaults to undefined → falsy

        await editGeoJson(layer, POINT_GEOJSON, defaultSettings, app);

        expect(app.vault.modify).toHaveBeenCalledTimes(1);
        const [, writtenContent] = (app.vault.modify as any).mock.calls[0];
        expect(writtenContent).toBe(JSON.stringify(POINT_GEOJSON));
    });

    it('replaces inline geojson block with updated content', async () => {
        const originalGeoJson = POINT_GEOJSON;
        const updatedGeoJson = {
            ...POINT_GEOJSON,
            properties: { name: 'Updated', desc: '' },
        } as GeoJSON;

        const prefix = 'Some text before\n';
        const originalBlock = inlineGeoJsonBlock(
            JSON.stringify(originalGeoJson),
        );
        const suffix = '\nSome text after';
        const fileContent = prefix + originalBlock + suffix;

        const { app } = makeApp({ fileContent });
        const layer = new GeoJsonLayer(makeFile());
        layer.sourceType = 'geojson';
        layer.fileLocation = prefix.length; // points to the start of the block
        layer.tags = [];

        await editGeoJson(layer, updatedGeoJson, defaultSettings, app);

        expect(app.vault.modify).toHaveBeenCalledTimes(1);
        const [, newContent] = (app.vault.modify as any).mock.calls[0];

        // The prefix and suffix must be preserved
        expect(newContent).toContain(prefix);
        expect(newContent).toContain(suffix);
        // The new GeoJSON should appear in the output
        expect(newContent).toContain(JSON.stringify(updatedGeoJson));
        // The original GeoJSON should no longer be there verbatim
        // (the name changed from 'Test Point' to 'Updated')
        expect(newContent).not.toContain('"Test Point"');
        expect(newContent).toContain('"Updated"');
    });

    it('preserves inline tags when replacing a geojson block', async () => {
        const geojson = LINE_GEOJSON;
        // Use a non-empty prefix so fileLocation > 0 (the code does `if (layer.fileLocation)`)
        const prefix = 'prefix\n';
        const originalBlock = inlineGeoJsonBlock(
            JSON.stringify(geojson),
            'tag:trip',
        );
        const fileContent = prefix + originalBlock;

        const { app } = makeApp({ fileContent });
        const layer = new GeoJsonLayer(makeFile());
        layer.sourceType = 'geojson';
        layer.fileLocation = prefix.length; // must be > 0
        layer.tags = ['#trip'];

        await editGeoJson(layer, geojson, defaultSettings, app);

        const [, newContent] = (app.vault.modify as any).mock.calls[0];
        expect(newContent).toContain('tag:trip');
    });

    it('preserves multiple inline tags when replacing', async () => {
        const geojson = LINE_GEOJSON;
        const prefix = 'some text\n';
        const originalBlock = inlineGeoJsonBlock(
            JSON.stringify(geojson),
            'tag:hiking tag:outdoor',
        );
        const { app } = makeApp({ fileContent: prefix + originalBlock });
        const layer = new GeoJsonLayer(makeFile());
        layer.sourceType = 'geojson';
        layer.fileLocation = prefix.length;
        layer.tags = ['#hiking', '#outdoor'];

        await editGeoJson(layer, geojson, defaultSettings, app);

        const [, newContent] = (app.vault.modify as any).mock.calls[0];
        expect(newContent).toContain('tag:hiking');
        expect(newContent).toContain('tag:outdoor');
    });

    it('preserves unicode/emoji tags when replacing', async () => {
        const geojson = LINE_GEOJSON;
        const prefix = 'note\n';
        const originalBlock = inlineGeoJsonBlock(
            JSON.stringify(geojson),
            'tag:טיול tag:🌍',
        );
        const { app } = makeApp({ fileContent: prefix + originalBlock });
        const layer = new GeoJsonLayer(makeFile());
        layer.sourceType = 'geojson';
        layer.fileLocation = prefix.length;
        layer.tags = ['#טיול', '#🌍'];

        await editGeoJson(layer, geojson, defaultSettings, app);

        const [, newContent] = (app.vault.modify as any).mock.calls[0];
        expect(newContent).toContain('tag:טיול');
        expect(newContent).toContain('tag:🌍');
    });

    it('does not call vault.modify when inline block is not found at location', async () => {
        // fileLocation points somewhere that has no geojson block
        const { app } = makeApp({ fileContent: 'No geojson here at all' });
        const layer = new GeoJsonLayer(makeFile());
        layer.sourceType = 'geojson';
        layer.fileLocation = 3; // offset into plain text

        await editGeoJson(layer, POINT_GEOJSON, defaultSettings, app);

        expect(app.vault.modify).not.toHaveBeenCalled();
    });

    it('replaces only the targeted block when file has multiple blocks', async () => {
        const block1 = inlineGeoJsonBlock(
            JSON.stringify(POINT_GEOJSON),
            'tag:a',
        );
        const separator = '\nSome text between\n';
        const block2 = inlineGeoJsonBlock(
            JSON.stringify(LINE_GEOJSON),
            'tag:b',
        );
        const fileContent = block1 + separator + block2;

        const updatedGeoJson = {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [1.0, 2.0] },
            properties: { name: 'Replaced' },
        } as GeoJSON;

        const { app } = makeApp({ fileContent });
        const layer = new GeoJsonLayer(makeFile());
        layer.sourceType = 'geojson';
        // fileLocation points to the START of block2
        layer.fileLocation = block1.length + separator.length;
        layer.tags = ['#b'];

        await editGeoJson(layer, updatedGeoJson, defaultSettings, app);

        const [, newContent] = (app.vault.modify as any).mock.calls[0];
        // block1 must be untouched
        expect(newContent).toContain(JSON.stringify(POINT_GEOJSON));
        // block2 must contain the updated GeoJSON
        expect(newContent).toContain('"Replaced"');
        // the separator must still be present
        expect(newContent).toContain(separator);
    });
});
