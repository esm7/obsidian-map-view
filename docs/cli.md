# Obsidian CLI Integration

Map View registers commands with the [Obsidian CLI](https://help.obsidian.md/cli), available since Obsidian 1.12.2. This lets you look up geolocations and add them to your notes from the command line or through Claude using the [Map View skill](https://github.com/esm7/obsidian-map-view/tree/master/skills/map-view).

This lets agents like Claude be able to do things like "show me 5 great coffee shops in Paris".

## Commands

### `mv-geosearch`

Search for a location by name and return up to 10 results with coordinates.

```bash
obsidian mv-geosearch name="Paris"
```

Example output:

```
1. Paris, Île-de-France, France [48.8566, 2.3522]
2. Paris, Texas, United States [33.6609, -95.5555]
...
```

Use this to find and verify the right result before recording it.

### `mv-geosearch-as-front-matter`

Search for a location and return the top result as a front matter property.

```bash
obsidian mv-geosearch-as-front-matter name="Eiffel Tower"
```

Example output:

```
location: "48.8584,2.2945"
```

Use together with `obsidian property:set` to set the location of a note.

### `mv-geosearch-as-inline`

Search for a location and return the top result as an inline geolink.

```bash
obsidian mv-geosearch-as-inline name="Eiffel Tower"
```

Example output:

```
[Eiffel Tower](geo:48.8584,2.2945)
```

Use to embed a location reference inside note content. Map View renders inline geolinks as clickable links and as pins on the map.

### `mv-focus-note`

Focus a note in Map View, filtering the map to show only its locations.

```bash
obsidian mv-focus-note file="Paris Trip"
```

The `file` parameter is resolved like a wikilink — name only, no path or extension needed. Opens (or switches to) Map View with a query scoped to that note.

## Geocoding source

The geosearch commands use whichever geocoding source is configured in Map View's settings — OpenStreetMap (Nominatim) by default, or Google Places if configured.

## Using with Claude

The [Map View skill](https://github.com/esm7/obsidian-map-view/tree/master/skills/map-view) teaches Claude how to use these commands for trip planning, travel recommendations, and location research. With the skill installed, you can ask Claude things like:

- _"Plan a weekend in Rome and save the highlights to a note"_
- _"Add the coordinates for this restaurant to my daily note"_
- _"Create a trip note for Tokyo with the must-see sights"_

Claude will use the available geosearch commands to look up each location and append the geolinks to your notes, which Map View then displays on the map.

To install the skill, copy the `skills/map-view/` directory from the Map View repository into the skills directory of your agent tool:

- **Claude Code**: copy into the `.claude/skills/` folder at your Obsidian vault root
- **Codex CLI**: copy into `~/.codex/skills/`
- **OpenCode**: copy into `~/.opencode/skills/`
