# Changelog

All notable changes to Map View are documented here.

---

## Unreleased

- Changed internal links to documentation.

---

## 6.1.3

### Fixed

- GPX registration causing plugin crashes (critical fix).
- Issue [#385](https://github.com/esm7/obsidian-map-view/issues/385).
- Issue [#383](https://github.com/esm7/obsidian-map-view/issues/383).

### Internal

- Long-overdue addition of unit tests for many low-level plugin functions.

---

## 6.1.2

### Added

- Auto-add current GPS location to notes on mobile (e.g. daily notes). See [GPS Support](https://esm7.github.io/obsidian-map-view/gps-support/).
- Icons added to Map View's registered commands for better visibility in the mobile toolbar.

---

## 6.1.1

### Fixed

- Issues with embedded maps ([#372](https://github.com/esm7/obsidian-map-view/issues/372)).

---

## 6.1.0

### Added

- **Real-time GPS location support** using Obsidian Mobile 1.11's new location permissions:
    - Map View now shows your current location.
    - "Follow my location" toggle to pan the map as you move (available in View drop-down and Bases settings).
    - All GPS commands revised to use the new location permissions.
- Moving indicator shown when Map View opens before fully loading.

### Deprecated

- The Geo-Helper app is now obsolete and unsupported (superseded by native GPS support on mobile).

### Notes

- Desktop GPS support (Linux, Windows, Mac) is not yet available. Vote for it [here](https://forum.obsidian.md/t/geolocation-ability-in-desktop-app/109686).

---

## 6.0.5

### Fixed

- Issue [#367](https://github.com/esm7/obsidian-map-view/issues/367).

---

## 6.0.4

### Fixed

- Emoji support in tag names ([#348](https://github.com/esm7/obsidian-map-view/issues/348)).
- Plugin removing blank lines in note embeds ([#368](https://github.com/esm7/obsidian-map-view/issues/368)).
- Some cases where marker rules could disappear on upgrade ([#359](https://github.com/esm7/obsidian-map-view/issues/359)).

---

## 6.0.3

### Fixed

- Display rules with empty queries no longer allowed for non-preset rules ([#359](https://github.com/esm7/obsidian-map-view/issues/359)).
- `location` property no longer set to type `multitext` ([#358](https://github.com/esm7/obsidian-map-view/issues/358)).
- Map View embeds through Bases now work correctly; added Embedded Height control.

---

## 6.0.2

### Fixed

- Issue [#354](https://github.com/esm7/obsidian-map-view/issues/354).

---

## 6.0.1

### Fixed

- Issue [#352](https://github.com/esm7/obsidian-map-view/issues/352).

---

## 6.0.0

This is a major release with significant new features, fixes, and **breaking changes**.

### Breaking Changes

::: warning Read before upgrading

- **Google Places API:** This version upgrades to Google's new Places API (introduced 2025). Existing credentials may need to be updated. See the [migration guide](https://esm7.github.io/obsidian-map-view/search/#migrating-to-google-places-api-new).
- **Google Places Templates:** Field names changed in the new Places API — re-add them in plugin settings.
- **OpenStreetMap geocoding:** An email address is now required in the plugin configuration due to OSM usage restrictions.
- **Configuration file is not backwards-compatible.** Back up `VAULT_DIR/.obsidian/plugins/obsidian-map-view/data.json` before upgrading if needed.
  :::

### Added

- **[Paths](https://esm7.github.io/obsidian-map-view/paths/)** — support for stand-alone path files (GPX, KML, TCX, GeoJSON) and inline GeoJSON paths within notes.
- **[Display Rules](https://esm7.github.io/obsidian-map-view/display-rules/)** — complete redesign of "marker rules" into a more powerful query-based system for both markers and paths.
- **[Routing](https://esm7.github.io/obsidian-map-view/routing/)** — built-in route calculation using the GraphHopper API (driving, cycling, walking).
- **[Badges](https://esm7.github.io/obsidian-map-view/display-rules/#marker-badges)** — small corner indicators that can be added to markers via display rules.
- **Edit Mode** — complete new interface for adding and modifying markers and paths directly from the map.
- **[Obsidian Bases view](https://esm7.github.io/obsidian-map-view/bases-view/)** — experimental integration with Obsidian Bases.
- `opacity` as a marker icon property.
- "Only one controls section open at a time" setting (default: on).
- "Show native Obsidian popup on marker hover" option (returned by popular request).
- Modifying notes now properly updates markers according to the active filter.
- Query tag suggestions now only show tags present on the current map.
- "Focus current note in Map View" command.

### Improved

- Major performance improvements — Map View opens nearly instantly after initial load; filtering is much faster.

### Fixed

- Obsidian's new "always focus new tab" setting is now respected.
- Fix for [#308](https://github.com/esm7/obsidian-map-view/issues/308) (thanks @edzillion!).
- Inline location bug on iOS ([#301](https://github.com/esm7/obsidian-map-view/issues/301)).
- Context menu 'open in' fix for Reading View ([#326](https://github.com/esm7/obsidian-map-view/issues/326)).
- File-menu event not properly registered to the plugin ([#327](https://github.com/esm7/obsidian-map-view/issues/327)).
- `autoFit` state flag of embedded maps now works more consistently.
- Map View now sets the `location` property type to List, preventing Obsidian from corrupting it.
