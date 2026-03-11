import { describe, it, expect } from 'vitest';
import * as leaflet from 'leaflet';
import {
    copyState,
    mergeStates,
    areStatesEqual,
    stateToRawObject,
    stateFromParsedUrl,
    getCodeBlock,
    type MapState,
} from 'src/mapState';

function baseState(): MapState {
    return {
        name: 'test',
        mapZoom: 10,
        mapCenter: new leaflet.LatLng(32.0, 35.0),
        query: '',
        queryError: false,
        chosenMapSource: 0,
        forceHistorySave: false,
        followActiveNote: false,
        followMyLocation: false,
        embeddedHeight: 0,
        autoFit: false,
        lock: false,
        showLinks: false,
        linkColor: '#ff0000',
        markerLabels: 'off',
        editMode: false,
    };
}

describe('copyState', () => {
    it('returns a new object with the same values', () => {
        const s = baseState();
        const copy = copyState(s);
        expect(copy).not.toBe(s);
        expect(copy.mapZoom).toBe(s.mapZoom);
        expect(copy.query).toBe(s.query);
        expect(copy.mapCenter).toBe(s.mapCenter); // shallow copy - same reference
    });
});

describe('mergeStates', () => {
    it('second state overrides first for defined values', () => {
        const s1 = baseState();
        const s2: Partial<MapState> = { mapZoom: 15, query: 'tag:#foo' };
        const merged = mergeStates(s1, s2);
        expect(merged.mapZoom).toBe(15);
        expect(merged.query).toBe('tag:#foo');
    });

    it('null values in second state are ignored (first state value kept)', () => {
        const s1 = baseState();
        const s2: Partial<MapState> = { mapZoom: null as any, query: 'foo' };
        const merged = mergeStates(s1, s2);
        expect(merged.mapZoom).toBe(s1.mapZoom);
        expect(merged.query).toBe('foo');
    });

    it('undefined values in second state are ignored', () => {
        const s1 = baseState();
        const s2: Partial<MapState> = { mapZoom: undefined, query: 'bar' };
        const merged = mergeStates(s1, s2);
        expect(merged.mapZoom).toBe(s1.mapZoom);
        expect(merged.query).toBe('bar');
    });

    it('unmentioned keys from first state are preserved', () => {
        const s1 = baseState();
        const s2: Partial<MapState> = { query: 'test' };
        const merged = mergeStates(s1, s2);
        expect(merged.chosenMapSource).toBe(s1.chosenMapSource);
        expect(merged.linkColor).toBe(s1.linkColor);
    });

    it('returns a new object (not same reference as either input)', () => {
        const s1 = baseState();
        const s2: Partial<MapState> = { query: 'x' };
        const merged = mergeStates(s1, s2);
        expect(merged).not.toBe(s1);
        expect(merged).not.toBe(s2);
    });
});

describe('areStatesEqual', () => {
    it('identical states return true', () => {
        const s1 = baseState();
        const s2 = baseState();
        expect(areStatesEqual(s1, s2)).toBe(true);
    });

    it('different query returns false', () => {
        const s1 = baseState();
        const s2 = { ...baseState(), query: 'tag:#foo' };
        expect(areStatesEqual(s1, s2)).toBe(false);
    });

    it('different mapZoom returns false', () => {
        const s1 = baseState();
        const s2 = { ...baseState(), mapZoom: 5 };
        expect(areStatesEqual(s1, s2)).toBe(false);
    });

    it('different chosenMapSource returns false', () => {
        const s1 = baseState();
        const s2 = { ...baseState(), chosenMapSource: 1 };
        expect(areStatesEqual(s1, s2)).toBe(false);
    });

    it('markerLabels undefined vs "off" are treated as equal', () => {
        const s1 = { ...baseState(), markerLabels: undefined as any };
        const s2 = { ...baseState(), markerLabels: 'off' as const };
        expect(areStatesEqual(s1, s2)).toBe(true);
    });

    it('returns false when either state is null/undefined', () => {
        const s = baseState();
        expect(areStatesEqual(null as any, s)).toBe(false);
        expect(areStatesEqual(s, null as any)).toBe(false);
    });
});

describe('stateToRawObject', () => {
    it('converts mapCenter.lat/lng to centerLat/centerLng', () => {
        const s = baseState();
        const raw = stateToRawObject(s);
        expect(raw.centerLat).toBe(32.0);
        expect(raw.centerLng).toBe(35.0);
        expect((raw as any).mapCenter).toBeUndefined();
    });

    it('embeddedHeight only present when truthy', () => {
        const s = baseState();
        const raw = stateToRawObject(s);
        expect((raw as any).embeddedHeight).toBeUndefined();

        const sWithHeight = { ...baseState(), embeddedHeight: 400 };
        const rawWithHeight = stateToRawObject(sWithHeight);
        expect(rawWithHeight.embeddedHeight).toBe(400);
    });
});

describe('stateFromParsedUrl', () => {
    it('round-trips through stateToRawObject', () => {
        const s = baseState();
        const raw = stateToRawObject(s);
        const parsed = stateFromParsedUrl(raw);
        expect(parsed.mapZoom).toBe(s.mapZoom);
        expect(parsed.mapCenter?.lat).toBeCloseTo(s.mapCenter.lat);
        expect(parsed.mapCenter?.lng).toBeCloseTo(s.mapCenter.lng);
        expect(parsed.query).toBe(s.query);
    });

    it('parses mapZoom as integer from string', () => {
        const parsed = stateFromParsedUrl({ mapZoom: '12' });
        expect(parsed.mapZoom).toBe(12);
        expect(typeof parsed.mapZoom).toBe('number');
    });

    it('parses centerLat/centerLng as floats into mapCenter LatLng', () => {
        const parsed = stateFromParsedUrl({
            centerLat: '48.8566',
            centerLng: '2.3522',
        });
        expect(parsed.mapCenter).toBeInstanceOf(leaflet.LatLng);
        expect(parsed.mapCenter?.lat).toBeCloseTo(48.8566);
        expect(parsed.mapCenter?.lng).toBeCloseTo(2.3522);
    });

    it('returns null mapCenter when lat/lng missing', () => {
        const parsed = stateFromParsedUrl({});
        expect(parsed.mapCenter).toBeNull();
    });
});

describe('getCodeBlock', () => {
    it('output contains mapview fence', () => {
        const s = baseState();
        const block = getCodeBlock(s);
        expect(block).toContain('```mapview');
        expect(block).toContain('```');
    });

    it('content between fences is valid JSON with expected fields', () => {
        const s = baseState();
        const block = getCodeBlock(s);
        // Extract JSON between the fences
        const match = block.match(/```mapview\n([\s\S]*?)\n```/);
        expect(match).toBeTruthy();
        const json = JSON.parse(match![1]);
        expect(json.centerLat).toBe(32.0);
        expect(json.centerLng).toBe(35.0);
        expect(json.mapZoom).toBe(10);
    });
});
