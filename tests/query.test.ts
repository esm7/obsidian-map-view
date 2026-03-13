import { describe, it, expect } from 'vitest';
import { Query, normalizePropertyValues, unquote } from 'src/query';

// Helper to create a minimal mock layer
function mockLayer(overrides: Record<string, any> = {}): any {
    return {
        tags: [],
        extraName: null,
        fileLine: null,
        file: {
            name: 'test.md',
            path: 'folder/test.md',
            basename: 'test',
        },
        ...overrides,
    };
}

describe('normalizePropertyValues', () => {
    it('normalizes a string to lowercase array', () => {
        expect(normalizePropertyValues('Value')).toEqual(['value']);
    });

    it('normalizes a number to string array', () => {
        expect(normalizePropertyValues(42)).toEqual(['42']);
    });

    it('normalizes true to string array', () => {
        expect(normalizePropertyValues(true)).toEqual(['true']);
    });

    it('normalizes false to string array', () => {
        expect(normalizePropertyValues(false)).toEqual(['false']);
    });

    it('normalizes null to ["null"]', () => {
        expect(normalizePropertyValues(null)).toEqual(['null']);
    });

    it('flattens nested arrays', () => {
        expect(normalizePropertyValues(['a', ['b', 'c']])).toEqual([
            'a',
            'b',
            'c',
        ]);
    });

    it('normalizes mixed array', () => {
        expect(normalizePropertyValues([true, 1, 'Test'])).toEqual([
            'true',
            '1',
            'test',
        ]);
    });
});

describe('unquote', () => {
    it('unquotes a double-quoted string', () => {
        expect(unquote('"hello"')).toEqual([true, 'hello']);
    });

    it('unquotes a single-quoted string', () => {
        expect(unquote("'world'")).toEqual([true, 'world']);
    });

    it('returns false for unquoted string', () => {
        expect(unquote('noQuotes')).toEqual([false, 'noQuotes']);
    });

    it('returns false for empty string', () => {
        expect(unquote('')).toEqual([false, '']);
    });
});

describe('Query.testLayer', () => {
    it('empty query always returns true', () => {
        const q = new Query(null as any, '');
        expect(q.testLayer(mockLayer())).toBe(true);
    });

    it('null query always returns true', () => {
        const q = new Query(null as any, null as any);
        expect(q.testLayer(mockLayer())).toBe(true);
    });

    it('tag query matches layer with that tag', () => {
        const q = new Query(null as any, 'tag:#foo');
        expect(q.testLayer(mockLayer({ tags: ['#foo'] }))).toBe(true);
    });

    it('tag query does not match layer without that tag', () => {
        const q = new Query(null as any, 'tag:#foo');
        expect(q.testLayer(mockLayer({ tags: ['#bar'] }))).toBe(false);
    });

    it('wildcard tag matches prefix variants', () => {
        const q = new Query(null as any, 'tag:#trip*');
        expect(q.testLayer(mockLayer({ tags: ['#trip-water'] }))).toBe(true);
    });

    it('wildcard tag does not match unrelated tags', () => {
        const q = new Query(null as any, 'tag:#trip*');
        expect(q.testLayer(mockLayer({ tags: ['#food'] }))).toBe(false);
    });

    it('name query matches extraName case-insensitively', () => {
        const q = new Query(null as any, 'name:note');
        expect(q.testLayer(mockLayer({ extraName: 'My Note' }))).toBe(true);
    });

    it('name query matches file name when no extraName', () => {
        const q = new Query(null as any, 'name:note');
        expect(
            q.testLayer(
                mockLayer({
                    extraName: null,
                    file: {
                        name: 'note.md',
                        path: 'note.md',
                        basename: 'note',
                    },
                }),
            ),
        ).toBe(true);
    });

    it('path query matches file path', () => {
        const q = new Query(null as any, 'path:folder');
        expect(q.testLayer(mockLayer())).toBe(true);
    });

    it('path query does not match unrelated path', () => {
        const q = new Query(null as any, 'path:other');
        expect(q.testLayer(mockLayer())).toBe(false);
    });

    it('lines query matches layer with fileLine in range', () => {
        const q = new Query(null as any, 'lines:5-10');
        expect(q.testLayer(mockLayer({ fileLine: 7 }))).toBe(true);
    });

    it('lines query does not match layer with fileLine out of range', () => {
        const q = new Query(null as any, 'lines:5-10');
        expect(q.testLayer(mockLayer({ fileLine: 11 }))).toBe(false);
    });

    it('lines query does not match layer without fileLine', () => {
        const q = new Query(null as any, 'lines:5-10');
        expect(q.testLayer(mockLayer({ fileLine: null }))).toBe(false);
    });

    it('AND query requires both conditions', () => {
        const q = new Query(null as any, 'tag:#foo AND tag:#bar');
        expect(q.testLayer(mockLayer({ tags: ['#foo', '#bar'] }))).toBe(true);
        expect(q.testLayer(mockLayer({ tags: ['#foo'] }))).toBe(false);
    });

    it('OR query requires either condition', () => {
        const q = new Query(null as any, 'tag:#foo OR tag:#bar');
        expect(q.testLayer(mockLayer({ tags: ['#foo'] }))).toBe(true);
        expect(q.testLayer(mockLayer({ tags: ['#bar'] }))).toBe(true);
        expect(q.testLayer(mockLayer({ tags: ['#baz'] }))).toBe(false);
    });

    it('NOT query inverts match', () => {
        const q = new Query(null as any, 'NOT tag:#foo');
        expect(q.testLayer(mockLayer({ tags: ['#foo'] }))).toBe(false);
        expect(q.testLayer(mockLayer({ tags: ['#bar'] }))).toBe(true);
    });

    it('compound query with parentheses', () => {
        const q = new Query(
            null as any,
            '(tag:#foo OR tag:#bar) AND path:folder',
        );
        expect(q.testLayer(mockLayer({ tags: ['#foo'] }))).toBe(true);
        expect(q.testLayer(mockLayer({ tags: ['#bar'] }))).toBe(true);
        expect(
            q.testLayer(
                mockLayer({
                    tags: ['#foo'],
                    file: { name: 'x.md', path: 'other/x.md', basename: 'x' },
                }),
            ),
        ).toBe(false);
    });

    // Unicode / emoji query cases
    it('Hebrew tag query matches layer with Hebrew tag', () => {
        const q = new Query(null as any, 'tag:#טיול');
        expect(q.testLayer(mockLayer({ tags: ['#טיול'] }))).toBe(true);
    });

    it('Japanese tag query matches layer with Japanese tag', () => {
        const q = new Query(null as any, 'tag:#旅行');
        expect(q.testLayer(mockLayer({ tags: ['#旅行'] }))).toBe(true);
    });

    it('emoji tag query matches layer with emoji tag', () => {
        const q = new Query(null as any, 'tag:#🌍');
        expect(q.testLayer(mockLayer({ tags: ['#🌍'] }))).toBe(true);
    });

    it('Hebrew name query matches layer with Hebrew extraName', () => {
        const q = new Query(null as any, 'name:מקום');
        expect(q.testLayer(mockLayer({ extraName: 'מקום' }))).toBe(true);
    });

    it('accented tag query matches layer with accented tag', () => {
        const q = new Query(null as any, 'tag:#café');
        expect(q.testLayer(mockLayer({ tags: ['#café'] }))).toBe(true);
    });

    it('wildcard matches tag with emoji suffix', () => {
        const q = new Query(null as any, 'tag:#trip*');
        expect(q.testLayer(mockLayer({ tags: ['#trip-🏕️'] }))).toBe(true);
    });

    // Emoji tags with variation selectors (U+FE0F) — issue #385
    // These emojis are two code points: base emoji + variation selector-16 (️).
    // The query preprocessor regex must include variation selectors, otherwise the
    // variation selector ends up outside the quoted token and crashes boon-js.
    it('does not crash when constructing query with emoji+variation-selector tag (☕️)', () => {
        expect(() => new Query(null as any, 'tag:#☕️')).not.toThrow();
    });

    it('does not crash when constructing query with emoji+variation-selector tag (⚽️)', () => {
        expect(() => new Query(null as any, 'tag:#⚽️')).not.toThrow();
    });

    it('does not crash when constructing query with emoji+variation-selector tag (🏔️)', () => {
        expect(() => new Query(null as any, 'tag:#🏔️')).not.toThrow();
    });

    it('emoji+variation-selector tag query matches layer with that tag', () => {
        const q = new Query(null as any, 'tag:#☕️');
        expect(q.testLayer(mockLayer({ tags: ['#☕️'] }))).toBe(true);
    });

    it('emoji+variation-selector tag query does not match layer without that tag', () => {
        const q = new Query(null as any, 'tag:#☕️');
        expect(q.testLayer(mockLayer({ tags: ['#🍵'] }))).toBe(false);
    });
});
