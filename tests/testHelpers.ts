/**
 * Shared test helpers used across multiple test suites.
 * Import these rather than re-defining them locally.
 */
import { vi } from 'vitest';
import { App, TFile } from 'obsidian';

/**
 * Build a mock App whose metadataCache and vault behave predictably.
 *
 * Default frontmatter is `{ locations: true }` so that `hasFrontMatterLocations`
 * returns true for .md files without any extra configuration — the simplest way
 * to activate inline GeoJSON / inline marker scanning in tests.  This key
 * (`locations`) is distinct from the location-value key (`location`) checked by
 * `getFrontMatterLocation`, so the default does not interfere with fileMarker tests.
 *
 * `vault.modify` is always stubbed so that tests for write paths (e.g. editGeoJson)
 * can assert on it without additional setup.
 */
export function makeApp(
    options: {
        frontmatter?: Record<string, any> | null;
        fileContent?: string;
        headings?: any[];
        blocks?: Record<string, any>;
    } = {},
) {
    const metadata = {
        frontmatter: options.frontmatter ?? { locations: true },
        tags: [] as any[],
        headings: options.headings,
        blocks: options.blocks,
    };
    const app = new App();
    app.metadataCache = {
        getFileCache: vi.fn().mockReturnValue(metadata),
    } as any;
    app.vault = {
        read: vi.fn().mockResolvedValue(options.fileContent ?? ''),
        modify: vi.fn().mockResolvedValue(undefined),
    } as any;
    return { app, metadata };
}

/**
 * Create a TFile-like object for the given path.
 * The obsidian mock hardcodes `extension` to `'md'`; this helper derives the
 * correct extension from the path so that tests with `.geojson`, `.gpx`, etc.
 * work properly with `buildGeoJsonLayers`.
 */
export function makeFile(path = 'test.md') {
    const file = new (TFile as any)(path);
    const dotIdx = path.lastIndexOf('.');
    if (dotIdx !== -1) file.extension = path.slice(dotIdx + 1);
    return file;
}
