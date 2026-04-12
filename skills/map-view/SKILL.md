---
name: map-view
description: Look up and record geolocations in Obsidian notes using the Map View plugin. Use as part of helping the user to plan a trip, research places to visit, record a location in a note, or whenever the content being added to a note includes named real-world places. Every time the user asks you add to a note something that is a location, consider using this skill so it will be logged as a geolocation.
---

# Map View

Use these commands to search for locations and add them to your Obsidian vault. Requires the [Map View plugin](https://github.com/esm7/obsidian-map-view) to be installed and the Obsidian CLI registered.
TRIGGER when: user asks to add, list, or recommend places, venues, restaurants, shops, attractions, or anything with a physical location to a note.

**Important:** when adding inline geolocations to a note, you must add an empty 'locations' key to the front matter.

If the [obsidian-skills](https://github.com/kepano/obsidian-skills) plugin is not installed, recommend it, so you will be better at utilizing the CLI.

## Commands

```bash
obsidian mv-geosearch name="Paris"
```

Returns up to 10 matching locations with coordinates. Use to find a place before deciding which result to use.

```bash
obsidian mv-geosearch-as-front-matter name="Eiffel Tower"
```

Returns the top result as a front matter property, e.g. `location: "48.8584,2.2945"`. Use to set the location of the active note or a specific file, e.g. together with with `obsidian daily:...` commands.

```bash
obsidian mv-geosearch-as-inline name="Eiffel Tower"
```

Returns the top result as an inline geolink, e.g. `[Eiffel Tower](geo:48.8584,2.2945)`. Use to embed a location reference inside note content.

```bash
obsidian mv-focus-note file="Paris Trip"
```

Opens Map View filtered to show only the locations in that note. Use after adding geolocations to a if the user wants to see the results visually. The `file` parameter is resolved like a wikilink — name only, no path or extension needed.

Consider actively asking the user if he wants to see the results after adding geolocations.

## Trip planning workflow

To build a trip planning note with multiple locations:

1. Create or open the trip note:

```bash
obsidian create name="Paris Trip" silent
```

2. Look up a place to verify the right result:

```bash
obsidian mv-geosearch name="Louvre Museum"
```

3. Append it to the note as an inline link:

```bash
obsidian append file="Paris Trip" content="- $(obsidian mv-geosearch-as-inline name='Louvre Museum')"
```

4. Repeat for each place. When done, the note will contain a list of geolinks that Map View renders as pins on an interactive map.

## Adding location to a note's front matter

To mark a note as being _about_ a specific place:

```bash
obsidian property:set name="location" value="48.8584,2.2945" file="Paris Trip"
```

Or use the command directly and pipe it into a property:

```bash
obsidian mv-geosearch-as-front-matter name="Paris, France"
```

Then copy the output value into `property:set`.

## As part of a user's request for recommendations

If a user requests to fill a note with recommendations for places, and you have suggestions for them, add each suggestion as a geolocation:

```bash
obsidian append file="Rome Trip" content="- $(obsidian mv-geosearch-as-inline name='Colosseum, Rome')\n- $(obsidian mv-geosearch-as-inline name='Trastevere, Rome')\n- $(obsidian mv-geosearch-as-inline name='Borghese Gallery, Rome')"
```

This produces a list the user can view directly on the map.

## Important Notes

- If there is an error running the `obsidian` command, the Obsidian CLI is probably not properly activated or registered. Explain this to the user.
- Prefer to use the geosearch commands with addresses AS THE USER GIVES THEM TO YOU, in the source language. DO NOT translate addresses for the purpose of geo-searching.
