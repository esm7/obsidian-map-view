import { describe, it, expect } from 'vitest';
import {
    escapeDoubleQuotes,
    sanitizePlaceNameForNoteName,
    makeInlineTagsList,
    formatTime,
    djb2Hash,
    formatEmbeddedWithTemplates,
    formatWithTemplates,
    matchByPosition,
    getTagUnderCursor,
} from 'src/utils';
import * as regex from 'src/regex';

describe('escapeDoubleQuotes', () => {
    it('escapes double quotes', () => {
        expect(escapeDoubleQuotes('He said "hi"')).toBe('He said \\"hi\\"');
    });

    it('leaves string unchanged when no quotes', () => {
        expect(escapeDoubleQuotes('hello')).toBe('hello');
    });
});

describe('sanitizePlaceNameForNoteName', () => {
    it('replaces illegal chars with dashes', () => {
        expect(sanitizePlaceNameForNoteName('My?Place/Name')).toBe(
            'My-Place-Name',
        );
    });

    it('leaves legal chars unchanged', () => {
        expect(sanitizePlaceNameForNoteName('NormalName')).toBe('NormalName');
    });

    it('replaces slash in unicode place name, keeps unicode chars', () => {
        expect(sanitizePlaceNameForNoteName('מקום/רחוב')).toBe('מקום-רחוב');
    });
});

describe('makeInlineTagsList', () => {
    it('converts tags array to space-separated tag: list without #', () => {
        expect(makeInlineTagsList(['#foo', '#bar'])).toBe('tag:foo tag:bar');
    });

    it('handles unicode and emoji tags', () => {
        expect(makeInlineTagsList(['#🌍', '#旅行'])).toBe('tag:🌍 tag:旅行');
    });

    it('returns empty string for empty array', () => {
        expect(makeInlineTagsList([])).toBe('');
    });
});

describe('formatTime', () => {
    it('formats minutes under 60', () => {
        expect(formatTime(45)).toBe('45 minutes');
    });

    it('formats exactly 60 minutes as 1:00 hours', () => {
        expect(formatTime(60)).toBe('1:00 hours');
    });

    it('formats 90 minutes as 1:30 hours', () => {
        expect(formatTime(90)).toBe('1:30 hours');
    });

    it('formats 61 minutes as 1:01 hours', () => {
        expect(formatTime(61)).toBe('1:01 hours');
    });
});

describe('djb2Hash', () => {
    it('is deterministic for the same input', () => {
        expect(djb2Hash('hello')).toBe(djb2Hash('hello'));
    });

    it('produces different outputs for different inputs', () => {
        expect(djb2Hash('hello')).not.toBe(djb2Hash('world'));
    });
});

describe('formatEmbeddedWithTemplates', () => {
    it('replaces $filename$ with the given file name', () => {
        expect(formatEmbeddedWithTemplates('Open $filename$', 'Notes')).toBe(
            'Open Notes',
        );
    });

    it('leaves string unchanged when no template', () => {
        expect(formatEmbeddedWithTemplates('No template', 'Notes')).toBe(
            'No template',
        );
    });
});

describe('formatWithTemplates', () => {
    it('replaces {{query}} with the given query string', () => {
        expect(formatWithTemplates('Query: {{query}}', 'foo')).toBe(
            'Query: foo',
        );
    });

    it('replaces {{date:YYYY}} with a 4-digit year', () => {
        const result = formatWithTemplates('Year: {{date:YYYY}}');
        expect(result).toMatch(/Year: \d{4}/);
    });
});

describe('matchByPosition', () => {
    it('returns match when cursor is inside a match', () => {
        const line = 'Hello tag:#foo world';
        const match = matchByPosition(
            line,
            regex.TAG_NAME_WITH_HEADER,
            10, // cursor inside 'tag:#foo'
        );
        expect(match).toBeTruthy();
        expect(match![1]).toBe('#foo');
    });

    it('returns null when cursor is outside all matches', () => {
        const line = 'Hello tag:#foo world';
        const match = matchByPosition(
            line,
            regex.TAG_NAME_WITH_HEADER,
            1, // cursor at 'e' in 'Hello'
        );
        expect(match).toBeNull();
    });
});

describe('getTagUnderCursor', () => {
    it('returns match when cursor is inside a tag expression', () => {
        const line = 'tag:#foo';
        const match = getTagUnderCursor(line, 5);
        expect(match).toBeTruthy();
        expect(match![1]).toBe('#foo');
    });

    it('returns null when cursor is outside any tag expression', () => {
        const line = 'hello world';
        const match = getTagUnderCursor(line, 5);
        expect(match).toBeNull();
    });

    it('returns match for a unicode tag under cursor', () => {
        const line = 'tag:#旅行';
        const match = getTagUnderCursor(line, 5);
        expect(match).toBeTruthy();
        expect(match![1]).toBe('#旅行');
    });
});
