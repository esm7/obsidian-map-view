---
name: map-view
description: Look up and record geolocations in Obsidian notes using the Map View plugin. Use as part of helping the user to plan a trip, research places to visit, record a location in a note, or whenever the content being added to a note includes named real-world places. Every time the user asks you add to a note something that is a location, consider using this skill so it will be logged as a geolocation. Another usage is to measure distances, either aerial or by routing (foot/driving/cycling etc), e.g. for researching for places that are nearby a location, within a walking distance from it, etc.
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

```bash
obsidian mv-calc-distance from="lat,lng" to="lat,lng"
```

Returns the straight-line (aerial) distance between two coordinates in meters and kilometers. No API key required. Use as a fast proximity check before committing to a routed calculation.

```bash
obsidian mv-calc-route from="lat,lng" to="lat,lng" profile="foot"
```

Returns routed distance, travel time in minutes, and elevation change (ascent/descent) using the routing engine configured in Map View settings (GraphHopper — requires an API key). Does **not** return path geometry. Available profiles: `foot`, `bike`, `car`, `hike`, `motorcycle`, `racingbike`, `mtb`. Coordinates can be given as `lat,lng` or `[lat,lng]` — the brackets are optional.

## Checking distance and travel time for recommendations

Use `mv-calc-distance` or `mv-calc-route` to verify that places meet a proximity criterion before presenting them to the user.

**Example: walking distance from a reference point**

User asks: _"Find amusement parks within 10-minute walking distance of 120 W 5th Avenue, NYC."_

1. Geo-search the reference point to get its coordinates:

```bash
obsidian mv-geosearch name="120 W 5th Avenue, NYC"
```

2. Geo-search each candidate:

```bash
obsidian mv-geosearch name="Coney Island Amusement Park"
```

3. Check the walking route:

```bash
obsidian mv-calc-route from="40.7128,-74.0150" to="40.5755,-73.9707" profile="foot"
```

4. Only include places where `Time` is ≤ 10 min. Discard the rest and explain why.

**Example: driving time between two places**

User asks: _"Is the hotel within 20 minutes' drive of the conference center?"_

```bash
obsidian mv-calc-route from="48.8584,2.2945" to="48.8738,2.2950" profile="car"
```

**Example: quick aerial check before routing**

If you need to filter a long list of candidates, first use `mv-calc-distance` to discard obviously far-away results (e.g. > 5 km aerial for a 10-min walk), then run `mv-calc-route` only for the remaining candidates to avoid unnecessary API calls.

**IMPORTANT NOTE:** keep in mind that routing requires API calls, and they will cost the user money if done without care. Do not launch big numbers of such API calls (e.g. dozens or more) without making sure this is indeed what the user wants.

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
