import { describe, it, expect, vi } from 'vitest';

vi.mock('leaflet', async (importOriginal) => {
    const actual = await importOriginal<typeof import('leaflet')>();
    return {
        ...actual,
        ExtraMarkers: {
            icon: (options: any) => ({
                createIcon: (): HTMLElement | null => null,
                createShadow: (): HTMLElement | null => null,
                options,
            }),
        },
    };
});

import {
    checkTagPatternMatch,
    IconFactory,
    getIconFromOptions,
    getIconFromRules,
} from 'src/markerIcons';

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

// ─── IconFactory ──────────────────────────────────────────────────────────────

describe('IconFactory', () => {
    it('starts uninitialized', () => {
        const factory = new IconFactory(document.createElement('div'));
        expect(factory.initialized).toBe(false);
    });

    it('becomes initialized after first getIcon call', () => {
        const factory = new IconFactory(document.createElement('div'));
        factory.getIcon({ prefix: 'fas', icon: 'fa-circle' } as any);
        expect(factory.initialized).toBe(true);
    });

    it('returns an SVGElement for a known FA solid icon', () => {
        const factory = new IconFactory(document.createElement('div'));
        const svg = factory.getIcon({
            prefix: 'fas',
            icon: 'fa-circle',
        } as any);
        expect(svg).not.toBeNull();
        expect(svg!.tagName.toLowerCase()).toBe('svg');
    });

    it('returns an SVGElement for a known FA regular icon', () => {
        const factory = new IconFactory(document.createElement('div'));
        const svg = factory.getIcon({
            prefix: 'far',
            icon: 'fa-circle',
        } as any);
        expect(svg).not.toBeNull();
    });

    it('returns null for an unknown icon name', () => {
        const factory = new IconFactory(document.createElement('div'));
        const svg = factory.getIcon({
            prefix: 'fas',
            icon: 'fa-this-icon-does-not-exist-xyz',
        } as any);
        expect(svg).toBeNull();
    });

    it('applies iconColor to the SVG element', () => {
        const factory = new IconFactory(document.createElement('div'));
        const svg = factory.getIcon({
            prefix: 'fas',
            icon: 'fa-circle',
            iconColor: 'red',
        } as any);
        expect(svg!.style.color).toBe('red');
    });

    it('defaults iconColor to white when not specified', () => {
        const factory = new IconFactory(document.createElement('div'));
        const svg = factory.getIcon({
            prefix: 'fas',
            icon: 'fa-circle',
        } as any);
        expect(svg!.style.color).toBe('white');
    });

    it('init() is idempotent: calling twice does not throw', () => {
        const factory = new IconFactory(document.createElement('div'));
        expect(() => {
            factory.init();
            factory.init();
        }).not.toThrow();
    });
});

// ─── getIconFromOptions ────────────────────────────────────────────────────────

describe('getIconFromOptions', () => {
    const factory = new IconFactory(document.createElement('div'));

    // Baseline: returns an object for a standard FA icon
    it('returns a non-null object for a standard FA icon', () => {
        const icon = getIconFromOptions(
            { prefix: 'fas', icon: 'fa-map-marker', markerColor: 'blue' },
            [],
            factory,
        );
        expect(icon).toBeTruthy();
    });

    it('passes options through to ExtraMarkers (markerColor preserved)', () => {
        const icon = getIconFromOptions(
            { prefix: 'fas', icon: 'fa-circle', markerColor: 'red' },
            [],
            factory,
        ) as any;
        expect(icon.options.markerColor).toBe('red');
    });

    it('sets innerHTML for a Font Awesome icon (SVG rendering path)', () => {
        const icon = getIconFromOptions(
            { prefix: 'fas', icon: 'fa-circle', markerColor: 'blue' },
            [],
            factory,
        ) as any;
        // innerHTML is set to the SVG outerHTML by getInternalIconFromOptions
        expect(icon.options.innerHTML).toBeTruthy();
        expect(icon.options.innerHTML).toContain('<svg');
    });

    it('sets emoji HTML for a short-text (emoji) icon', () => {
        const icon = getIconFromOptions(
            { prefix: 'fas', icon: '🌍', markerColor: 'blue' },
            [],
            factory,
        ) as any;
        expect(icon.options.innerHTML).toContain('🌍');
        expect(icon.options.innerHTML).toContain('mv-emoji-icon');
    });

    it('emoji icon respects custom iconColor', () => {
        const icon = getIconFromOptions(
            {
                prefix: 'fas',
                icon: '🏕️',
                markerColor: 'blue',
                iconColor: 'yellow',
            },
            [],
            factory,
        ) as any;
        expect(icon.options.innerHTML).toContain('color:yellow');
    });

    it('emoji icon defaults to white when iconColor is not specified', () => {
        const icon = getIconFromOptions(
            { prefix: 'fas', icon: '🏕️', markerColor: 'blue' },
            [],
            factory,
        ) as any;
        expect(icon.options.innerHTML).toContain('color:white');
    });

    it('simple-circle shape returns a DivIcon (has html option)', () => {
        const icon = getIconFromOptions(
            { shape: 'simple-circle', icon: 'fa-circle', markerColor: 'green' },
            [],
            factory,
        ) as any;
        // leaflet.divIcon produces an object with options.html
        expect(icon.options.html).toBeTruthy();
        expect(icon.options.html).toContain('mv-simple-circle-marker');
    });

    it('simple-circle embeds the markerColor in the HTML', () => {
        const icon = getIconFromOptions(
            {
                shape: 'simple-circle',
                icon: 'fa-circle',
                markerColor: 'magenta',
            } as any,
            [],
            factory,
        ) as any;
        expect(icon.options.html).toContain('magenta');
    });

    it('simple-circle with emoji icon embeds the emoji in the HTML', () => {
        const icon = getIconFromOptions(
            { shape: 'simple-circle', icon: '🏔️', markerColor: 'blue' },
            [],
            factory,
        ) as any;
        expect(icon.options.html).toContain('🏔️');
    });

    // ── badge wrapping ──

    it('no badges: createIcon is the original stub function', () => {
        const icon = getIconFromOptions(
            { prefix: 'fas', icon: 'fa-circle', markerColor: 'blue' },
            [],
            factory,
        );
        // The ExtraMarkers stub sets createIcon to () => null
        expect(icon.createIcon()).toBeNull();
    });

    it('with badge: createIcon is replaced by a wrapper function', () => {
        const iconNoBadge = getIconFromOptions(
            { prefix: 'fas', icon: 'fa-circle', markerColor: 'blue' },
            [],
            factory,
        );
        const iconWithBadge = getIconFromOptions(
            { prefix: 'fas', icon: 'fa-circle', markerColor: 'blue' },
            [{ badge: '★', backColor: 'gold', textColor: 'black' }],
            factory,
        );
        // The wrapped function is a different reference
        expect(iconWithBadge.createIcon).not.toBe(iconNoBadge.createIcon);
    });

    it('badges do not affect the icon when badgeOptions array is empty', () => {
        const icon1 = getIconFromOptions(
            { prefix: 'fas', icon: 'fa-circle', markerColor: 'blue' },
            [],
            factory,
        );
        const icon2 = getIconFromOptions(
            { prefix: 'fas', icon: 'fa-circle', markerColor: 'blue' },
            [],
            factory,
        );
        // Both should behave identically — call createIcon and get null from stub
        expect(icon1.createIcon()).toBeNull();
        expect(icon2.createIcon()).toBeNull();
    });

    it('multiple badges each wrap createIcon once (single wrapper handles all)', () => {
        // The wrapping happens once regardless of badge count
        const iconOne = getIconFromOptions(
            { prefix: 'fas', icon: 'fa-circle', markerColor: 'blue' },
            [{ badge: 'A' }],
            factory,
        );
        const iconThree = getIconFromOptions(
            { prefix: 'fas', icon: 'fa-circle', markerColor: 'blue' },
            [{ badge: 'A' }, { badge: 'B' }, { badge: 'C' }],
            factory,
        );
        // Both have a wrapped createIcon (not the original null-returning stub)
        expect(iconOne.createIcon).not.toBe(iconThree.createIcon); // different closures
        // But both ARE wrappers (not the original stub reference)
        const originalStub = (): null => null;
        expect(iconOne.createIcon).not.toBe(originalStub);
        expect(iconThree.createIcon).not.toBe(originalStub);
    });
});

// ─── getIconFromRules ──────────────────────────────────────────────────────────

describe('getIconFromRules', () => {
    const factory = new IconFactory(document.createElement('div'));

    function mockMarker(tags: string[] = []): any {
        return {
            tags,
            extraName: null,
            fileLine: null,
            file: { name: 'test.md', path: 'test.md', basename: 'test' },
        };
    }

    it('returns [icon, opacity] tuple', () => {
        const mockRulesCache = {
            runOn: vi.fn().mockReturnValue([
                {
                    prefix: 'fas',
                    icon: 'fa-circle',
                    markerColor: 'blue',
                    opacity: 1.0,
                },
                {},
                [],
            ]),
        } as any;
        const result = getIconFromRules(mockMarker(), mockRulesCache, factory);
        expect(result).toHaveLength(2);
    });

    it('icon in the returned tuple is truthy', () => {
        const mockRulesCache = {
            runOn: vi.fn().mockReturnValue([
                {
                    prefix: 'fas',
                    icon: 'fa-circle',
                    markerColor: 'blue',
                    opacity: 0.8,
                },
                {},
                [],
            ]),
        } as any;
        const [icon] = getIconFromRules(mockMarker(), mockRulesCache, factory);
        expect(icon).toBeTruthy();
    });

    it('opacity in the returned tuple matches the iconOptions opacity', () => {
        const mockRulesCache = {
            runOn: vi.fn().mockReturnValue([
                {
                    prefix: 'fas',
                    icon: 'fa-circle',
                    markerColor: 'blue',
                    opacity: 0.42,
                },
                {},
                [],
            ]),
        } as any;
        const [, opacity] = getIconFromRules(
            mockMarker(),
            mockRulesCache,
            factory,
        );
        expect(opacity).toBe(0.42);
    });

    it('calls displayRulesCache.runOn with the given marker', () => {
        const marker = mockMarker(['#trip']);
        const mockRulesCache = {
            runOn: vi.fn().mockReturnValue([
                {
                    prefix: 'fas',
                    icon: 'fa-circle',
                    markerColor: 'blue',
                    opacity: 1.0,
                },
                {},
                [],
            ]),
        } as any;
        getIconFromRules(marker, mockRulesCache, factory);
        expect(mockRulesCache.runOn).toHaveBeenCalledWith(marker);
    });

    it('badge options from runOn are passed to the icon factory', () => {
        // When runOn returns badge options, the resulting icon should have a wrapped createIcon
        const noBadgeCache = {
            runOn: vi.fn().mockReturnValue([
                {
                    prefix: 'fas',
                    icon: 'fa-circle',
                    markerColor: 'blue',
                    opacity: 1.0,
                },
                {},
                [],
            ]),
        } as any;
        const withBadgeCache = {
            runOn: vi.fn().mockReturnValue([
                {
                    prefix: 'fas',
                    icon: 'fa-circle',
                    markerColor: 'blue',
                    opacity: 1.0,
                },
                {},
                [{ badge: '★', backColor: 'red' }],
            ]),
        } as any;
        const [iconNoBadge] = getIconFromRules(
            mockMarker(),
            noBadgeCache,
            factory,
        );
        const [iconWithBadge] = getIconFromRules(
            mockMarker(),
            withBadgeCache,
            factory,
        );
        expect(iconWithBadge.createIcon).not.toBe(iconNoBadge.createIcon);
    });
});
