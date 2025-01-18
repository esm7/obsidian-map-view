# Obsidian.md Map View

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/esm7)

<!--ts-->


<!-- Created by https://github.com/ekalinin/github-markdown-toc -->
<!-- Added by: erez, at: Sat 18 Jan 2025 08:10:43 IST -->

<!--te-->

## Intro

This plugin introduces an **interactive map view** for [Obsidian.md](https://obsidian.md/).
It searches your notes for encoded geolocations (see below), places them as markers on a map and offers many tools to interact with them.

It effectively turns your Obsidian vault into a **personal GIS system** that adds a geographical layer to your notes, journals, trip planning and pretty much anything you use Obsidian for.

You can set different icons for different note types according to custom rules, save geolocations from a variety of sources (Google Maps and many others), save custom views, embed maps in notes, switch between map layers, run powerful queries, save map tiles for offline usage and so much more.

![](img/sample.png)

![](img/intro.gif)

![](img/quick-embed.gif)

I wrote this plugin because I wanted my ever-growing Zettelkasten to be able to answer questions like...

- When I get recommendations about cool places to visit, how do I save them in a way that I can recall later?
- When I'm visiting somewhere, what interesting places do I know in the area?
- When I'm conducting research for planning a trip, how do I lay out on a map options for places to eat, hike or sleep, combine them with prior knowledge, and save them for future reference?

Map View can integrate with your note-taking flow in order to answer all of these questions and much more.

Just like the Obsidian graph view lets you visualize associative relations between some of your notes, the map view lets you visualize geographic ones.

## With Obsidian Mobile

The main limitation of the plugin right now is that the Obsidian Mobile app has no location permission, so on mobile you cannot see your current location natively.

To overcome this, Map View introduced a companion [Geo Helper app](#gps-location-support).

## Support the Development

If you want to support the development of this plugin, please consider to [buy me a coffee](https://www.buymeacoffee.com/esm7).

## Quick How To

Map View is a powerful tool with many ways to use it.
If you wanna learn it thoroughly, you may wanna start from [understanding how it works](#understanding-map-view-parsing-location-data).
But if you wanna dive right in and give it a try, or get a quick glimpse of what it can do, continue reading.

### Log a Geolocation

Here are a few examples for logging a favorite location you want to see in a map.

**Option 1: from a Note**

Starting from a note, e.g. your daily note, a note referring to a trip plan or anywhere else, launch the Obsidian Command Palette and choose "Map View: add inline geolocation link".
A link in the format of `[](geo:)` will be added where your cursor is.
Start typing a location name inside the bracket, and some geolocation results will pop up. Choose one and your _inline location_ is complete.

![](img/quick1.gif)

**Option 2: from the Map**

Open Map View (e.g. from the Obsidian ribbon icon).
Search or locate a location, e.g. using the search tool.
Right-click the map and choose "new note here (front matter)" to create a note logging the selection point, or choose "copy geolocation" to copy an inline location to paste in some other note.

**There are many other ways to log geolocations in Map View**, see [here](#adding-a-location-to-a-note) for more details.

### Create a Trip Plan Map

There are many flows you can use to create custom maps, interact with them and use them for research and planning -- here's one that I typically use for trip planning.

**Step 1: log some locations.**

For most trips, I like to use a single note with sections, for example:

```
## To Visit

- [Place 1](geo:...) tag:activity
  - Some information about this place
- [Place 2](geo:...) tag:activity
  - Information about this place

## To Eat

- [Restaurant1](geo:...) tag:food
  - Opening hours, other data...
- [Restaurant2](geo:...) tag:food
  - Opening hours, other data...
```

I add the places using one of the methods above (by searching with "add inline geolocation link") or by one of the many other methods described below.
Notice the [inline tags](#understanding-map-view-parsing-location-data), these can be used for custom filters and/or creating different icons for different types of places.

**Step 2: map them!**

In the case of a single note, just click the note's menu (3 dots) and choose "focus (note name) in Map View".
You should immediately see a map of all your locations, and if you spend some moments to configure [marker icons](#marker-icons), you can easily get different shapes and colors for your various tags.

**Step 3: save this map**

You have a few options here.

One thing you can do is to open the Presets section on the map and save the current view, then open it from Map View anytime.

Another option is to save an embed: in Presets click 'Copy block' (or "Copy Map View code block" from the note menu), then paste the resulting code into a note.

![](img/quick2.gif)

**There are many more options of how to build a trip plan, present it and use it.**
[This](https://www.reddit.com/r/ObsidianMD/comments/xi42pt/planning_a_vacation_with_map_view/) post gives a more detailed example, and diving into the details of how Map View works will help you find your own optimal flow.

### Build Your Personal Geographic Information System (GIS)

The most powerful way to use Map View is to build a complete personal GIS (Geographic Information System) from your notes vault.
I personally do this as follows.

**1. Collection**

This part isn't specific to Map View, but the main idea is that I [collect](https://en.wikipedia.org/wiki/Getting_Things_Done) pieces of information from various sources, that often contain some geographic information.

For example, I can save a Facebook post that recommends a new restaurant, clip a cool hike from a hiking group, or draft a quick note when a friend tells me about a place that I want to remember.

I later turn these into notes, but of course if that's not how you do things, you can skip to Processing.

**2. Processing**

When I turn my clipped pieces of information into notes, I add geolocations as follows.

- For pieces of information that are _mainly geographical_, e.g. a restaurant recommendation, a hike or somewhere I may want to visit, I create a Zettelkasten note, then use the Map View "add geolocation (front matter) to current note" to tag the relevant geolocation.
    - If the location isn't easy to find using a text search, I usually open a more specific mapping tool like a hiking map, locate the place that I want, copy it in lat,lng format and paste it into the same search box above.
    - Alternatively, I sometimes prefer to locate it on the map, then right-click and "copy geolocation as front matter" (or create the note from the map in the first place).
    - I then tag the complete note with some useful metadata. Examples include: `#hike`, `#season/spring`, `#dogs`, `#camping`, `#food`, `#food/pizza`, `#activity`, `#activity/kids`, `#not` (for negative recommendations).
- For bulks of geographical information, like a list of recommended coffee shops in a city, I create a note and add all geolocations via inline geolocation links. I have the "add inline geolocation link" command mapped to `Alt+L` so I can easily start a location search while typing a note.

**3. Querying**

There are countless occasions that I query my Personal GIS.

- When planning a trip I often look at the area that I'm visiting, sometimes saving it as a preset without any filter applied, and get a general understanding of what I know about the area.
- I often query the system for a specific set of needs. For example, I obsessively collect information about dog-friendly activities around where I live, so when I want to go camping I query for `#dogs AND #sleep` (to search for dog-friendly camp sites) and to choose dining options I query for `#dogs AND #food`. See [here](#queries) to learn more about how queries work and what you can do with them.
- When visiting an unknown area I frequently launch Map View from Obsidian Mobile to account for change in plans or finding what to do without planning in advance.

See also [this](https://www.reddit.com/r/ObsidianMD/comments/xi42pt/planning_a_vacation_with_map_view/) Reddit post about planning a vacation with Map View.

## Understanding Map View: Parsing Location Data

Map View provides [several methods to log locations in notes](#adding-a-location-to-a-note) and can manage the technicalities for you.
You can skip to that section if you want to just get started, or continue reading the more technical explanation below.

**To clarify, you can use Map View without entering geolocations manually at all.**
You will, however, need to understand the difference between the front matter and the inline formats, and decide when to use which.

So, the plugin works by scanning your notes and parsing two types of location data.

First is a location tag in a note's [front matter](https://help.obsidian.md/Advanced+topics/YAML+front+matter):

<!-- prettier-ignore-start -->
```yaml
---
location: 40.6892494,-74.0466891
---
```
<!-- prettier-ignore-end -->

This is useful for notes that represent a single specific location.

There is an alternative syntax used by Map View previously: `location: [40.6892494, -74.0466891]`. While this format is compatible with [obsidian-leaflet](https://github.com/valentine195/obsidian-leaflet-plugin), it doesn't play very well with Obsidian's property editor. Both format are supported by the new one is encouraged for Obsidian version 1.4 and above.

Another way that the plugin parses location data is through **inline location URLs** in the format of `[link-name](geo:40.68,-74.04)`, which allow multiple markers in the same note.
To prevent the need to scan the full content of all your notes, it requires an empty `locations:` tag in the note front matter ('locations' and not 'location').
(In most methods of entering geolocations Map View will do this automatically.)
Example:

```
---
locations:
---

# Trip Plan

Point 1: [Hudson River](geo:42.277578,-76.1598107)
... more note content ...

Point 2: [New Haven](geo:41.2982672,-72.9991356)
```

Notes with multiple markers will contain multiple markers on the map with the same note name, and clicking on the marker will jump to the correct location within the note.

For many cases inline locations are superior because `geo:` is a [native URL scheme](https://en.wikipedia.org/wiki/Geo_URI_scheme), so if you click it in Obsidian (including mobile), your default maps app (or an app selector for a location) will be triggered.
The front matter method, however, is currently better if you want interoperability with plugins that use it, if you want to store lots of filterable meta-data on a location, or if you heavily express yourself with links.

Inline locations also support **inline tags** in the format of `tag:dogs` (without the `#` sign). For example:

```
Point 1: [Hudson River](geo:42.277578,-76.1598107) tag:dogs
```

This will add the tag `#dogs` specifically to that point, regardless of the note's own tags.
This is useful for notes that contain tags of different types (e.g. a trip log with various types of locations).
Note that the `tag:` format should be used **without** the `#` sign, because this sets the tag for the whole note.
Map View will internally add `#` for the purpose of queries and marker icons, as explained below.

Multiple inline tags can be separated with a whitespace: `[](geo:42.2,-76.15) tag:dogs tag:trip`.

Multiple inline locations can be added in the same line, and the tags that follow them will be associated to the location on the left, but the right-click editor context menu will not know to choose the location that was selected.

Instead of using a `locations:` YAML tag, you can use a custom note tag. See "tag name to denote inline geolocations" in the settings. (This also works with wildcards.)
It will not be automatically added when you need it like the `locations:` YAML tag, however if you add an inline geolocation to an existing note where your custom tag is found, Map View will not add a `locations:` YAML tag.
**IMPORTANT NOTE:** for the time being, using this feature (i.e. having a non-empty "tag name to denote inline geolocations") slows down Map View by an order of magnitude. I'm looking into speeding it up in future releases.

For interoperability with Obsidian's property editor and possibly other plugins, Map View will also parse the syntax of:

```yaml
location:
    - '39.100105'
    - '-94.5781416'
```

And also:

```yaml
location:
    - 39.100105,-94.5781416
```

## Adding a Location to a Note

Map View offers many ways to add geolocations to notes.

### Anywhere in Obsidian

Map View adds an Obsidian command named "New geolocation note", which you can map to a hotkey and use anywhere in Obsidian.

This opens a dialog on which you can search (address or location based on your [configured geocoding provider](#changing-a-geocoding-provider)) or paste a URL using the built-in or custom [URL parsing rules](#url-parsing-rules).

![](img/new-note-popup.gif)

### In an Existing Note

There are multiple ways to add a geolocation to an existing note.

1. Create an inline geolocation link in the format of `[](geo:)`, and if you start typing inside the link name (the brackets), Map View will initiate a location search. If you confirm one of the options, it will fill-in the location's coordinates. See more on this in the ["In-Note Location Search"](#in-note-location-search--auto-complete) section below.

To make this more streamlined, Map View adds to Obsidian a command named 'Add inline geolocation link' which you can map to a keyboard shortcut.

2. Add a front matter geolocation by using the Obsidian command 'Add geolocation (front matter) to current note'. This opens the same dialog as "new geolocation note" which allows you to search for a location name or paste a [URL parsing rules](#url-parsing-rules).

3. If you have a geolocation in some other mapping service that you wish to log, e.g. from Google Maps, you can copy the URL or "lat,lng" geolocation from that service, right-click in your note and select "Paste as Geolocation". The supported services are configurable, see [below](#url-parsing-rules) for more details.

### From the Map

The map offers several tools to create notes.

1. Use "new note here" when right-clicking the map. This will create a new note (based on the template you can change in the settings) with the location that you clicked. You can create either an empty note with a front matter (single geolocation) or an empty note with an inline geolocation.

![](img/new-note.png)

The map can be searched using the tool on the upper-right side, so you can quickly jump to the place you want to mark.
[URL parsing rules](#url-parsing-rules) also work here, so you can [copy a geolocation from Google Maps](#tip-copying-from-google-maps) (or any other service) and jump to it.

![](img/search.gif)

2. If you prefer to enter geolocations as text, use one of the "copy geolocation" options when you right-click the map and paste them in a note.

![](img/copy.png)

### Paste as Geolocation

Map View monitors the system clipboard, and when it is is detected to contain an encoded geolocation (e.g. a Google Maps "lat, lng" location), a "Paste as geolocation" entry is added to the editor context menu.
For example, if you right-click a location in Google Maps and click the first item in the menu (coordinates in lat,lng format, see [below](#tip-copying-from-google-maps)), you can then paste it as a geolocation inside a note.

Alternatively, you can right-click a URL or a supported formatted string that is already present in a note and choose "Convert to geolocation".

By default Map View can parse URLs from two services: the OpenStreetMap "show address" link and a generic "lat, lng" encoding used by many URLs.

### Tip: Copying from Google Maps

Google Maps on desktop web offers a very easy shortcut for copying universal `lat, lng` coordinates.

1. Right-click anywhere in the Google map.
2. The first menu item should be the universal coordinates. By clicking it, the coordinates are copied to the clipboard.
3. In any Obsidian note, right click and choose "paste as geolocation", or paste the coordinates into any Map View search box.

![](img/google-copy.png)

## Embedding Maps in Notes

Map View supports the Obsidian code block format for embedding maps in notes.
There are several ways to do this:

1. **Embedding an existing map.** To embed an existing map from Map View, including its query and any other settings, click 'Copy Block' from the map's Presets dropdown and paste the block into a note.

![](img/copy-block-embed.gif)

1. **Embedding directly from a note.** From the editor, right-click and choose "embed a Map View" from the context menu, then enter a search term that will be used for the center of the map. Alternatively, there's an Obsidian command named "Map View: add an embedded map" that you can assign to a keyboard shortcut.

![](img/quick-embed.gif)

Once a map is embedded in a note, it represents a live view that updates according to your notes.
Geolocations that are added or modified in the viewed area, and match the query that is saved in the embed, will be updated live.

You can make light adjustments to the view from within the embed (change its zoom, pan or height), and if you want these to be saved, click the 'Save' button that will appear.

To make bigger adjustments, such as updating the query or changing the view completely, use the Open button, make your changes, then click 'Update from open Map View' in the embed's View menu.
Note that if you have multiple full instances of Map View open, 'Update from open Map View' may not do what you intended, and you may need to close the unwanted views first.

Embeds also work really nicely in Canvas including live updates.

![](img/canvas.gif)

### Advanced Additional Options

- The query field in an embedded map supports a template parameter `$filename$`. If, for example, you wish to embed a map in a note template, you can edit the `query` field of the code block to be `"query":"linkedfrom:\"$filename$\" OR linkedto:\"$filename$\""`, and the map will always reference the host note.

**Known annoyance:** the `$filename$` replacement is currently performed when processing the code block and sent to Map View as a final result. Therefore, if you edit the embed interactively (e.g. by zoom or pan and clicking Save), the `query` field will be overwritten with the actual file name rather than the template.

- The JSON in the embedded map code block supports a still-rather-raw `autoFit` boolean flag. When set to `true` (i.e. add `"autoFit":true` to the code block's JSON), the map will load with the given pan and zoom, but will then perform an auto-fit and override further zoom and pan changes. This has the annoyance of animating zoom/pan if the saved state is different than the auto-fitted one (click Save to freeze a new state in such a case). I eventually want to bake this nicely to the UI with some more reasonable behaviors.

- The embedded map code block also supports an optional `customViewSettings` object, which allows for some adjustments to the map's UI. Properties and their defaults are defined in [`embeddedMap.ts`](https://github.com/esm7/obsidian-map-view/blob/master/src/embeddedMap.ts#L31-L47).

## Queries

Map View supports powerful queries that are roughly similar to Obsidian's query format.

![](img/query.gif)

The query string can contain the following _search operators_:

- `tag:#...` to search for notes or markers tagged with a specific tag.
    - This works on both whole notes (`#hiking`) and inline tags for specific markers (`tag:hiking`).
    - You can also use wildcards like in [tag rules](#tag-rules), e.g. `tag:#sleep*` will match `#sleep` but also `#sleep/camping`.
- `name:...` to search for markers that their name contains the given string.
    - For front-matter geolocations this matches the file name.
    - For inline geolocations this matches the link name and **ignores** the file name (if you want to always match the file name, use `OR` with `path:`).
- `path:...` to search by the note path.
    - This operator will include all the markers in the path that matches the query.
- `linkedto:...` includes notes that contain a specific link.
    - This operator will include a note (with all the markers in it) if it has a link name that matches the query.
    - For example, if you have a note named `Cave Hikes` and you have geolocated notes that **link to it** (e.g. include `[[Cave Hikes]]` as a link), include them by the filter `linkedto:"Cave Hikes"`.
    - Anything that resolves into a legal Obsidian link will work, e.g. both a note name ('Cave Hikes') or a path will do, but a partial name will not.
- `linkedfrom:...` includes notes that are linked from a specific note, and also the origin note itself.
    - This operator will include a note (with all the markers in it) if it is linked **from** the note mentioned in the query.
    - For example, if you have a note named `Trip to Italy` with links to various geolocated notes (e.g. of places you want to visit or a trip log), the query `linkedfrom:"Trip to Italy"` will filter only for those markers.
    - Anything that resolves into a legal Obsidian link will work, e.g. both a note name ('Cave Hikes') or a path will do, but a partial name will not.
    - Obsidian heading and block links are supported: if a link in the 'from' file includes a heading or a block link, it will match only front-matter markers or inline markers _within that heading or block_.
    - The Obsidian Plugin ["Copy Block Link"](https://github.com/mgmeyers/obsidian-copy-block-link) makes this extra useful.
- `lines:x-y` includes only inline markers that are defined in the given line range in their note.
    - For example, `lines:20-30` includes only inline geolocations that are defined in lines 20 to 30 in the file that contains them.

All operators are case insensitive.

You can combine the above with _logical operators_: `AND`, `OR`, `NOT`, and grouping with parenthesis.
**This differs from Obsidian's own query language which uses `-` instead of `NOT` and treats spaces as 'AND'.**

For examples:

- `linkedfrom:"Trip to Italy" AND tag:#wine` can include places you linked from your trip to Italy, or are within that note itself, and are tagged with `#wine`.
- `tag:#hike AND tag:#dogs` can include hikes you marked as suitable for dogs.
- `tag:#hike AND (tag:#dogs OR tag:#amazing) AND NOT path:"bad places"`

There are many creative ways to organize your notes with geolocations that utilize these query abilities.
You may represent location types with tags (e.g. `#hike` or `#restaurant`), or use tags to represent traits of places (`#hike/summer`, `#hike/easy`).
You can use paths for indexes using Zettelkasten back links (e.g. link to "Hikes that I Want" from notes you want to denote as such), then use `linkedto:` to find places that link to it.
And/or you can have notes to plan a trip and link to places from it, then use `linkedfrom:` to focus on your plan.

In all cases you can [save presets](#Presets) that include the filter or sub-filters of it.

## Marker Icons

Map View allows you to customize notes' map marker icons based on a powerful rules system.
These rules can be edited using the plugin's settings pane or edited as JSON for some even more fine-grained control.

Icons are based on either [emojis](https://emojipedia.org) or [Font Awesome](https://fontawesome.com/), so to add a marker icon you'll need to copy the emoji or find the name in the Font Awesome catalog.
Additionally, there are various marker properties (shape, color and more) that are based on [Leaflet.ExtraMarkers](https://github.com/coryasilva/Leaflet.ExtraMarkers#properties).
An additional shape of `simple-circle`, that draws a circle at the given color without a pin shape, is supported on top of these.

To change the map marker icons for your notes, go to the Map View settings and scroll to Marker Icon Rules.

A single marker is defined with a _tag pattern_ and _icon details_.
The tag pattern is usually a tag name (e.g. `#dogs`), but it can also be with a wildcard (e.g. `#trips/*`).
Icon details are a few properties: icon name (taken from the Font Awesome catalog), color and shape.

![](img/marker-rules.png)

A single marker is defined in the following JSON structure:
`{"prefix": "fas", "icon": "fa-bus", "shape": "circle", "color": "red"}`

To add a marker with a bus icon, click New Icon Rule, search Font Awesome (in the link above) for 'bus', choose [this icon](https://fontawesome.com/v5.15/icons/bus?style=solid), then see that its name is `fa-bus`.
Once you enter `fa-bus` in the icon name, you should immediately see your icon in the preview.
To make this icon apply for notes with the `#travel` tag, type `#travel` in the Tag Name box.
Alternatively, just paste an emoji of a bus (e.g. from [Emojipedia](https://emojipedia.org)) into the icon name box.

### Tag Rules

To apply an icon to a note with geolocation data, Map View scans the complete list of rules by their order, always starting from `default`.
A rule matches if the tag that it lists is included in the note, and then the rule's fields will overwrite the corresponding fields of the previous matching rules, until all rules were scanned.
This allows you to set rules that change just some properties of the icons, e.g. some rules change the shape according to some tags, some change the color etc.

Here's the example I provide as a probably-not-useful default in the plugin:

```
	{ruleName: "default", preset: true, iconDetails: {"prefix": "fas", "icon": "fa-circle", "markerColor": "blue"}},
	{ruleName: "#trip", preset: false, iconDetails: {"prefix": "fas", "icon": "fa-hiking", "markerColor": "green"}},
	{ruleName: "#trip-water", preset: false, iconDetails: {"prefix": "fas", "markerColor": "blue"}},
	{ruleName: "#dogs", preset: false, iconDetails: {"prefix": "fas", "icon": "fa-paw"}},
```

This means that all notes will have a blue `fa-circle` icon by default.
However, a note with the `#trip` tag will have a green `fa-hiking` icon.
Then, a note that has both the `#trip` and `#trip-water` tags will have a `fa-hiking` marker (when the `#trip` rule is applied), but a **blue** marker, because the `#trip-water` overwrites the `markerColor` that the previous `#trip` rule has set.

Tag rules also support wildcards, e.g. a rule in the form of `"#food*": {...}` will match notes with the tag `#food`, `#food/pizza`, `#food/vegan`, `#food-to-try` etc.

The settings also allow advanced users to manually edit the configuration tree, and there you can use more properties based on the [Leaflet.ExtraMarkers](https://github.com/coryasilva/Leaflet.ExtraMarkers#properties) properties. Manual edits update the GUI in real-time.

## In-Note Location Search & Auto-Complete

Map View adds an Obsidian command named 'Add inline geolocation link', that you can (and encouraged) to map to a keyboard shortcut, e.g. `Ctrl+L` or `Ctrl+Shift+L`.
This command inserts an empty inline location template: `[](geo:)`.

When editing an inline location in this format, whether if you added it manually or using the command, if you start entering a link name, Map View will start offering locations based on a geocoding service.
Selecting one of the suggestions will fill-in the coordinates of the chosen locations and _not_ change your link name (assuming you prefer your own name rather than the formal one offered by the geocoding service).

![](img/geosearch-suggest.gif)

If your note is not yet marked as one including locations (by a `locations:`) tag in the front matter, this is added automatically.

### Changing a Geocoding Provider

By default, Map View is configured to use OpenStreetMap as the search provider.
If you prefer to use the Google Maps search, you can configure this in the plugin settings.

The Google Geocoding API is practically free or very cheap for normal note-taking usage, but you'd need to setup a project and obtain an API key from Google.
See [here](https://developers.google.com/maps/documentation/javascript/get-api-key) for more details.

If you want, you can add to your API key the slightly more expensive [Places API](https://developers.google.com/maps/documentation/places/web-service/cloud-setup), then turn on "Use Google Places for searches" in the Map View settings.
For most reasonable note-taking usage, you will not likely go beyond the Places API free tier.

**Note:** usage of any geocoding provider is at your own risk, and it's your own responsibility to verify you are not violating the service's terms of usage.

## Map Sources

By default, Map View uses the [CartoDB Voyager Map](https://github.com/CartoDB/basemap-styles), which is free for up to 75K requests per month.
However, you can change or add map sources in the configuration with any service that has a tiles API using a standard URL syntax.

There are many services of localized, specialized or just beautifully-rendered maps that you can use, sometimes following a free registration.
See a pretty comprehensive list [here](https://wiki.openstreetmap.org/wiki/Raster_tile_providers).

For providers that use an API key (e.g. MapTiler or Mapbox), consult the provider documentation for how to add the key to the API URL.
For example, in MapTiler it would be `https://api.maptiler.com/maps/outdoor/{z}/{x}/{y}.png?key=ABCDEFGH`.

Some providers have an extra setting for HiDPI ("retina") tiles, which look sharper on high-resolution displays; to use them automatically when a suitable display is detected, add `{r}` as an optional resolution identifier in the URL.

Although that's the case with this plugin in general, it's worth noting explicitly that using 3rd party map data properly, and making sure you are not violating any terms of use, is your own responsibility.

Note that Google Maps is not in that list, because although it does provide the same standard form of static tiles in the same URL format, the Google Maps terms of service makes it difficult to legally bundle the maps in an application.

If you have multiple map sources, they can be switched from the View pane.
Additionally, you can set an optional different dark theme URL for each map source.
If a dark theme is detected, or if you specifically change the map source type to Dark (using the drop down in the View pane), you will get the Dark URL if one is configured.

## Presets

If there is a map state you would like to save and easily come back to, you can save it as a preset.
To do so, open the Presets pane in the main plugin's controls, and click 'Save as' to save the current view with a name you can easily go back to.

If you enter an already-existing name, that preset will be overwritten.

The saved preset includes the map state (zoom & pan), the filters used, and if you check the box in the "save as" dialog -- also the chosen map source.
If you do not include the map source as part of the preset, switching to the newly-saved preset will use the currently-selected map source.

Presets _do not_ store the map's theme (light/dark).

The Default preset is special; you can save it using the 'Save as Default' button, and come back to it by clicking the Reset button, by choosing the Default preset from the box, or by opening a fresh Map View that has no previously saved state.

## Open In

Many context menus of Map View display a customizable Open In list, which can open a given location in external sources.
These sources can be Google Maps, OpenStreetMap, specialized mapping tools or pretty much anything you use for viewing locations.

![](img/open-in.png)

The Open In list is shown:

- When right-clicking on the map.
- When right-clicking a marker on the map.
- When right-clicking a geolocation link in a note (if not turned off in the settings).
- When right-clicking a line in a note that has a location.
- In the context menu of a note that has a front matter location.

This list can be edited through the plugin's settings menu, with a name that will be displayed in the context menus and a URL pattern. The URL pattern has two parameters -- `{x}` and `{y}` -- that will be replaced by the latitude and longitude of the clicked location. There's also an optional `{name}` parameter that can be replaced with the name of the location (the note name or inline link name).

![](img/custom-open-in.png)

Popular choices may be:

- Google Maps: `https://maps.google.com/?q={x},{y}`
- OpenStreetMap: `https://www.openstreetmap.org/#map=16/{x}/{y}` (replace `16` with your preferred zoom level)
- Waze (online dropped pin): `https://ul.waze.com/ul?ll={x}%2C{y}&navigate=yes&zoom=17` (replace `17` with your preferred zoom level)

And you can figure out many other mapping services just by inspecting the URL.

## URL Parsing Rules

As described above, Map View uses _URL parsing rules_ in several places to provide the ability to parse URLs (or other strings) from external sources and convert them to standard geolocations.

1. When right-clicking a line with a recognized link, a "Convert to Geolocation" entry will be shown in the editor context menu.
2. When a recognized link is detected in the system clipboard, a "Paste as Geolocation" entry will be added in the editor context menu.
3. In the "New geolocation note" dialog and map search, pasting a supported URL will parse the geolocation.

URL parsing rules can be configured in the plugin's configuration pane and requires familiarity with regular expressions.

The syntax expects two captures group and you can configure if they are parsed as `lat, lng` (most common) or `lng, lat`.

And if you think your added regular expressions are solid enough, please add them to the plugin using a PR so others can benefit!

![](img/url-parsing.png)

## View URLs

You can save the current map state as a URL, which will open from other apps or from within Obsidian.

Click "Copy Map View URL" from the view's "more options" context menu, or "Copy URL" from the map Presets control.
You can paste the resulting `obsidian://` URL in any local app on your computer or phone, and it will launch Obsidian with Map View in the same view you saved.

Alternatively, you can paste this link inside a note and make it clickable by making it a Markdown link: `[Link name](url...)`.
This is really useful for going to a specific view (with its query, map source, zoom, pan etc) that is related to a note, e.g. a trip plan.

## Follow Active Note

Map View has a mode on which the map refocuses according to the currently active file, so if you have Map View open in its own pane, it can follow whatever file you are currently focused on.

This is closely related to the setting of "map follows search results", and probably works most intuitively when it is on.

The specific behavior of how to "follow" the active note can be configured via the 'query format for "follow active note"' setting in the configuration.
By default, Map View uses the [query](#queries) `path:"$PATH$"`, which means that when you switch to a note, the view automatically updates the query to show only the markers within the path of this note. You can edit this setting to achieve more fine-grained behaviors, for example:

- Use `linkedfrom:"$PATH$"` for a more elaborate inclusion of markers from both the file you're on and files it links to.
- Use `linkedfrom:"$PATH$" OR linkedto:"$PATH$"` to include markers that the active note links to and also markers that _link to this file_.

## Offline Tiles

Map View can store map tiles locally, to be used for caching and offline usage.
Whenever a map tile is needed to display a Map View or an embedded map, it is first searched in the local storage, leading to considerably better performance and less data usage the more you use Map View.

By default every downloaded map tile is saved to the cache, and downloaded tiles are stored for 6 months or up to 2GB (when the max storage size is reached, tiles are purged by age). These values are configurable under the "Offline Maps" section of the plugin's settings.

Additionally, you can batch-download map tiles that you expect to use often or offline:

- Open the Downloaded Tiles dialog by clicking "offline maps..." from the Map View context menu or "offline storage..." from the plugin settings.
- Click "download tiles..." to open the new download job dialog.
- This dialog creates a new download job based on the currently-active Map View, i.e. it will save the area of the map currently displayed.
- You can decide on a range of zoom levels for which to download tiles in the currently-displayed area of the map, with the current zoom you are viewing displayed under "current zoom level".
- If you choose "skip existing tiles", the download job will include only tiles that don't yet exist in the offline cache, but if you have tiles from a long time ago and the area has changed, your map may be an inconsistent mix of new and old tiles.
- **WARNING:** it is up to you to make sure you do not flood the tiles provider, as well as to make sure that caching tiles locally does not violate any terms of use (most providers encourage that, as it saves bandwidth, but it's up to you to make sure with your own specific tile providers).
- To prevent an accidental flood of tile providers, a maximum of 1 million tiles per download job is hard-coded.

![](img/offline-download.png)

Once starting a download job it progresses in the background, and you can cancel it or track its progress via the Downloaded Tiles dialog. **There is no need to keep the dialog open**, but if it's a mobile device (i.e. iOS or Android), the OS might pause the download when the device screen turns off, or close Obsidian completely.

**General tips:**

- Keep in mind that any click on the map's '+' button increases the zoom level by one. You can use that to assess the level of detail you want to keep offline; The number of tiles to download and the size to store increase exponentially between zoom levels, so if you want to save a large area for offline usage, you probably don't want to go beyond 5-6 zoom levels.
- You can selectively store different areas in different levels of detail, e.g. 4 zoom levels for your whole country and then 4 more levels for your city or area. Just start a few consecutive downloads while potentially marking "skip existing tiles".
- If you want to keep a large offline storage, make sure to adjust the "max offline tiles storage" plugin setting.

In order to get a sense of what tiles are available offline, you can check "highlight offline tiles" from the Map View context menu. It will mark with a blue box the tiles that are available locally. The mark is updated only when the map is redrawn, so to visualize the automatic cache (if turned on), go to an area and zoom level that was not downloaded, zoom in, then zoom back out.

Technically, tiles are stored locally in IndexedDB blobs.
There is currently no support to sync them between devices.

## GPS Location Support

**This still in early beta.**

Map View works inside Obsidian, and as such, is limited by some restrictions that Obsidian enforces.
One of these restrictions is that the Obsidian apps (both desktop and mobile) do not ship with location permission enabled, and as such, plugins that run within Obsidian cannot access the device location.
This has been discussed in the past with the Obsidian developers, but as a notes app, they prefer to keep this unavailable for the time being.

As a workaround, Map View supports an external **geo helper** app, which has separate permissions, and can report the current location to Map View from outside the app.
**This is currently in an early beta, and the experience may not be optimal.**
However, it answers the basic need of adding proper GPS support to Map View in many cases.

There are currently two variants of the Geo Helper app: a web app and an Android app.
[Visit the Geo Helper repo for instructions how to install and use it](https://github.com/esm7/obsidian-geo-helper) (the web app requires no installation, but you should still read the instructions).

**Either way, the Geo Helper runs completely locally and your location is not sent to any server. Feel free to inspect the code (and improvements are welcome).**

To use the Geo Helper, first turn on "GPS" in the Map View settings.
Then, select the Geo Helper type: external URL (default), installed app or command line.
The use for "command line" is for more advanced usages where you want the web app saved locally, or if you want it launched with a browser that is not your default.

This adds the following functionality:

- A GPS location icon is added to Map View maps (below the search controls). When clicked, it tries to get your location via the Geo Helper, and displays it on the map if successful.
- Multiple commands that can be mapped and launched from within notes:
    - GPS: copy inline location
    - GPS: new geolocation note
    - GPS: find location and focus
    - GPS: add geolocation (inline) at current position
    - GPS: add geolocation (front matter) to current note.

Many of these can also be launched directly from the geo helper after it finds your location.

**Help needed:** the geo helper mobile app is currently only available for Android. If you are an iOS developer who wishes to build and maintain the corresponding app, please reach out.

## Links View

Map View can optionally draw edges between markers of linked notes.

To turn this on, open the "Links" drop-down on the map controls and choose "show links".

The way it works is that all the markers of a given file (sources) are shown as linked to the markers pointed by the links in that file (destinations).
A destination can be:

- A whole file -- then all the markers in the source file are linked to all the markers in the destination file.
- A heading/block -- then all the markers in the source file are linked to:
    - The front-matter marker of the destination file, if any.
    - Only inline locations in the referenced heading/block.

Finally, you can configure the color used for the edges on the map using any valid [HTML color name](https://www.w3schools.com/tags/ref_colornames.asp) or a hex value like `#faebd7`.

**Warning!** heavily-linked maps are resource-intensive, so it's advisable to turn on links display only when your markers are reasonably filtered. Due to the way they work, links may need to be recalculated every time notes with geolocations are changed. Open Map Views (even background ones) with thousands of visible links may cause hiccups when typing inside geolocation notes that are included in these views' filters.

![](img/links.png)

## Import from KML

Map View has a built-in tool to convert geolocations from a KML file, typically generated by a tool like Google My Maps.
(To generate a KML from Google My Maps, in the map's context menu click "download KML", and select "export as KML instead of KMZ".)

To use it, open a new or an existing note, and from the note context menu click "import geolocations from file..."

Select a KML file to import, optionally edit the template used to create geolocations, then click "import into note".

## Relation to Obsidian Leaflet

Users who are looking to add mapping capabilities to Obsidian may want to also look at the great [Obsidian Leaflet plugin](https://github.com/valentine195/obsidian-leaflet-plugin).
And while both plugins are about maps and use Leaflet.js as their visual engine, they represent different approaches.

**What’s similar?**

- Both plugins support creating maps from your notes, or a folder of notes, with extensive options for customization.
- Both support creating a map for a specific use (e.g. a trip plan), from a focused set of notes, embedding the map in a note etc.

**What's different?**

- Map View started as a view (similarly to Obsidian’s Graph View) rather than an embedded syntax. And while it now supports embedding maps in notes, the main interaction with it is with a GUI and not with a code block. Leaflet, in contrast, offers its customizations mostly via code in its code block.
- Map View parses geolocations from the front-matter of notes and also from an inline syntax within notes (allowing multiple geolocations in a note, also with different individual tags), while Leaflet focuses on a geolocation-per-note approach (and further locations can be added to the map code itself).
- Map View is meant to be a research tool based on your notes: it offers interactive queries through a UI, for example, in order to get insights from it or consult it when planning a trip or arriving to a location. In contrast, Leaflet seems to be more directed towards presenting the most fine-grained customizable map.
- Map View has powerful geolocation search tools that allow you to quickly add locations from within a note or from the map.
- Map View builds marker icons based on customizable rules, so you do stuff like “color all #food/\* items in red”, on top of that “give #food/pizza a pizza icon”, and all pizza-tagged places will have a red pizza icon. In Leaflet marker icons are given individually for each marker, or with a global setting that assigns a full icon to a tag.
- Leaflet supports GPX files, overlays and GeoJSON shapes to be added to the map.
- Given the stand-alone nature of its maps, Leaflet is probably more suitable for TTRPG maps. (These are also possible with Map View, but I believe it comes less naturally.)

## Changelog

### 5.5.0

**The Big Stuff:**

- A mechanism and various tools for **offline usage**. This includes:

    - The ability to batch-download map tiles for offline usage.
    - Manage downloaded tiles, e.g. selectively purge old tiles, add or delete downloaded data etc.
    - Auto-cache tiles locally as part of the plugin's normal usage, with a configurable auto-purge after a certain age and storage size.
    - The above can make Map View _considerably faster_ to start up, and it gets faster the more you use it.
    - See [the documentation](#offline-tiles) for more details.

- An [internal tool](#import-from-kml) for importing data from a KML file straight into a note, with configurable formats and fields.
    - This is a lot thanks to [@mofosyne](https://github.com/mofosyne) who prototyped a very good KML conversion tool some time ago, and agreed to use his code as a base.

**Other New Features:**

- A new 'minimize' button for the controls panel (https://github.com/esm7/obsidian-map-view/issues/270), which was super easy to do after the Svelte rewrite, so why not :)
- Google Maps place data in templates (thanks @HalFrgrd!)
- Supporting templates with YAML content (thanks @HalFrgrd!)
- New setting "search delay while typing" (which was previously hard-coded to 250ms).
- If turned on in the settings (which is by default), Map View hijacks the context menu of geolinks in notes, to make sure the Map View "open in" options show up rather than Obsidian's defaults.
- The `open-map-search` command can now either search in an existing Map View or open a new one. This means it can be mapped to a global Obsidian shortcut which will launch Map View with the search dialog.

**Fixes:**

- Inconsistency in front matter format (https://github.com/esm7/obsidian-map-view/issues/288).
- Inline tags don't work without a trailing space (https://github.com/esm7/obsidian-map-view/issues/286).

**Under the Hood:**

- The map controls were rewritten in Svelte.
    - The immediate benefit is much shorter and cleaner code, but the main incentive is to be able to easily add UI-centric features with much less effort.
    - **This might break themes or snippets with special customization for Map View.** Please let me know of any issues.
- Maintenance work, package upgrades and code cleanups.

### 5.1.0

> [!NOTE]
> I originally wanted this release to be a very major one, with several big features some users have been waiting for.
> However due to lack of time to complete them in a timely manner, and a big bunch of important fixes and tweaks adding up, I'm releasing this packed minor version for now.

- Allow filtering by front matter properties - thanks @zakj! (Fixes https://github.com/esm7/obsidian-map-view/issues/257)
- When adding a front-matter geolocation to a note, Map View will now overwrite a previous front-matter geolocation if such existed. Fixes https://github.com/esm7/obsidian-map-view/issues/248 and generally improves the behavior with Obsidian properties.
- I didn't give proper credit to @The-Noah for a change actually included in 5.0.3: support for front-matter links in 'linkedto' and 'linkedfrom'.
- Improvements to plugin startup time.
- Fixed a bug of links showing unexpectedly when opening Map View from a saved URL.
- Added support for country flags emojis (https://github.com/esm7/obsidian-map-view/issues/183).
- Upgraded the underlying library to Leaflet 1.9.4, thanks to @Falke-Design who helped me figure out how to make this play nicely inside Obsidian.
- Added a delicate indication (orange dot) that filters are on.
- Added support by default to the HiDPI tiles of CartoDB (thanks @sbungartz!)
- Major improvement to the mechanism behind geolink previews in notes, providing much less false triggers on touch screens (https://github.com/esm7/obsidian-map-view/issues/185), and hopefully eliminating all issues when clicking on such links (https://github.com/esm7/obsidian-map-view/issues/200).
- URL template does multi replace, e.g. support for OsmAnd (https://github.com/esm7/obsidian-map-view/issues/283)
- Fix to auto light/dark theme selection (https://github.com/esm7/obsidian-map-view/pull/284 and https://github.com/esm7/obsidian-map-view/issues/136), thanks @The-Noah!
- Allow a whitespace around the comma in a geolocation (https://github.com/esm7/obsidian-map-view/pull/272), thanks @zakj!

Improvements relating to the [Geo Helper](https://github.com/esm7/obsidian-geo-helper):

- Support for the new (0.0.2) optional location label.
- Geo Helper settings reorganization (**the settings are not backwards-compatible**, you may need to revalidate them for Geo Helper to work).
- No longer using filters or other state when asking for an external GPS location.

### 5.0.3

Many important bug fixes are waiting for me to have a little spare time, in the meantime had to settle for smaller release.

- Fixed "Paste as geolocation" issue (https://github.com/esm7/obsidian-map-view/issues/253), thanks
  @frees0l0!
- Fixed "Using custom property instead default location does not work" (https://github.com/esm7/obsidian-map-view/issues/251).

### 5.0.2

- Fixed moving inline markers followed by tags (https://github.com/esm7/obsidian-map-view/issues/234).
- Fixed certain emojis not being correctly recognized as such for map markers (https://github.com/esm7/obsidian-map-view/issues/233).
- Added support for string arrays as front matter locations (https://github.com/esm7/obsidian-map-view/issues/229).

### 5.0.1

- Fixed a bug in "add geolocation (front matter) to current note".

### 5.0.0

**This is a major Map View release with tons of new features and fixes.**

**Forward compatibility warning:** front-matter notes you create with this version will not show in previous Map View versions.

**The Big Changes:**

- Map View can now show **note links** as edges in the map. Open the Links drop-down in the map controls to turn it on and configure how it looks (big thanks to @IanLindsley!)
    - All the markers of a given file are linked to the markers pointed by the links in that file. Those links may reference the whole destination file, and then all the markers in it are linked, or a heading/block and then only the front-matter marker and specific heading/block locations are linked.
    - See more details [above](#links-view).
- Markers can now be moved on the map: right-click a marker, click "enable move" and drag the marker to its new location. The corresponding note will be updated automatically. Big thanks to @IanLindsley for this too!
- You can now set emojis as map markers. In configuring marker icon rules, just enter an emoji instead of a Font Awesome name and it should show up.
- Markers can now show optional **labels** showing the marker name. You can turn it on from the View drop-down on the map.
- The marker popup mechanism was rewritten to enable a much more streamlined experience and less intrusive popups.
    - I was in a dilemma whether to continue maintaining the old option (the Obsidian native preview), as it still has its upsides (e.g. it allows scrolling and it preserves note formatting better), but decided against it due to the complexity it will introduce in the long run.
    - If you have a strong opinion towards using the old Obsidian preview window, please open an issue so it can be discussed.
- Map View now supports heading links and block links in 'linkedfrom:' queries, and also for the new Links feature.
    - I recommend the "Copy Block Link" plugin that makes this more useful.
- New format for front matter location, `location: "lat,lng"`, which plays better with Obsidian's property editor. The old format is still supported but new front-matter notes will be created with the new format. Solves https://github.com/esm7/obsidian-map-view/issues/202.
- A new marker shape `simple-circle` is now supported, drawing a simple circle at the given color without a pin shape.

**Smaller Improvements:**

- The key to use for front matter geolocation is now configurable (https://github.com/esm7/obsidian-map-view/issues/195)
- Search names containing slashes are now sanitized and handled properly (https://github.com/esm7/obsidian-map-view/issues/207)
- Inline tags are now part of filter suggestions (https://github.com/esm7/obsidian-map-view/issues/225)
- The actions from a search marker context menu now use the geolocation of the marker rather than the mouse location.
- The way Font Awesome is used was changed to mitigate a performance issue that Map View caused (https://github.com/esm7/obsidian-map-view/issues/216).
- Font Awesome upgraded to 6.5.1.
- Map View now requires Obsidian 1.5.6 or newer, and uses the formal front matter API.
- Tab icons of map views now have the proper map pin icon (https://github.com/esm7/obsidian-map-view/issues/227).
- Fixed a bug of the cursor not jumping forward after an inline location suggestion.

### 4.0.1

- Fixed support for innerHTML in icon rules (https://github.com/esm7/obsidian-map-view/issues/183).
- Fixed some Android issues

### 4.0.0

- **GPS support** (to some extent!)
    - Map View now supports a companion app that can help receive a precise location and use it in the map or within your notes.
    - This is experimental and will not work smoothly for everyone right away.
    - See [here](#gps-location-support) for more details.
- Routing: when right-clicking the map you now have a "mark as routing source", and once such a source is marked, you can launch an external tool for driving directions or ETAs (by default Google Maps) for various destinations. This is really useful for assessing distances or travel times in trip planning.
- Embedded maps now have a 'lock' control that disables accidental changes to the map (https://github.com/esm7/obsidian-map-view/issues/178).
- Added a not-fully-baked `autoFit` flag, with no proper UI yet (https://github.com/esm7/obsidian-map-view/issues/171). See [here](#advanced-additional-options) for details.
- Added a `$filename$` template parameter to embedded map code blocks (https://github.com/esm7/obsidian-map-view/issues/146).
- The `linkedto:` query operator now actually resolves Obsidian links instead of doing textual comparison (https://github.com/esm7/obsidian-map-view/issues/162).
    - Note: this might break existing queries that counted on it to work on text comparison rather than an actual note path.
- Fixed various major issues with presets (https://github.com/esm7/obsidian-map-view/issues/175).
- Fix to blank or malformed inline geolocations throwing exceptions when opening notes (https://github.com/esm7/obsidian-map-view/issues/172).
- Fixed issues with Map View trying to process non-Markdown files in the vault (https://github.com/esm7/obsidian-map-view/issues/181).
- The "open in last-used pane" setting now respects pinned panes (https://github.com/esm7/obsidian-map-view/issues/134).

### 3.1.1

- Geolinks in notes, and also front matter geolocations, are now internal Map View links! (https://github.com/esm7/obsidian-map-view/issues/144)
    - It means that by default, when you click a geolink in Map View, it will open inside Map View.
    - This can be turned off in the settings.
- There are now optional **map preview hovers** for geolinks in notes (if the above feature is turned on).
    - This is currently off by default, and will probably become on by default while I gain confidence in its performance and stability.
- Wildcard support for "tag that denotes inline locations" (https://github.com/esm7/obsidian-map-view/issues/164).
- Fixed background in the wrong color on dark mode (https://github.com/esm7/obsidian-map-view/issues/163).

### 3.0.2

Many small improvements and fixes:

- New ribbon icon, based on Lucide, to be consistent with the Obsidian design guidelines (thanks @huy-vuong!)
- Added a setting to always show the link name on map view popup (and organized the relevant settings into their own section). (https://github.com/esm7/obsidian-map-view/issues/149)
- Added support for wildcards in tag queries (https://github.com/esm7/obsidian-map-view/issues/159).
- Fixed a bug with queries set in "query format for follow active note" that include multiple `$PATH$` items (https://github.com/esm7/obsidian-map-view/issues/158).
- Added the ability to use a custom tag instead of an empty `locations:` YAML tag (https://github.com/esm7/obsidian-map-view/issues/135).
- The `linkedfrom` query filter now requires an exact match (https://github.com/esm7/obsidian-map-view/issues/152).
- Fixed a bug where the "save" button didn't pop up on embedded maps if only the zoom was changed (https://github.com/esm7/obsidian-map-view/issues/156).

### 3.0.1

**Fixes:**

- The ampersand character `&` now works in queries.
- Embeds added not through a map (aka "quick embeds") now open with a minimum zoom value of 7, so they won't show the entire world if this is the user's default view.

### 3.0.0

**New:**

- **Map embeds are finally here!**
    - Map View now supports embedding maps in notes.
    - This works really well also in Canvas!
    - See [here](#embedding-maps-in-notes) for more details.
- Major performance improvements, especially when displaying hundreds of markers or more. Map View now opens and interacts instantly even with thousands of markers and dozens of icon rules.
    - **IMPORTANT:** this might break some very custom marker icon rules (especially ones that use properties that I didn't think to test).
    - If you experience such breakage, please open an issue and use version 2.2.0 in the meantime.
- Major overhaul to the settings of "default action for map marker click". There are now fine-grained settings for fine-tuning what happens when clicking, Ctrl+clicking and middle-clicking markers (and other actions that open a note from the map), and tabs are supported as well as panes.
- Similarly to the above, new settings were added for all actions that open Map View, so different behaviors can be configured for a click, Ctrl+click and middle-click.
- When pasting an inline geolocation from the clipboard, a "locations:" front-matter is automatically added (unless turned off in the plugin settings).

**Fixes:**

- Parenthesis now work in queries (https://github.com/esm7/obsidian-map-view/issues/124).
- Commas now work in queries (https://github.com/esm7/obsidian-map-view/issues/125).
- Fixed weird pane selection logic for "Open in Map View" and "Show on Map View" caused by the Obsidian 1.1 UI changes (https://github.com/esm7/obsidian-map-view/issues/127).
- Fixed the annoying `$CURSOR` that was added to some notes for some people (https://github.com/esm7/obsidian-map-view/issues/21).
- Fixes to "follow active note" (https://github.com/esm7/obsidian-map-view/issues/113).

### 2.2.0

**New:**

- Selecting a range of lines in the editor that have multiple geolocations will show a new "focus X geolocations in Map View" context menu item.
- A new `name` query filter (to filter for a geolocation name) and a `lines` filter (to filter for a line range within a file).
- Small UI improvements, e.g. icons in pop-ups.
- "Focus Note in Map View" is now shown also for notes that have no geolocations, since the "follow active note" query format may look into links.
- Some behind-the-scenes work for exciting big features that are cooking...

**Fixes:**

- **Various fixes and tweaks required for Obsidian 0.16.x.**
    - As part of this, "paste as geolocation" is now always shown in the editor context menu, regardless of whether a string that can be parsed was found in the clipboard. This is due to a change of how menus in Obsidian work, which doesn't allow to inspect the clipboard while populating the menu.
- Fixed Google Places search not working on Mobile due to `querystring` not being present for some reason.
- Fixed pop-ups not always clickable on mobile.
- Fixed a problem in parsing link names on lines that contain other links.

### 2.1.1

Fix for OpenStreetMap geolocation search stopped working for some users.

### 2.1.0

**BREAKING:** this release requires Obsidian 0.15.3 or newer.

**New:**

- The results of a search, or a focused geolocation, is now highlighted by a blue glow on the map.
    - The glow can be customized via CSS.
- Made the graph controls more compact when minimized and properly positioned in more cases.
- "Follow active note" now works using a customizable query, see [here](#follow-active-note) for details.
- Clearing "follow active note" now resets the query.
- Search results are now shown sorted by distance from the center of the map.
- Shift+Enter on an existing marker in the search result will go to that marker without zooming. This goes hand-in-hand with the highlighting introduced above, so you can easily highlight various markers without the map view changing.
- When using Google Places as the search provider, geosearch results now give priority to the displayed area.
- Adapted the various menus to utilize the Obsidian 0.15.x sections.
- Upgrade the Font Awesome library to 6.1, making more icons available.
- On mobile, some map interactions are custom-tailored for tapping (tapping a marker shows its name, long-tapping opens the menu).

**Fixes:**

- Fixed misbehavior of the controls in the case of multiple Map View instances.
- Fixed Map View interfering with the Graph View controls in some themes.
- Fixed inline tags not recognized when followed by a comma.
- Various fixes to the internal state update mechanism, hopefully allowing smoother zoom/pan operations with no unexpected jumps.
    - As part of this, zoom/pan animations are back on state transitions.
- Fixes for "follow active note" on Obsidian 0.15.x.
- Fixed a duplication bug if a file contains multiple markers in the same geolocation (https://github.com/esm7/obsidian-map-view/issues/85).

### 2.0.5

- Improved the logic of saving "back/forward" history in a few cases, and optimized the state update logic to make transitions faster.
- More fixes to "follow active note" when "map follows search results" is set (https://github.com/esm7/obsidian-map-view/issues/92).
- Fixed "add geolocation (frontmatter)" to notes that contain `---` as a content separator (https://github.com/esm7/obsidian-map-view/issues/98). Thanks @MattWilcox!
- Fixed paths with backslashes not working in "new note path" (https://github.com/esm7/obsidian-map-view/issues/97).
- Fix to new note map action not working on Android (https://github.com/esm7/obsidian-map-view/issues/96).
- The default zoom for "show on map" action, as set in the settings, is now also used as a max zoom in "map follows search results".
- In-note tag suggestions no longer include the pound sign (which should not be there for inline tags).

### 2.0.4

- Fixed an issue with cluster expansion not working.
- Improved "copy URL" handling between different devices.
- Added a clear button to the new query box.
- Fixed touch move & zoom that stopped working due to an unintended upgrade to Leaflet 1.8.0.
- Fixed inconsistent moves and jumps during fast series of events.

### 2.0.3

- Fixed searched stopped working in some cases which are not the new Google Places (https://github.com/esm7/obsidian-map-view/issues/93).
- Fixes to "follow active note" (https://github.com/esm7/obsidian-map-view/issues/92).

### 2.0.0

This is a massive version with a huge number of updates, pushing Map View to the next level of functionality!

- Instead of the previous simplistic tag filtering, Map View now has a powerful [Queries](#queries) mechanism with multiple search and logical operators.
    - Queries are marker-based and not file-based. This will be a breaking change for some users.
- Under the View control, turn on "follow active note" for Map View to focus on any note that is opened or changed (https://github.com/esm7/obsidian-map-view/issues/71).
- Showing the note name is now optional (https://github.com/esm7/obsidian-map-view/issues/75). I wish this could be in the same popup as the preview, but currently I don't see how to do this.
- Fixed issues with front matter tag support (https://github.com/esm7/obsidian-map-view/issues/72) (thanks @gentlegiantJGC!)
- Added a configuration for the max zoom of a tile layer (thanks @gentlegiantJGC!).
    - This also includes a new "zoom beyond max" setting, which will not limit you to the highest zoom level of a tile source.
- The map search tool now uses the same search window as "New geolocation note", which beyond the configured geocoding service, also does URL parsing.
    - It also includes existing markers, so you can quickly jump to an existing name on the map.
    - Except the bonus of making the UI more uniform, this is very important for usability, especially on mobile. e.g. you can use it to get your location from another app and use it to create notes or explore around.
    - A "search active map view" command was added (available when a map view is focused) so a keyboard shortcut can be assigned to the map search.
- Auto-completion for inline tags. If you type `tag:` in a line that includes a valid geolocation, you will get suggestions for tag names.
- In the context menu of a map view, or in the Presets controls section, you can copy the active view as a link.
    - Clicking this link from another app should launch Obsidian and open Map View with the exact same view (including the query, zoom, pan and map source).
    - To use this in Obsidian notes paste the URL inside a link, e.g. `[Link name](obsidian://...)`
- All the geolocation searches now support the Google Places API, and will prefer results from Places API over the simpler Google Geolocation API.
    - This requires your Google API key to include credentials for Google Places, see the documentation above.
- Several UI improvements:
    - The map control panel is now prettier and smaller when unused.
    - The note name and cluster popups now follow the Obsidian theme.
