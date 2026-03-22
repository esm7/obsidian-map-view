# Location Formats

Map View scans your notes and parses two types of location data: **front matter locations** and **inline locations**.

::: tip
The best way to use Map View is to never enter geolocations manually — let the plugin handle it. But you do need to understand the difference between front matter and inline formats to decide which to use.
:::

## Front Matter Location

A location in a note's [front matter](https://help.obsidian.md/Advanced+topics/YAML+front+matter):

```yaml
---
location: 40.6892494,-74.0466891
---
```

This is best for notes that represent a **single specific location** (e.g. a restaurant note, a hike note).

### Alternative Front Matter Syntax

The older array format (compatible with obsidian-leaflet) is also supported:

```yaml
---
location: [40.6892494, -74.0466891]
---
```

And the Obsidian property editor format:

```yaml
location:
    - '39.100105'
    - '-94.5781416'
```

Or:

```yaml
location:
    - 39.100105,-94.5781416
```

The `lat,lng` format (first example) is encouraged for Obsidian 1.4 and above, if you happen to enter locations manually for some reason.

## Inline Location URLs

Inline locations use the format `[link-name](geo:lat,lng)` and allow **multiple markers in the same note**.

To use inline locations, the note must have a `locations:` tag in its front matter (note: `locations`, not `location`). Map View adds this automatically in most cases.

```yaml
---
locations:
---

# Trip Plan

Point 1: [Hudson River](geo:42.277578,-76.1598107)
... more note content ...

Point 2: [New Haven](geo:41.2982672,-72.9991356)
```

Notes with multiple markers will show multiple markers on the map, all with the same note name. Clicking a marker jumps to the correct location within the note.

## Inline Tags

Inline locations support **inline tags** in the format `tag:tagname` (without the `#` sign):

```
Point 1: [Hudson River](geo:42.277578,-76.1598107) tag:dogs
```

This adds the tag `#dogs` specifically to that point, regardless of the note's own tags. Multiple inline tags are separated with spaces:

```
[](geo:42.2,-76.15) tag:dogs tag:trip
```

::: info
You must use `tag:` **without** the `#` sign for inline tags. Map View adds `#` internally for queries and display rules.
:::

## Custom Tag for Inline Geolocations

Instead of a `locations:` YAML tag, you can use a custom note tag. See **"tag name to denote inline geolocations"** in the settings.

::: warning
Having a non-empty "tag name to denote inline geolocations" setting currently slows down Map View significantly. This might be addressed in future releases.
:::
