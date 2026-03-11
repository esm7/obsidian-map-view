import { describe, it, expect } from 'vitest';
import { checkTagPatternMatch } from 'src/markerIcons';

describe('checkTagPatternMatch', () => {
    it('returns true for exact match', () => {
        expect(checkTagPatternMatch('#foo', ['#foo'])).toBe(true);
    });

    it('returns false for non-matching tag', () => {
        expect(checkTagPatternMatch('#foo', ['#bar'])).toBe(false);
    });

    it('returns true for wildcard match', () => {
        expect(checkTagPatternMatch('#trip*', ['#trip-water'])).toBe(true);
    });

    it('returns false for wildcard non-match', () => {
        expect(checkTagPatternMatch('#trip*', ['#food'])).toBe(false);
    });

    it('returns true when matching tag is in the middle of the array', () => {
        expect(checkTagPatternMatch('#b', ['#a', '#b', '#c'])).toBe(true);
    });

    it('returns false for empty tags array', () => {
        expect(checkTagPatternMatch('#foo', [])).toBe(false);
    });

    it('returns true for emoji wildcard match', () => {
        expect(checkTagPatternMatch('#🌍*', ['#🌍-europe'])).toBe(true);
    });

    it('returns true for exact Japanese tag match', () => {
        expect(checkTagPatternMatch('#旅行', ['#旅行'])).toBe(true);
    });

    it('returns false for Japanese tag mismatch', () => {
        expect(checkTagPatternMatch('#旅行', ['#旅游'])).toBe(false);
    });
});
