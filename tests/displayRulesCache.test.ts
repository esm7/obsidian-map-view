import { describe, it, expect } from 'vitest';
import { DisplayRulesCache } from 'src/displayRulesCache';
import type { DisplayRule } from 'src/settings';
import type { App } from 'obsidian';

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal BaseGeoLayer-like object sufficient for display rule matching.
 * The default has no tags and points to a dummy file; pass `overrides` to
 * customise individual fields (e.g. `{ tags: ['#trip'] }` to trigger tag-based rules).
 */
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

/**
 * Build a DisplayRulesCache pre-loaded with the given rules.
 * The rules array must always start with a preset rule (query: '', preset: true)
 * because DisplayRulesCache.getDefaults() expects one to be present.
 * Passing `null` as the App is safe here because the Query objects only need
 * the app for `linkedfrom:` queries, which none of these tests use.
 */
function makeCache(rules: DisplayRule[]): DisplayRulesCache {
    const cache = new DisplayRulesCache(null as unknown as App);
    cache.build(rules);
    return cache;
}

// ─── PRESET rule ──────────────────────────────────────────────────────────────

const PRESET: DisplayRule = {
    query: '',
    preset: true,
    iconDetails: {
        prefix: 'fas',
        icon: 'fa-circle',
        markerColor: 'blue',
        shape: 'circle',
        opacity: 1.0,
    },
    pathOptions: { color: 'blue', weight: 5, opacity: 0.8 },
    badgeOptions: {},
};

// ─── Scenario 1: no non-preset rules — everything comes from preset ────────────

describe('Scenario: only the preset rule', () => {
    it('returns all preset iconDetails fields', () => {
        const [icon] = makeCache([PRESET]).runOn(mockLayer());
        expect(icon.prefix).toBe('fas');
        expect(icon.icon).toBe('fa-circle');
        expect(icon.markerColor).toBe('blue');
        expect(icon.shape).toBe('circle');
        expect(icon.opacity).toBe(1.0);
    });

    it('returns all preset pathOptions fields', () => {
        const [, path] = makeCache([PRESET]).runOn(mockLayer());
        expect(path.color).toBe('blue');
        expect(path.weight).toBe(5);
        expect(path.opacity).toBe(0.8);
    });

    it('returns an empty badge array', () => {
        const [, , badges] = makeCache([PRESET]).runOn(mockLayer());
        expect(badges).toHaveLength(0);
    });
});

// ─── Scenario 2: one non-matching rule ────────────────────────────────────────

describe('Scenario: one non-matching rule', () => {
    const cache = makeCache([
        PRESET,
        {
            query: 'tag:#trip',
            preset: false,
            iconDetails: { markerColor: 'green', icon: 'fa-hiking' },
            pathOptions: { color: 'green', weight: 3 },
            badgeOptions: { badge: '★' },
        },
    ]);

    it('iconDetails unchanged from preset', () => {
        const [icon] = cache.runOn(mockLayer({ tags: [] }));
        expect(icon.markerColor).toBe('blue');
        expect(icon.icon).toBe('fa-circle');
    });

    it('pathOptions unchanged from preset', () => {
        const [, path] = cache.runOn(mockLayer({ tags: [] }));
        expect(path.color).toBe('blue');
        expect(path.weight).toBe(5);
    });

    it('no badges accumulated', () => {
        const [, , badges] = cache.runOn(mockLayer({ tags: [] }));
        expect(badges).toHaveLength(0);
    });
});

// ─── Scenario 3: one fully specified matching rule ────────────────────────────

describe('Scenario: one fully specified matching rule', () => {
    const cache = makeCache([
        PRESET,
        {
            query: 'tag:#trip',
            preset: false,
            iconDetails: {
                markerColor: 'green',
                icon: 'fa-hiking',
                shape: 'square',
                opacity: 0.7,
            },
            pathOptions: { color: 'green', weight: 3, opacity: 0.5 },
            badgeOptions: { badge: '★', textColor: 'gold', backColor: 'black' },
        },
    ]);
    const layer = mockLayer({ tags: ['#trip'] });

    it('all iconDetails fields overridden', () => {
        const [icon] = cache.runOn(layer);
        expect(icon.markerColor).toBe('green');
        expect(icon.icon).toBe('fa-hiking');
        expect(icon.shape).toBe('square');
        expect(icon.opacity).toBe(0.7);
    });

    it('prefix is preserved from preset (rule did not specify it)', () => {
        const [icon] = cache.runOn(layer);
        expect(icon.prefix).toBe('fas');
    });

    it('all pathOptions fields overridden', () => {
        const [, path] = cache.runOn(layer);
        expect(path.color).toBe('green');
        expect(path.weight).toBe(3);
        expect(path.opacity).toBe(0.5);
    });

    it('badge accumulated with all properties', () => {
        const [, , badges] = cache.runOn(layer);
        expect(badges).toHaveLength(1);
        expect(badges[0].badge).toBe('★');
        expect(badges[0].textColor).toBe('gold');
        expect(badges[0].backColor).toBe('black');
    });
});

// ─── Scenario 4: one partial matching rule ────────────────────────────────────
//
// Only some fields in iconDetails and pathOptions are specified.
// Unspecified fields must remain at their preset values.

describe('Scenario: one partial matching rule', () => {
    const cache = makeCache([
        PRESET,
        {
            query: 'tag:#trip',
            preset: false,
            iconDetails: { markerColor: 'orange' }, // only colour
            pathOptions: { weight: 10 }, // only weight
            badgeOptions: { badge: '!' }, // only badge text
        },
    ]);
    const layer = mockLayer({ tags: ['#trip'] });

    it('specified iconDetails field overridden', () => {
        const [icon] = cache.runOn(layer);
        expect(icon.markerColor).toBe('orange');
    });

    it('unspecified iconDetails fields preserved from preset', () => {
        const [icon] = cache.runOn(layer);
        expect(icon.icon).toBe('fa-circle');
        expect(icon.prefix).toBe('fas');
        expect(icon.shape).toBe('circle');
        expect(icon.opacity).toBe(1.0);
    });

    it('specified pathOptions field overridden', () => {
        const [, path] = cache.runOn(layer);
        expect(path.weight).toBe(10);
    });

    it('unspecified pathOptions fields preserved from preset', () => {
        const [, path] = cache.runOn(layer);
        expect(path.color).toBe('blue');
        expect(path.opacity).toBe(0.8);
    });

    it('badge accumulated despite having only one property', () => {
        const [, , badges] = cache.runOn(layer);
        expect(badges).toHaveLength(1);
        expect(badges[0].badge).toBe('!');
    });
});

// ─── Scenario 5: rule with empty iconDetails / pathOptions objects ─────────────
//
// An empty {} for iconDetails or pathOptions should not crash and should not
// change any values (Object.assign with empty object is a no-op).

describe('Scenario: matching rule with empty iconDetails and pathOptions', () => {
    const cache = makeCache([
        PRESET,
        {
            query: 'tag:#trip',
            preset: false,
            iconDetails: {},
            pathOptions: {},
        },
    ]);
    const layer = mockLayer({ tags: ['#trip'] });

    it('iconDetails unchanged', () => {
        const [icon] = cache.runOn(layer);
        expect(icon.markerColor).toBe('blue');
        expect(icon.icon).toBe('fa-circle');
    });

    it('pathOptions unchanged', () => {
        const [, path] = cache.runOn(layer);
        expect(path.color).toBe('blue');
        expect(path.weight).toBe(5);
    });

    it('no badges added', () => {
        const [, , badges] = cache.runOn(layer);
        expect(badges).toHaveLength(0);
    });
});

// ─── Scenario 6: rule with no iconDetails / pathOptions / badgeOptions at all ──

describe('Scenario: matching rule missing iconDetails, pathOptions, and badgeOptions', () => {
    const cache = makeCache([PRESET, { query: 'tag:#trip', preset: false }]);

    it('does not throw', () => {
        expect(() => cache.runOn(mockLayer({ tags: ['#trip'] }))).not.toThrow();
    });

    it('all results remain at preset values', () => {
        const [icon, path, badges] = cache.runOn(
            mockLayer({ tags: ['#trip'] }),
        );
        expect(icon.markerColor).toBe('blue');
        expect(path.color).toBe('blue');
        expect(badges).toHaveLength(0);
    });
});

// ─── Scenario 7: two matching rules with overlapping fields ───────────────────
//
// Later rule wins for iconDetails and pathOptions; badges accumulate.

describe('Scenario: two rules both matching, overlapping fields', () => {
    const cache = makeCache([
        PRESET,
        {
            query: 'tag:#trip',
            preset: false,
            iconDetails: { markerColor: 'green', icon: 'fa-hiking' },
            pathOptions: { color: 'green', weight: 3 },
            badgeOptions: { badge: '🏕️' },
        },
        {
            query: 'tag:#trip',
            preset: false,
            iconDetails: { markerColor: 'gold' }, // overrides colour only
            pathOptions: { color: 'gold' }, // overrides colour only
            badgeOptions: { badge: '⭐' }, // adds second badge
        },
    ]);
    const layer = mockLayer({ tags: ['#trip'] });

    it('later rule wins for overlapping iconDetails field (markerColor)', () => {
        const [icon] = cache.runOn(layer);
        expect(icon.markerColor).toBe('gold');
    });

    it('earlier rule preserved for non-overlapping iconDetails field (icon)', () => {
        const [icon] = cache.runOn(layer);
        expect(icon.icon).toBe('fa-hiking');
    });

    it('later rule wins for overlapping pathOptions field (color)', () => {
        const [, path] = cache.runOn(layer);
        expect(path.color).toBe('gold');
    });

    it('earlier rule preserved for non-overlapping pathOptions field (weight)', () => {
        const [, path] = cache.runOn(layer);
        expect(path.weight).toBe(3);
    });

    it('badges from both rules accumulate in order', () => {
        const [, , badges] = cache.runOn(layer);
        expect(badges).toHaveLength(2);
        expect(badges[0].badge).toBe('🏕️');
        expect(badges[1].badge).toBe('⭐');
    });
});

// ─── Scenario 8: two rules targeting different tags, only one matches ──────────

describe('Scenario: two rules for different tags, one matches', () => {
    const cache = makeCache([
        PRESET,
        {
            query: 'tag:#trip',
            preset: false,
            iconDetails: { markerColor: 'green' },
            pathOptions: { color: 'green' },
            badgeOptions: { badge: '🏕️' },
        },
        {
            query: 'tag:#work',
            preset: false,
            iconDetails: { markerColor: 'red' },
            pathOptions: { color: 'red' },
            badgeOptions: { badge: '💼' },
        },
    ]);

    it('only the matching rule is applied (trip layer)', () => {
        const [icon, path, badges] = cache.runOn(
            mockLayer({ tags: ['#trip'] }),
        );
        expect(icon.markerColor).toBe('green');
        expect(path.color).toBe('green');
        expect(badges).toHaveLength(1);
        expect(badges[0].badge).toBe('🏕️');
    });

    it('only the matching rule is applied (work layer)', () => {
        const [icon, path, badges] = cache.runOn(
            mockLayer({ tags: ['#work'] }),
        );
        expect(icon.markerColor).toBe('red');
        expect(path.color).toBe('red');
        expect(badges).toHaveLength(1);
        expect(badges[0].badge).toBe('💼');
    });

    it('neither rule matches: preset values returned', () => {
        const [icon, path, badges] = cache.runOn(
            mockLayer({ tags: ['#other'] }),
        );
        expect(icon.markerColor).toBe('blue');
        expect(path.color).toBe('blue');
        expect(badges).toHaveLength(0);
    });
});

// ─── Scenario 9: layer matches multiple rules with non-overlapping fields ──────
//
// Three rules each adding distinct iconDetails / pathOptions fields.
// All fields from all matching rules should be present in the result.

describe('Scenario: three rules with non-overlapping fields all matching', () => {
    const cache = makeCache([
        PRESET,
        {
            query: 'tag:#trip',
            preset: false,
            iconDetails: { icon: 'fa-hiking' }, // only icon name
        },
        {
            query: 'tag:#trip',
            preset: false,
            iconDetails: { markerColor: 'orange' }, // only colour
        },
        {
            query: 'tag:#trip',
            preset: false,
            pathOptions: { weight: 8 }, // only path weight
        },
    ]);
    const layer = mockLayer({ tags: ['#trip'] });

    it('icon name from rule 1', () => {
        const [icon] = cache.runOn(layer);
        expect(icon.icon).toBe('fa-hiking');
    });

    it('markerColor from rule 2', () => {
        const [icon] = cache.runOn(layer);
        expect(icon.markerColor).toBe('orange');
    });

    it('weight from rule 3', () => {
        const [, path] = cache.runOn(layer);
        expect(path.weight).toBe(8);
    });

    it('other fields still come from preset', () => {
        const [icon, path] = cache.runOn(layer);
        expect(icon.prefix).toBe('fas');
        expect(path.color).toBe('blue');
        expect(path.opacity).toBe(0.8);
    });
});

// ─── Scenario 10: badges from many rules accumulate ──────────────────────────

describe('Scenario: multiple badge-only rules accumulate', () => {
    const cache = makeCache([
        PRESET,
        {
            query: 'tag:#a',
            preset: false,
            badgeOptions: { badge: 'A', backColor: 'red' },
        },
        {
            query: 'tag:#b',
            preset: false,
            badgeOptions: { badge: 'B', backColor: 'blue' },
        },
        {
            query: 'tag:#c',
            preset: false,
            badgeOptions: { badge: 'C', backColor: 'green' },
        },
    ]);

    it('layer with all three tags has all three badges in order', () => {
        const [, , badges] = cache.runOn(
            mockLayer({ tags: ['#a', '#b', '#c'] }),
        );
        expect(badges).toHaveLength(3);
        expect(badges.map((b: any) => b.badge)).toEqual(['A', 'B', 'C']);
    });

    it('layer with two tags has exactly two badges', () => {
        const [, , badges] = cache.runOn(mockLayer({ tags: ['#a', '#c'] }));
        expect(badges).toHaveLength(2);
        expect(badges[0].badge).toBe('A');
        expect(badges[1].badge).toBe('C');
    });

    it('each badge carries its own backColor', () => {
        const [, , badges] = cache.runOn(
            mockLayer({ tags: ['#a', '#b', '#c'] }),
        );
        expect(badges[0].backColor).toBe('red');
        expect(badges[1].backColor).toBe('blue');
        expect(badges[2].backColor).toBe('green');
    });
});

// ─── Scenario 11: mixed — some rules have all three sections, some partial ─────

describe('Scenario: mixed rules, some full, some partial, some empty', () => {
    const cache = makeCache([
        PRESET,
        // Rule 1: full specification
        {
            query: 'tag:#featured',
            preset: false,
            iconDetails: { markerColor: 'gold', icon: 'fa-star', opacity: 0.9 },
            pathOptions: { color: 'gold', weight: 6, opacity: 0.9 },
            badgeOptions: {
                badge: '⭐',
                textColor: 'white',
                backColor: 'gold',
            },
        },
        // Rule 2: only pathOptions
        {
            query: 'tag:#important',
            preset: false,
            pathOptions: { weight: 10 },
        },
        // Rule 3: only a badge, no icon or path changes
        {
            query: 'tag:#urgent',
            preset: false,
            badgeOptions: {
                badge: '!',
                textColor: 'red',
                border: '2px solid red',
            },
        },
        // Rule 4: empty iconDetails and pathOptions objects
        {
            query: 'tag:#tagged',
            preset: false,
            iconDetails: {},
            pathOptions: {},
        },
    ]);

    it('layer with #featured: all three sections applied', () => {
        const [icon, path, badges] = cache.runOn(
            mockLayer({ tags: ['#featured'] }),
        );
        expect(icon.markerColor).toBe('gold');
        expect(icon.icon).toBe('fa-star');
        expect(icon.opacity).toBe(0.9);
        expect(path.color).toBe('gold');
        expect(path.weight).toBe(6);
        expect(badges).toHaveLength(1);
        expect(badges[0].badge).toBe('⭐');
    });

    it('layer with #important: only weight changed, rest from preset', () => {
        const [icon, path, badges] = cache.runOn(
            mockLayer({ tags: ['#important'] }),
        );
        expect(icon.markerColor).toBe('blue'); // preset
        expect(path.weight).toBe(10); // from rule
        expect(path.color).toBe('blue'); // preset
        expect(badges).toHaveLength(0);
    });

    it('layer with #urgent: only badge added, icon and path from preset', () => {
        const [icon, path, badges] = cache.runOn(
            mockLayer({ tags: ['#urgent'] }),
        );
        expect(icon.markerColor).toBe('blue');
        expect(path.color).toBe('blue');
        expect(badges).toHaveLength(1);
        expect(badges[0].badge).toBe('!');
        expect(badges[0].border).toBe('2px solid red');
    });

    it('layer with #tagged: empty objects are no-ops', () => {
        const [icon, path, badges] = cache.runOn(
            mockLayer({ tags: ['#tagged'] }),
        );
        expect(icon.markerColor).toBe('blue');
        expect(path.color).toBe('blue');
        expect(badges).toHaveLength(0);
    });

    it('layer with #featured + #important + #urgent: all rules combine', () => {
        const [icon, path, badges] = cache.runOn(
            mockLayer({ tags: ['#featured', '#important', '#urgent'] }),
        );
        expect(icon.markerColor).toBe('gold'); // from #featured
        expect(path.weight).toBe(10); // #important overrides #featured's 6
        expect(path.color).toBe('gold'); // from #featured
        expect(badges).toHaveLength(2); // ⭐ from #featured, ! from #urgent
        expect(badges[0].badge).toBe('⭐');
        expect(badges[1].badge).toBe('!');
    });

    it('layer with #important + #urgent: no iconDetails changes, two effects combine', () => {
        const [icon, path, badges] = cache.runOn(
            mockLayer({ tags: ['#important', '#urgent'] }),
        );
        expect(icon.markerColor).toBe('blue'); // preset
        expect(path.weight).toBe(10); // from #important
        expect(badges).toHaveLength(1); // ! from #urgent
    });
});

// ─── Scenario 12: rule order matters for overrides ────────────────────────────

describe('Scenario: rule order determines final value for repeated fields', () => {
    const cache = makeCache([
        PRESET,
        {
            query: 'tag:#trip',
            preset: false,
            iconDetails: {
                markerColor: 'green',
                icon: 'fa-tree',
                opacity: 0.5,
            },
            pathOptions: { color: 'green', weight: 2 },
        },
        {
            query: 'tag:#trip',
            preset: false,
            iconDetails: { markerColor: 'red', opacity: 1.0 }, // overrides color + opacity
            pathOptions: { color: 'red' }, // overrides color
        },
        {
            query: 'tag:#trip',
            preset: false,
            iconDetails: { markerColor: 'purple' }, // overrides color again
        },
    ]);
    const layer = mockLayer({ tags: ['#trip'] });

    it('last rule wins for markerColor', () => {
        const [icon] = cache.runOn(layer);
        expect(icon.markerColor).toBe('purple');
    });

    it('second rule wins for opacity (last one to specify it)', () => {
        const [icon] = cache.runOn(layer);
        expect(icon.opacity).toBe(1.0);
    });

    it('first rule preserved for icon (no later rule touched it)', () => {
        const [icon] = cache.runOn(layer);
        expect(icon.icon).toBe('fa-tree');
    });

    it('second rule wins for path color', () => {
        const [, path] = cache.runOn(layer);
        expect(path.color).toBe('red');
    });

    it('first rule preserved for path weight (no later rule touched it)', () => {
        const [, path] = cache.runOn(layer);
        expect(path.weight).toBe(2);
    });
});

// ─── Scenario 13: getDefaults returns independent copies ──────────────────────

describe('getDefaults isolation', () => {
    it('mutating a returned iconDetails does not affect subsequent calls', () => {
        const cache = makeCache([PRESET]);
        const [icon1] = cache.getDefaults();
        icon1.markerColor = 'mutated';
        const [icon2] = cache.getDefaults();
        expect(icon2.markerColor).toBe('blue');
    });

    it('mutating a returned pathOptions does not affect subsequent calls', () => {
        const cache = makeCache([PRESET]);
        const [, path1] = cache.getDefaults();
        path1.color = 'mutated';
        const [, path2] = cache.getDefaults();
        expect(path2.color).toBe('blue');
    });
});

// ─── Scenario 14: error handling ─────────────────────────────────────────────

describe('Error handling', () => {
    it('throws when rules and queries are out of sync', () => {
        const cache = new DisplayRulesCache(null as unknown as App);
        cache.build([PRESET]);
        (cache as any).displayRules.push({ query: 'tag:#x', preset: false });
        expect(() => cache.runOn(mockLayer())).toThrow(/garbled/);
    });
});
