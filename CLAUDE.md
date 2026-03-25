# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Obsidian Map View is a sophisticated Obsidian plugin that transforms notes into an interactive geographic information system (GIS). It parses geolocation data from note frontmatter, inline links, and external files (GPX, KML, GeoJSON), renders them on interactive maps, and provides powerful querying, filtering, and display customization capabilities.

## Development Commands

```bash
# Development with watch mode
npm run dev-dist

# Production build
npm run build

# Code formatting
npm run prettier

# Check code formatting
npm run stylecheck
```

## Tech Stack

- **TypeScript** with Svelte 5 for UI components
- **Rollup** for bundling with plugins for TypeScript, Svelte, PostCSS, and images
- **Leaflet** ecosystem for mapping (leaflet, markercluster, geosearch, geoman, offline)
- **boon-js** for query language parsing
- **@tmcw/togeojson** for GPX/KML conversion
- **FontAwesome** for marker icons
- **Obsidian API** for plugin integration

## Core Architecture

### Data Flow: File → Layer → Map

1. **Parsing** (`src/geoHelpers.ts`, `src/geojsonParser.ts`):
    - `matchInlineLocation()`: Extracts `[name](geo:lat,lng) tag:foo` patterns from file content
    - `getFrontMatterLocation()`: Reads `location:` property from Obsidian metadata cache
    - `getGeoJsonLayersFromFile()`: Parses GeoJSON/GPX/KML files and inline geojson code blocks

2. **Layer System** (abstract base: `src/baseGeoLayer.ts`):
    - `FileMarker` (`src/fileMarker.ts`): Individual location markers from notes
    - `GeoJsonLayer` (`src/geojsonLayer.ts`): Paths and shapes from GeoJSON data
    - Each logical layer maintains multiple Leaflet layer instances (one per map container) via `geoLayers: Map<containerId, leaflet.Layer>`

3. **Layer Cache** (`src/layerCache.ts`):
    - Plugin-global repository indexed by layer ID and file path
    - Rebuilds affected layers when files change via `updateMarkersWithRelationToFile()`
    - Initialization can be deferred until first map opens (`loadLayersAhead` setting)

4. **Display Rules** (`src/displayRulesCache.ts`):
    - Query-based styling engine that applies icon properties, path options, and badges
    - Rules applied in sequence; matching rules override previous properties
    - Uses Query system (`src/query.ts`) to match layers via `tag:`, `path:`, `linkedfrom:`, etc.

5. **Map Rendering** (`src/mapContainer.ts`):
    - `filterAndPrepareMarkers()`: Applies user query filters and builds link edges
    - `updateMapLayers()`: Diffs old/new layers and updates Leaflet map (reuses unchanged layers)
    - Manages marker clusters, tile layers, and all UI controls

### Key Components

**Main Plugin** (`src/main.ts`):

- Entry point that registers views, commands, protocol handlers, and event listeners
- Maintains `allMapContainers` registry for all active map instances
- Handles vault file events (create, modify, delete, rename) to trigger layer updates
- Provides global handlers for geolink interactions in editor

**Map Views**:

- `MainMapView` (`src/mainMapView.ts`): Standalone full-featured map view
- `EmbeddedMap` (`src/embeddedMap.ts`): Inline maps from `mapview` code blocks with state persistence
- `BasesMapView` (`src/basesMapView.ts`): Integration with Obsidian Bases
- `MapPreviewPopup` (`src/mapPreviewPopup.ts`): Transient previews on geolink hover

**Query System** (`src/query.ts`):

- Boolean query language: `tag:#foo AND path:"bar" OR linkedfrom:"Trip Plan"`
- Parsed into RPN (reverse Polish notation) for fast evaluation
- Used for both display rule matching and user filtering

**Display Rules** (`src/displayRulesCache.ts`, `src/markerIcons.ts`):

- Rules composed of: query + icon details + path options + badges
- `IconFactory.getIconFromRules()` creates Leaflet markers with FontAwesome icons
- Badges add corner indicators (up to 4 per marker)

**State Management** (`src/mapState.ts`):

- Immutable `MapState` object: position, zoom, query, display options
- `mergeStates()` for partial updates, `areStatesEqual()` for diffing
- Persisted in embedded maps and presets

**Editor Integration**:

- `src/codemirrorViewPlugin.ts`: Decorates inline geolinks with custom event handlers
- `src/geoLinkReplacers.ts`: Post-processes reading view to make geolinks clickable
- `src/locationSuggest.ts`: Autocomplete for location search in `[](geo:)` templates
- `src/tagSuggest.ts`: Tag autocomplete for queries

### Multi-Instance Pattern

The plugin supports multiple simultaneous map views (main views, embeds, previews). Each logical layer (FileMarker or GeoJsonLayer) can exist as different Leaflet objects in different containers:

```typescript
class BaseGeoLayer {
    geoLayers: Map<string, leaflet.Layer> = new Map();
    // Same geographic data, different visual representations per container
}
```

This enables:

- Independent filtering per view (same note shown differently in two maps)
- Efficient reuse of layer data without duplication
- Container-specific display state (hover, selection)

### Performance Considerations

- **Editor updates are frequent**: `updateMarkersWithRelationToFile()` must be extremely efficient as it runs on every file change
- **Cluster groups**: Nearby markers grouped to reduce DOM nodes (configurable "max cluster size")
- **Lazy layer initialization**: Cache built only when needed if `loadLayersAhead` is false
- **Efficient diffing**: `updateMapLayers()` uses "touched" flag to identify add/remove operations, reuses unchanged layers with `isSame()`
- **Viewport-limited processing**: Geolink decorations only applied to visible editor content
- **Query pre-compilation**: Queries compiled to RPN once, evaluated many times

## Important File Locations

- **Main entry**: `src/main.ts` (MapViewPlugin class)
- **Layer system**: `src/baseGeoLayer.ts`, `src/fileMarker.ts`, `src/geojsonLayer.ts`
- **Parsing**: `src/geoHelpers.ts`, `src/geojsonParser.ts`
- **Query engine**: `src/query.ts`, `src/displayRulesCache.ts`
- **Map rendering**: `src/mapContainer.ts`, `src/mapState.ts`
- **Views**: `src/mainMapView.ts`, `src/embeddedMap.ts`, `src/basesMapView.ts`
- **Icons**: `src/markerIcons.ts`
- **Settings**: `src/settings.ts`, `src/settingsTab.ts`
- **Svelte UI**: `src/components/*.svelte` (controls, dialogs)
- **Styles**: `src/css/*.css`, `src/less/*.less`

## Common Development Patterns

### Adding a New Display Rule Property

1. Add property to `iconDetails`, `pathOptions`, or `badgeDetails` in `src/markerIcons.ts`
2. Update `EditDisplayRuleDialog.svelte` to expose the property in UI
3. Modify `IconFactory.getIconFromRules()` or `DisplayRulesCache.runOn()` to apply the property
4. Update `src/displayRulesCache.ts` if composition logic changes

### Adding a New Query Operator

1. Add operator constant to `query.ts`: `OPERATOR_NAME`
2. Implement matching logic in `Query.testPredicate()` switch statement
3. Add autocomplete support in `TagSuggest.getSuggestions()` if needed
4. Document in README.md under "Queries" section

### Handling a New Geolocation Format

1. Add regex pattern to `src/consts.ts` or add URL parsing rule
2. Implement parser function in `src/geoHelpers.ts`
3. Call parser in `getMarkersFromFileContent()` or equivalent
4. Add tests if available (currently limited test coverage)

### Creating a New Map View Type

1. Extend `AbstractMapView` from `src/abstractMapView.ts`
2. Implement `getViewType()`, `getDisplayText()`, `getIcon()`
3. Create and manage `MapContainer` instance in `onOpen()`
4. Register view in `main.ts` via `this.registerView()`
5. Add command to open view if needed

## Build System

**Rollup Configuration** (`rollup.config.js`):

- Plugins: TypeScript, Svelte, CommonJS, Node Resolve, PostCSS, Image, Copy
- Environment: `BUILD=development` disables minification for faster dev builds
- Output: `main.js` (plugin code) + `styles.css` (compiled styles)
- Source maps generated for debugging

**TypeScript Config**:

- Extends `@tsconfig/svelte` for Svelte 5 compatibility
- Target: ES2022
- Strict mode disabled (legacy codebase)
- Module resolution: Node

## Plugin Lifecycle

**Initialization** (`onload()`):

1. Load settings from `data.json`
2. Initialize LayerCache (if `loadLayersAhead` enabled)
3. Register views, commands, protocol handlers
4. Setup vault event listeners (file create/modify/delete/rename)
5. Initialize global tile cache for offline maps
6. Register CodeMirror view plugin and markdown post-processors
7. Add settings tab

**File Change Handling**:

1. Obsidian fires metadata cache `changed` event
2. Plugin calls `updateMarkersWithRelationToFile(file)`
3. LayerCache rebuilds layers for affected file
4. All active MapContainers receive layer diff
5. Each container calls `updateMapLayers()` to reflect changes

**Shutdown** (`onunload()`):

1. Destroy all active map containers
2. Clear global registries and event handlers

## Debugging Tips

- Enable "Developer Tools" in Obsidian settings
- Use `console.log()` - output visible in DevTools console
- Source maps available in development builds
- Breakpoints work in TypeScript source files
- Test changes by reloading plugin: Ctrl+P → "Reload app without saving"

## Testing Approach

This project has limited automated test coverage. When making changes:

- Manually test with sample vault containing various geolocation formats
- Verify embedded maps update correctly when notes change
- Check performance with large vaults (hundreds of geolocations)
- Test on both desktop and mobile if possible
- Validate display rules apply correctly with complex queries

## Common Gotchas

- **Layer cache must be rebuilt when files change**: Always update via `updateMarkersWithRelationToFile()`
- **Multiple map containers share layer cache**: Changes affect all open views
- **Display rules apply in order**: Later matching rules override earlier ones
- **Inline tags vs note tags**: Inline tags (`tag:foo`) only apply to specific markers, not whole note
- **Leaflet coordinates are `[lat, lng]`**: Beware of order when parsing user input
- **Settings changes require plugin reload**: No hot-reload for plugin settings
- **Svelte 5 runes syntax**: Use `$state`, `$derived`, `$effect` for reactivity
- All new UI should use Svelte 5, and not the vanilla JS style on which I started the plugin with, and slowly replacing.
- **`plugin.settings` is a `$state` reactive proxy**: `loadSettings()` wraps settings via `makeSettingsReactive()` (`src/settingsReactive.svelte.ts`). This means deep mutations like `settings.mapControlsSections.foo = true` are automatically tracked by Svelte components that receive `settings` as a prop — no need for `settings = { ...settings }` hacks to trigger re-renders.
- **Never use `settings = { ...settings }` to trigger reactivity**: This creates a shallow copy and breaks the reference to `plugin.settings`. Any subsequent mutation to the copy (e.g. `settings.defaultState = x`) will not reach `plugin.settings` and will not be saved.
