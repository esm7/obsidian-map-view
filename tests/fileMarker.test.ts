import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAllTags } from 'obsidian';
import {
    getMarkersFromFileContent,
    getFrontMatterLocation,
    matchInlineLocation,
} from 'src/fileMarker';
import { verifyLocation } from 'src/baseGeoLayer';
import * as leaflet from 'leaflet';
import type { PluginSettings } from 'src/settings';
import { makeApp, makeFile } from './testHelpers';

// Mock getAllTags from obsidian so tests can control file-level tags per-test.
// vi.mock is hoisted to the top and intercepts the import in fileMarker.ts.
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
} as unknown as PluginSettings;

// ─── verifyLocation ───────────────────────────────────────────────────────────

describe('verifyLocation', () => {
    it('accepts a typical valid location', () => {
        expect(() =>
            verifyLocation(new leaflet.LatLng(32.0, 35.0)),
        ).not.toThrow();
    });

    it('accepts edge-case lat = 90', () => {
        expect(() => verifyLocation(new leaflet.LatLng(90, 0))).not.toThrow();
    });

    it('accepts edge-case lat = -90', () => {
        expect(() => verifyLocation(new leaflet.LatLng(-90, 0))).not.toThrow();
    });

    it('accepts edge-case lng = 180', () => {
        expect(() => verifyLocation(new leaflet.LatLng(0, 180))).not.toThrow();
    });

    it('accepts edge-case lng = -180', () => {
        expect(() => verifyLocation(new leaflet.LatLng(0, -180))).not.toThrow();
    });

    it('throws for lat > 90', () => {
        expect(() => verifyLocation(new leaflet.LatLng(90.001, 0))).toThrow(
            /Lat/,
        );
    });

    it('throws for lat < -90', () => {
        expect(() => verifyLocation(new leaflet.LatLng(-91, 0))).toThrow(/Lat/);
    });

    it('throws for lng > 180', () => {
        expect(() => verifyLocation(new leaflet.LatLng(0, 181))).toThrow(/Lng/);
    });

    it('throws for lng < -180', () => {
        expect(() => verifyLocation(new leaflet.LatLng(0, -181))).toThrow(
            /Lng/,
        );
    });
});

// ─── getFrontMatterLocation ───────────────────────────────────────────────────

describe('getFrontMatterLocation', () => {
    it('returns null when getFileCache returns null', () => {
        const { app } = makeApp();
        app.metadataCache.getFileCache = vi.fn().mockReturnValue(null);
        expect(
            getFrontMatterLocation(makeFile(), app, defaultSettings),
        ).toBeNull();
    });

    it('returns null when frontmatter is absent', () => {
        const { app } = makeApp({ frontmatter: null });
        app.metadataCache.getFileCache = vi.fn().mockReturnValue({ tags: [] });
        expect(
            getFrontMatterLocation(makeFile(), app, defaultSettings),
        ).toBeNull();
    });

    it('returns null when frontmatter lacks the location key', () => {
        const { app } = makeApp({ frontmatter: { title: 'My Note' } });
        expect(
            getFrontMatterLocation(makeFile(), app, defaultSettings),
        ).toBeNull();
    });

    // V1 format – array of numbers: location: [lat, lng]
    it('V1: parses numeric array [lat, lng]', () => {
        const { app } = makeApp({ frontmatter: { location: [32.5, 35.5] } });
        const loc = getFrontMatterLocation(makeFile(), app, defaultSettings);
        expect(loc).not.toBeNull();
        expect(loc!.lat).toBeCloseTo(32.5);
        expect(loc!.lng).toBeCloseTo(35.5);
    });

    // V1 format – array of strings: location: ["32.5", "35.5"]
    it('V1: parses string-typed array ["lat", "lng"]', () => {
        const { app } = makeApp({
            frontmatter: { location: ['32.5', '35.5'] },
        });
        const loc = getFrontMatterLocation(makeFile(), app, defaultSettings);
        expect(loc).not.toBeNull();
        expect(loc!.lat).toBeCloseTo(32.5);
        expect(loc!.lng).toBeCloseTo(35.5);
    });

    // V1 format – negative coordinates
    it('V1: parses negative coordinates', () => {
        const { app } = makeApp({
            frontmatter: { location: [-33.86, 151.21] },
        });
        const loc = getFrontMatterLocation(makeFile(), app, defaultSettings);
        expect(loc).not.toBeNull();
        expect(loc!.lat).toBeCloseTo(-33.86);
        expect(loc!.lng).toBeCloseTo(151.21);
    });

    // V2 format – plain string: location: "lat,lng"
    it('V2: parses plain string "lat,lng"', () => {
        const { app } = makeApp({ frontmatter: { location: '32.5,35.5' } });
        const loc = getFrontMatterLocation(makeFile(), app, defaultSettings);
        expect(loc).not.toBeNull();
        expect(loc!.lat).toBeCloseTo(32.5);
        expect(loc!.lng).toBeCloseTo(35.5);
    });

    // V2 format – string with a space after comma: location: "lat, lng"
    it('V2: parses string with space "lat, lng"', () => {
        const { app } = makeApp({ frontmatter: { location: '32.5, 35.5' } });
        const loc = getFrontMatterLocation(makeFile(), app, defaultSettings);
        expect(loc).not.toBeNull();
        expect(loc!.lat).toBeCloseTo(32.5);
        expect(loc!.lng).toBeCloseTo(35.5);
    });

    // V2 format – negative coordinates in a string
    it('V2: parses string with negative coordinates "-33.86,151.21"', () => {
        const { app } = makeApp({ frontmatter: { location: '-33.86,151.21' } });
        const loc = getFrontMatterLocation(makeFile(), app, defaultSettings);
        expect(loc).not.toBeNull();
        expect(loc!.lat).toBeCloseTo(-33.86);
        expect(loc!.lng).toBeCloseTo(151.21);
    });

    // V3 format – single-element array wrapping a "lat,lng" string: location: ["lat,lng"]
    // (used by Obsidian's property editor which wraps values in lists)
    it('V3: parses single-element array ["lat,lng"]', () => {
        const { app } = makeApp({ frontmatter: { location: ['32.5,35.5'] } });
        const loc = getFrontMatterLocation(makeFile(), app, defaultSettings);
        expect(loc).not.toBeNull();
        expect(loc!.lat).toBeCloseTo(32.5);
        expect(loc!.lng).toBeCloseTo(35.5);
    });

    // Custom frontMatterKey
    it('uses the frontMatterKey from settings', () => {
        const { app } = makeApp({ frontmatter: { coords: [40.0, -74.0] } });
        const settings = {
            ...defaultSettings,
            frontMatterKey: 'coords',
        } as PluginSettings;
        const loc = getFrontMatterLocation(makeFile(), app, settings);
        expect(loc).not.toBeNull();
        expect(loc!.lat).toBeCloseTo(40.0);
        expect(loc!.lng).toBeCloseTo(-74.0);
    });

    // Invalid locations – verifyLocation should reject them and the function returns null
    it('returns null for lat > 90', () => {
        const { app } = makeApp({ frontmatter: { location: [91, 35] } });
        expect(
            getFrontMatterLocation(makeFile(), app, defaultSettings),
        ).toBeNull();
    });

    it('returns null for lat < -90', () => {
        const { app } = makeApp({ frontmatter: { location: [-91, 35] } });
        expect(
            getFrontMatterLocation(makeFile(), app, defaultSettings),
        ).toBeNull();
    });

    it('returns null for lng > 180', () => {
        const { app } = makeApp({ frontmatter: { location: [32, 200] } });
        expect(
            getFrontMatterLocation(makeFile(), app, defaultSettings),
        ).toBeNull();
    });

    it('returns null for lng < -180', () => {
        const { app } = makeApp({ frontmatter: { location: [32, -200] } });
        expect(
            getFrontMatterLocation(makeFile(), app, defaultSettings),
        ).toBeNull();
    });
});

// ─── matchInlineLocation ──────────────────────────────────────────────────────

describe('matchInlineLocation', () => {
    it('new syntax: no tags', () => {
        const m = matchInlineLocation('[My Place](geo:32.1,35.2)');
        expect(m).toHaveLength(1);
        expect(m[0].groups?.name).toBe('My Place');
        expect(parseFloat(m[0].groups?.lat)).toBeCloseTo(32.1);
        expect(parseFloat(m[0].groups?.lng)).toBeCloseTo(35.2);
        expect(m[0].groups?.tags ?? '').toBe('');
    });

    it('new syntax: empty name', () => {
        const m = matchInlineLocation('[](geo:32.1,35.2)');
        expect(m).toHaveLength(1);
        expect(m[0].groups?.name).toBe('');
    });

    it('new syntax: one tag', () => {
        const m = matchInlineLocation('[Place](geo:32.1,35.2) tag:trip');
        expect(m).toHaveLength(1);
        expect(m[0].groups?.tags).toContain('tag:trip');
    });

    it('new syntax: multiple tags', () => {
        const m = matchInlineLocation(
            '[Place](geo:32.1,35.2) tag:trip tag:food',
        );
        expect(m).toHaveLength(1);
        expect(m[0].groups?.tags).toContain('tag:trip');
        expect(m[0].groups?.tags).toContain('tag:food');
    });

    it('new syntax: three tags', () => {
        const m = matchInlineLocation(
            '[Place](geo:32.1,35.2) tag:a tag:b tag:c',
        );
        expect(m).toHaveLength(1);
        expect(m[0].groups?.tags).toContain('tag:a');
        expect(m[0].groups?.tags).toContain('tag:b');
        expect(m[0].groups?.tags).toContain('tag:c');
    });

    it('new syntax: unicode name (Hebrew)', () => {
        const m = matchInlineLocation('[מקום יפה](geo:32.1,35.2)');
        expect(m).toHaveLength(1);
        expect(m[0].groups?.name).toBe('מקום יפה');
    });

    it('new syntax: unicode name (Japanese)', () => {
        const m = matchInlineLocation('[東京タワー](geo:35.658,139.745)');
        expect(m).toHaveLength(1);
        expect(m[0].groups?.name).toBe('東京タワー');
    });

    it('new syntax: emoji name', () => {
        const m = matchInlineLocation('[🏕️ Camp](geo:32.1,35.2)');
        expect(m).toHaveLength(1);
        expect(m[0].groups?.name).toBe('🏕️ Camp');
    });

    it('new syntax: emoji tag', () => {
        const m = matchInlineLocation('[Place](geo:32.1,35.2) tag:🌍');
        expect(m).toHaveLength(1);
        expect(m[0].groups?.tags).toContain('tag:🌍');
    });

    it('new syntax: emoji tag with variation selector (☕️)', () => {
        const m = matchInlineLocation('[Cafe](geo:32.1,35.2) tag:☕️');
        expect(m).toHaveLength(1);
        expect(m[0].groups?.tags).toContain('tag:☕️');
    });

    it('new syntax: emoji tag alongside ASCII tag', () => {
        const m = matchInlineLocation('[Place](geo:32.1,35.2) tag:trip tag:🌍');
        expect(m).toHaveLength(1);
        expect(m[0].groups?.tags).toContain('tag:trip');
        expect(m[0].groups?.tags).toContain('tag:🌍');
    });

    it('new syntax: negative coordinates', () => {
        const m = matchInlineLocation('[Sydney](geo:-33.86,151.21)');
        expect(m).toHaveLength(1);
        expect(parseFloat(m[0].groups?.lat)).toBeCloseTo(-33.86);
        expect(parseFloat(m[0].groups?.lng)).toBeCloseTo(151.21);
    });

    it('old syntax: `location: [lat, lng]` with brackets', () => {
        const m = matchInlineLocation('`location: [32.1, 35.2]`');
        expect(m).toHaveLength(1);
        expect(parseFloat(m[0].groups?.lat)).toBeCloseTo(32.1);
        expect(parseFloat(m[0].groups?.lng)).toBeCloseTo(35.2);
    });

    it('old syntax: `location: lat, lng` without brackets', () => {
        const m = matchInlineLocation('`location: 32.1, 35.2`');
        expect(m).toHaveLength(1);
        expect(parseFloat(m[0].groups?.lat)).toBeCloseTo(32.1);
        expect(parseFloat(m[0].groups?.lng)).toBeCloseTo(35.2);
    });

    it('old syntax: `location: lat,lng` without spaces', () => {
        const m = matchInlineLocation('`location: 32.1,35.2`');
        expect(m).toHaveLength(1);
        expect(parseFloat(m[0].groups?.lat)).toBeCloseTo(32.1);
        expect(parseFloat(m[0].groups?.lng)).toBeCloseTo(35.2);
    });

    it('multiple inline locations in one string', () => {
        const content =
            '[Place A](geo:32.1,35.2) tag:a\n[Place B](geo:40.0,-74.0) tag:b';
        expect(matchInlineLocation(content)).toHaveLength(2);
    });

    it('returns empty array for plain text', () => {
        expect(matchInlineLocation('no locations here')).toHaveLength(0);
    });
});

// ─── getMarkersFromFileContent ─────────────────────────────────────────────────

describe('getMarkersFromFileContent', () => {
    beforeEach(() => {
        vi.mocked(getAllTags).mockReturnValue([]);
    });

    it('returns empty array for file with no inline locations', async () => {
        const { app } = makeApp({ fileContent: 'Just text, no geo links.' });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers).toHaveLength(0);
    });

    // ── new syntax ──

    it('parses a single new-syntax location', async () => {
        const { app } = makeApp({ fileContent: '[My Place](geo:32.5,35.5)' });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers).toHaveLength(1);
        expect(markers[0].location.lat).toBeCloseTo(32.5);
        expect(markers[0].location.lng).toBeCloseTo(35.5);
        expect(markers[0].extraName).toBe('My Place');
    });

    it('extraName is undefined when name is empty', async () => {
        const { app } = makeApp({ fileContent: '[](geo:32.5,35.5)' });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers).toHaveLength(1);
        expect(markers[0].extraName).toBeUndefined();
    });

    it('parses location with negative coordinates', async () => {
        const { app } = makeApp({ fileContent: '[Sydney](geo:-33.86,151.21)' });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers).toHaveLength(1);
        expect(markers[0].location.lat).toBeCloseTo(-33.86);
        expect(markers[0].location.lng).toBeCloseTo(151.21);
    });

    // ── old syntax ──

    it('parses old-syntax location with brackets', async () => {
        const { app } = makeApp({ fileContent: '`location: [32.5, 35.5]`' });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers).toHaveLength(1);
        expect(markers[0].location.lat).toBeCloseTo(32.5);
        expect(markers[0].location.lng).toBeCloseTo(35.5);
    });

    it('parses old-syntax location without brackets', async () => {
        const { app } = makeApp({ fileContent: '`location: 32.5, 35.5`' });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers).toHaveLength(1);
        expect(markers[0].location.lat).toBeCloseTo(32.5);
        expect(markers[0].location.lng).toBeCloseTo(35.5);
    });

    // ── invalid coordinates ──

    it('skips invalid location (lat > 90)', async () => {
        const { app } = makeApp({ fileContent: '[Bad](geo:91.0,35.5)' });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers).toHaveLength(0);
    });

    it('skips invalid location (lng > 180)', async () => {
        const { app } = makeApp({ fileContent: '[Bad](geo:32.0,200.0)' });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers).toHaveLength(0);
    });

    it('skips only invalid marker and keeps valid ones', async () => {
        const content = '[Good](geo:32.0,35.0)\n[Bad](geo:95.0,35.0)';
        const { app } = makeApp({ fileContent: content });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers).toHaveLength(1);
        expect(markers[0].extraName).toBe('Good');
    });

    // ── inline tags ──

    it('assigns a single inline tag to the marker', async () => {
        const { app } = makeApp({
            fileContent: '[Place](geo:32.5,35.5) tag:trip',
        });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers).toHaveLength(1);
        expect(markers[0].tags).toContain('#trip');
    });

    it('assigns multiple inline tags to the marker', async () => {
        const { app } = makeApp({
            fileContent: '[Place](geo:32.5,35.5) tag:trip tag:food',
        });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers[0].tags).toContain('#trip');
        expect(markers[0].tags).toContain('#food');
    });

    it('assigns emoji inline tag', async () => {
        const { app } = makeApp({
            fileContent: '[Place](geo:32.5,35.5) tag:🌍',
        });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers[0].tags).toContain('#🌍');
    });

    it('assigns emoji-with-variation-selector inline tag', async () => {
        const { app } = makeApp({
            fileContent: '[Cafe](geo:32.5,35.5) tag:☕️',
        });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers[0].tags).toContain('#☕️');
    });

    it('assigns unicode (Hebrew) inline tag', async () => {
        const { app } = makeApp({
            fileContent: '[מקום](geo:32.5,35.5) tag:טיול',
        });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers[0].tags).toContain('#טיול');
    });

    it('assigns mixed ASCII + emoji inline tags', async () => {
        const { app } = makeApp({
            fileContent: '[Place](geo:32.5,35.5) tag:trip tag:🌍',
        });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers[0].tags).toContain('#trip');
        expect(markers[0].tags).toContain('#🌍');
    });

    // ── note-level (global) tags ──

    it('adds note-level tags when there are no inline tags', async () => {
        vi.mocked(getAllTags).mockReturnValue(['#global-tag']);
        const { app } = makeApp({ fileContent: '[Place](geo:32.5,35.5)' });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers[0].tags).toContain('#global-tag');
    });

    it('merges inline tags with note-level tags', async () => {
        vi.mocked(getAllTags).mockReturnValue(['#global-tag']);
        const { app } = makeApp({
            fileContent: '[Place](geo:32.5,35.5) tag:inline',
        });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers[0].tags).toContain('#inline');
        expect(markers[0].tags).toContain('#global-tag');
    });

    it('inline tags appear before note-level tags in the array', async () => {
        vi.mocked(getAllTags).mockReturnValue(['#global']);
        const { app } = makeApp({
            fileContent: '[Place](geo:32.5,35.5) tag:inline',
        });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers[0].tags.indexOf('#inline')).toBeLessThan(
            markers[0].tags.indexOf('#global'),
        );
    });

    it('merges multiple note-level tags with multiple inline tags', async () => {
        vi.mocked(getAllTags).mockReturnValue(['#g1', '#g2']);
        const { app } = makeApp({
            fileContent: '[Place](geo:32.5,35.5) tag:i1 tag:i2',
        });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers[0].tags).toContain('#i1');
        expect(markers[0].tags).toContain('#i2');
        expect(markers[0].tags).toContain('#g1');
        expect(markers[0].tags).toContain('#g2');
    });

    // ── multiple markers ──

    it('each marker independently gets note-level tags', async () => {
        vi.mocked(getAllTags).mockReturnValue(['#global']);
        const content = '[A](geo:32.5,35.5) tag:a\n[B](geo:40.0,-74.0) tag:b';
        const { app } = makeApp({ fileContent: content });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers).toHaveLength(2);
        expect(markers[0].tags).toContain('#a');
        expect(markers[0].tags).toContain('#global');
        expect(markers[1].tags).toContain('#b');
        expect(markers[1].tags).toContain('#global');
    });

    it('inline tags are not shared between markers', async () => {
        const content =
            '[Spot1](geo:10.0,20.0) tag:foo\n[Spot2](geo:11.0,21.0) tag:bar';
        const { app } = makeApp({ fileContent: content });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers[0].tags).toContain('#foo');
        expect(markers[0].tags).not.toContain('#bar');
        expect(markers[1].tags).toContain('#bar');
        expect(markers[1].tags).not.toContain('#foo');
    });

    // ── unicode / emoji names ──

    it('parses Hebrew name', async () => {
        const { app } = makeApp({ fileContent: '[מקום](geo:32.5,35.5)' });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers[0].extraName).toBe('מקום');
    });

    it('parses Japanese name', async () => {
        const { app } = makeApp({ fileContent: '[東京](geo:35.68,139.69)' });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers[0].extraName).toBe('東京');
    });

    it('parses emoji-only name', async () => {
        const { app } = makeApp({ fileContent: '[🏕️](geo:32.5,35.5)' });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers[0].extraName).toBe('🏕️');
    });

    it('parses mixed emoji + unicode name with unicode inline tag', async () => {
        const { app } = makeApp({
            fileContent: '[🗺️ מסע](geo:32.5,35.5) tag:טיול',
        });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers[0].extraName).toBe('🗺️ מסע');
        expect(markers[0].tags).toContain('#טיול');
    });

    // ── file positions ──

    it('sets fileLocation to the character offset of the match', async () => {
        const prefix = 'Some text before ';
        const { app } = makeApp({
            fileContent: prefix + '[Place](geo:32.5,35.5)',
        });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers[0].fileLocation).toBe(prefix.length);
    });

    it('sets fileLine correctly for a location on line 2 (0-indexed)', async () => {
        const content = 'line 0\nline 1\n[Place](geo:32.5,35.5)\nline 3';
        const { app } = makeApp({ fileContent: content });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers[0].fileLine).toBe(2);
    });

    it('generates unique IDs for distinct markers in the same file', async () => {
        const content = '[A](geo:32.5,35.5)\n[B](geo:40.0,-74.0)';
        const { app } = makeApp({ fileContent: content });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers).toHaveLength(2);
        expect(markers[0].id).not.toBe(markers[1].id);
    });

    it('stores geolocationMatch on the marker', async () => {
        const { app } = makeApp({ fileContent: '[Place](geo:32.5,35.5)' });
        const markers = await getMarkersFromFileContent(
            makeFile(),
            defaultSettings,
            app,
        );
        expect(markers[0].geolocationMatch).toBeTruthy();
        expect(markers[0].geolocationMatch![0]).toContain('geo:32.5,35.5');
    });
});

// ─── frontmatter + inline combined ────────────────────────────────────────────

describe('getFrontMatterLocation + getMarkersFromFileContent combined', () => {
    beforeEach(() => {
        vi.mocked(getAllTags).mockReturnValue([]);
    });

    it('both functions work independently on the same file', async () => {
        const { app } = makeApp({
            frontmatter: { location: [48.85, 2.35] },
            fileContent: '[Eiffel Tower](geo:48.858,2.295) tag:landmark',
        });
        const file = makeFile();

        const fmLoc = getFrontMatterLocation(file, app, defaultSettings);
        expect(fmLoc!.lat).toBeCloseTo(48.85);
        expect(fmLoc!.lng).toBeCloseTo(2.35);

        const inlineMarkers = await getMarkersFromFileContent(
            file,
            defaultSettings,
            app,
        );
        expect(inlineMarkers).toHaveLength(1);
        expect(inlineMarkers[0].extraName).toBe('Eiffel Tower');
        expect(inlineMarkers[0].tags).toContain('#landmark');
    });

    it('file with frontmatter + multiple inline locations + note tags', async () => {
        vi.mocked(getAllTags).mockReturnValue(['#travel']);
        const { app } = makeApp({
            frontmatter: { location: [32.0, 34.0] },
            fileContent:
                '[Stop A](geo:32.1,34.1) tag:morning\n[Stop B](geo:32.2,34.2) tag:evening',
        });
        const file = makeFile();

        const fmLoc = getFrontMatterLocation(file, app, defaultSettings);
        expect(fmLoc!.lat).toBeCloseTo(32.0);

        const markers = await getMarkersFromFileContent(
            file,
            defaultSettings,
            app,
        );
        expect(markers).toHaveLength(2);

        // Both inline markers inherit the note-level #travel tag
        expect(markers[0].tags).toContain('#travel');
        expect(markers[1].tags).toContain('#travel');

        // Each marker keeps its own inline tag
        expect(markers[0].tags).toContain('#morning');
        expect(markers[0].tags).not.toContain('#evening');
        expect(markers[1].tags).toContain('#evening');
        expect(markers[1].tags).not.toContain('#morning');
    });

    it('frontmatter with V1 array and inline with emoji name + emoji note tag', async () => {
        vi.mocked(getAllTags).mockReturnValue(['#🌟']);
        const { app } = makeApp({
            frontmatter: { location: [35.68, 139.69] },
            fileContent: '[🗼 Tokyo Tower](geo:35.658,139.745) tag:landmark',
        });
        const file = makeFile();

        const fmLoc = getFrontMatterLocation(file, app, defaultSettings);
        expect(fmLoc).not.toBeNull();

        const markers = await getMarkersFromFileContent(
            file,
            defaultSettings,
            app,
        );
        expect(markers[0].extraName).toBe('🗼 Tokyo Tower');
        expect(markers[0].tags).toContain('#landmark');
        expect(markers[0].tags).toContain('#🌟');
    });

    it('frontmatter with V2 string and inline with Hebrew name + Hebrew tags', async () => {
        vi.mocked(getAllTags).mockReturnValue(['#ישראל']);
        const { app } = makeApp({
            frontmatter: { location: '31.78,35.22' },
            fileContent: '[הכותל המערבי](geo:31.7767,35.2345) tag:אתר',
        });
        const file = makeFile();

        const fmLoc = getFrontMatterLocation(file, app, defaultSettings);
        expect(fmLoc!.lat).toBeCloseTo(31.78);
        expect(fmLoc!.lng).toBeCloseTo(35.22);

        const markers = await getMarkersFromFileContent(
            file,
            defaultSettings,
            app,
        );
        expect(markers[0].extraName).toBe('הכותל המערבי');
        expect(markers[0].tags).toContain('#אתר');
        expect(markers[0].tags).toContain('#ישראל');
    });
});
