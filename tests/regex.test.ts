import { describe, it, expect } from 'vitest';
import * as regex from 'src/regex';

describe('INLINE_LOCATION_WITH_TAGS', () => {
    it('extracts name, lat, lng, and tags', () => {
        const input = '[Café](geo:32.1,35.2) tag:trip tag:food';
        const matches = [...input.matchAll(regex.INLINE_LOCATION_WITH_TAGS)];
        expect(matches).toHaveLength(1);
        const m = matches[0];
        expect(m.groups?.name).toBe('Café');
        expect(m.groups?.lat).toBe('32.1');
        expect(m.groups?.lng).toBe('35.2');
        expect(m.groups?.tags).toContain('tag:trip');
        expect(m.groups?.tags).toContain('tag:food');
    });

    it('handles missing tags (tags group is empty)', () => {
        const input = '[Place](geo:32.1,35.2)';
        const matches = [...input.matchAll(regex.INLINE_LOCATION_WITH_TAGS)];
        expect(matches).toHaveLength(1);
        expect(matches[0].groups?.tags).toBe('');
    });

    it('extracts Hebrew name and tag', () => {
        const input = '[מקום](geo:32.1,35.2) tag:טיול';
        const matches = [...input.matchAll(regex.INLINE_LOCATION_WITH_TAGS)];
        expect(matches).toHaveLength(1);
        expect(matches[0].groups?.name).toBe('מקום');
        expect(matches[0].groups?.tags).toContain('tag:טיול');
    });

    it('extracts emoji name', () => {
        // Note: INLINE_LOCATION_WITH_TAGS allows any chars in name (uses [^\]]*?)
        const input = '[🏕️](geo:32.1,35.2) tag:trip';
        const matches = [...input.matchAll(regex.INLINE_LOCATION_WITH_TAGS)];
        expect(matches).toHaveLength(1);
        expect(matches[0].groups?.name).toBe('🏕️');
    });
});

describe('INLINE_LOCATION_WITHOUT_TAGS', () => {
    it('extracts name, lat, lng', () => {
        const input = '[Name](geo:32.1,35.2)';
        const matches = [...input.matchAll(regex.INLINE_LOCATION_WITHOUT_TAGS)];
        expect(matches).toHaveLength(1);
        expect(matches[0].groups?.name).toBe('Name');
        expect(matches[0].groups?.lat).toBe('32.1');
        expect(matches[0].groups?.lng).toBe('35.2');
    });
});

describe('INLINE_LOCATION_OLD_SYNTAX', () => {
    it('extracts lat and lng from backtick syntax', () => {
        const input = '`location: [32.1, 35.2]`';
        const matches = [...input.matchAll(regex.INLINE_LOCATION_OLD_SYNTAX)];
        expect(matches).toHaveLength(1);
        expect(matches[0].groups?.lat).toBe('32.1');
        expect(matches[0].groups?.lng).toBe('35.2');
    });

    it('extracts lat and lng without brackets', () => {
        const input = '`location: 32.1, 35.2`';
        const matches = [...input.matchAll(regex.INLINE_LOCATION_OLD_SYNTAX)];
        expect(matches).toHaveLength(1);
        expect(matches[0].groups?.lat).toBe('32.1');
        expect(matches[0].groups?.lng).toBe('35.2');
    });
});

describe('FRONT_MATTER_LOCATION', () => {
    it('extracts lat and lng from array format', () => {
        const input = '---\nlocation: [32.1,35.2]\n---';
        const match = input.match(regex.FRONT_MATTER_LOCATION);
        expect(match).toBeTruthy();
        expect(match!.groups?.lat).toBe('32.1');
        expect(match!.groups?.lng).toBe('35.2');
    });
});

describe('FRONT_MATTER_LOCATION_V2', () => {
    it('extracts lat and lng from comma-separated format', () => {
        const input = '---\nlocation: 32.1,35.2\n---';
        const match = input.match(regex.FRONT_MATTER_LOCATION_V2);
        expect(match).toBeTruthy();
        expect(match!.groups?.lat).toBe('32.1');
        expect(match!.groups?.lng).toBe('35.2');
    });

    it('extracts lat and lng from quoted format', () => {
        const input = '---\nlocation: "32.1,35.2"\n---';
        const match = input.match(regex.FRONT_MATTER_LOCATION_V2);
        expect(match).toBeTruthy();
        expect(match!.groups?.lat).toBe('32.1');
        expect(match!.groups?.lng).toBe('35.2');
    });
});

describe('FRONT_MATTER_LOCATION_V3', () => {
    it('extracts lat and lng from list format', () => {
        const input = '---\nlocation:\n - "32.1,35.2"\n---';
        const match = input.match(regex.FRONT_MATTER_LOCATION_V3);
        expect(match).toBeTruthy();
        expect(match!.groups?.lat).toBe('32.1');
        expect(match!.groups?.lng).toBe('35.2');
    });
});

describe('COORDINATES', () => {
    it('extracts lat and lng named groups', () => {
        const match = '+40.123, -70.456'.match(regex.COORDINATES);
        expect(match).toBeTruthy();
        expect(match!.groups?.lat).toBe('+40.123');
        expect(match!.groups?.lng).toBe('-70.456');
    });

    it('extracts lat and lng without signs', () => {
        const match = '32.1, 35.2'.match(regex.COORDINATES);
        expect(match).toBeTruthy();
        expect(match!.groups?.lat).toBe('32.1');
        expect(match!.groups?.lng).toBe('35.2');
    });
});

describe('TAG_NAME_WITH_HEADER', () => {
    it('captures a simple ASCII tag', () => {
        const input = 'tag:#my-tag';
        const matches = [...input.matchAll(regex.TAG_NAME_WITH_HEADER)];
        expect(matches).toHaveLength(1);
        expect(matches[0][1]).toBe('#my-tag');
    });

    it('captures Hebrew tag', () => {
        const input = 'tag:#טיול';
        const matches = [...input.matchAll(regex.TAG_NAME_WITH_HEADER)];
        expect(matches).toHaveLength(1);
        expect(matches[0][1]).toBe('#טיול');
    });

    it('captures Japanese tag', () => {
        const input = 'tag:#旅行';
        const matches = [...input.matchAll(regex.TAG_NAME_WITH_HEADER)];
        expect(matches).toHaveLength(1);
        expect(matches[0][1]).toBe('#旅行');
    });

    it('captures emoji tag', () => {
        const input = 'tag:#🌍';
        const matches = [...input.matchAll(regex.TAG_NAME_WITH_HEADER)];
        expect(matches).toHaveLength(1);
        expect(matches[0][1]).toBe('#🌍');
    });

    it('captures emoji tag with variation selector (e.g. ☕️)', () => {
        // ☕️ = U+2615 + U+FE0F (variation selector-16)
        const input = 'tag:#☕️';
        const matches = [...input.matchAll(regex.TAG_NAME_WITH_HEADER)];
        expect(matches).toHaveLength(1);
        expect(matches[0][1]).toBe('#☕️');
    });

    it('captures emoji tag with variation selector (e.g. ⚽️)', () => {
        const input = 'tag:#⚽️';
        const matches = [...input.matchAll(regex.TAG_NAME_WITH_HEADER)];
        expect(matches).toHaveLength(1);
        expect(matches[0][1]).toBe('#⚽️');
    });

    it('captures accented tag', () => {
        const input = 'tag:#café';
        const matches = [...input.matchAll(regex.TAG_NAME_WITH_HEADER)];
        expect(matches).toHaveLength(1);
        expect(matches[0][1]).toBe('#café');
    });
});

describe('TAG_NAME_WITH_HEADER_AND_WILDCARD', () => {
    it('captures a tag with wildcard', () => {
        const input = 'tag:#trip*';
        const matches = [
            ...input.matchAll(regex.TAG_NAME_WITH_HEADER_AND_WILDCARD),
        ];
        expect(matches).toHaveLength(1);
        expect(matches[0][1]).toBe('#trip*');
    });

    it('captures emoji tag with variation selector', () => {
        const input = 'tag:#☕️';
        const matches = [
            ...input.matchAll(regex.TAG_NAME_WITH_HEADER_AND_WILDCARD),
        ];
        expect(matches).toHaveLength(1);
        expect(matches[0][1]).toBe('#☕️');
    });
});

describe('PATH_QUERY_WITH_HEADER', () => {
    it('captures a quoted path', () => {
        const input = 'path:"My Folder/sub"';
        const matches = [...input.matchAll(regex.PATH_QUERY_WITH_HEADER)];
        expect(matches).toHaveLength(1);
        expect(matches[0][1]).toBe('My Folder/sub');
    });
});

describe('INLINE_TAG_IN_NOTE', () => {
    it('captures an ASCII tag without #', () => {
        const input = 'tag:trip';
        const matches = [...input.matchAll(regex.INLINE_TAG_IN_NOTE)];
        expect(matches).toHaveLength(1);
        expect(matches[0].groups?.tag).toBe('trip');
    });

    it('captures a Japanese tag', () => {
        const input = 'tag:旅行';
        const matches = [...input.matchAll(regex.INLINE_TAG_IN_NOTE)];
        expect(matches).toHaveLength(1);
        expect(matches[0].groups?.tag).toBe('旅行');
    });

    it('captures an emoji tag (no variation selector)', () => {
        const input = 'tag:🌍';
        const matches = [...input.matchAll(regex.INLINE_TAG_IN_NOTE)];
        expect(matches).toHaveLength(1);
        expect(matches[0].groups?.tag).toBe('🌍');
    });

    it('captures an emoji tag with variation selector (e.g. ☕️)', () => {
        const input = 'tag:☕️';
        const matches = [...input.matchAll(regex.INLINE_TAG_IN_NOTE)];
        expect(matches).toHaveLength(1);
        expect(matches[0].groups?.tag).toBe('☕️');
    });
});

describe('INLINE_LOCATION_WITH_TAGS emoji tags', () => {
    it('extracts emoji tag without variation selector', () => {
        const input = '[Café](geo:32.1,35.2) tag:🌍';
        const matches = [...input.matchAll(regex.INLINE_LOCATION_WITH_TAGS)];
        expect(matches).toHaveLength(1);
        expect(matches[0].groups?.tags).toContain('tag:🌍');
    });

    it('extracts emoji tag with variation selector (e.g. ☕️)', () => {
        const input = '[Café](geo:32.1,35.2) tag:☕️';
        const matches = [...input.matchAll(regex.INLINE_LOCATION_WITH_TAGS)];
        expect(matches).toHaveLength(1);
        expect(matches[0].groups?.tags).toContain('tag:☕️');
    });
});
