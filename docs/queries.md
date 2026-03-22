# Queries

Map View supports powerful queries to filter what is shown on the map.

![](/img/query.gif)

## Search Operators

| Operator               | Description                                                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tag:#...`             | Notes or markers tagged with a specific tag. Works on both note tags (`#hiking`) and inline tags (`tag:hiking`). Supports wildcards: `tag:#sleep*` matches `#sleep` and `#sleep/camping`. |
| `name:...`             | Markers whose name contains the given string. For front-matter geolocations this matches the file name. For inline geolocations this matches the link name and **ignores** the file name. |
| `path:...`             | Notes whose path matches the query. Includes all markers in matching notes.                                                                                                               |
| `linkedto:...`         | Notes that contain a link to the specified note. E.g. `linkedto:"Cave Hikes"` includes all notes that link to `[[Cave Hikes]]`.                                                           |
| `linkedfrom:...`       | Notes that are linked from the specified note (plus the origin note itself). E.g. `linkedfrom:"Trip to Italy"` includes all notes linked from `[[Trip to Italy]]`.                        |
| `["property":"value"]` | Notes with the property `property` set to `value`.                                                                                                                                        |
| `lines:x-y`            | Only inline markers defined in the given line range in their note. E.g. `lines:20-30`.                                                                                                    |

All operators are **case insensitive**.

### Notes on `linkedfrom`

- Obsidian heading and block links are supported: `[[Trip to Italy#Hotels]]` matches only front-matter markers or inline markers within that heading or block.
- The [Copy Block Link](https://github.com/mgmeyers/obsidian-copy-block-link) plugin makes block-level `linkedfrom` queries especially useful.
- Anything that resolves to a legal Obsidian link works (note name or full path), but partial names do not.

## Logical Operators

Combine search operators with:

- `AND` — both conditions must match
- `OR` — either condition must match
- `NOT` — negates the condition
- `(` `)` — grouping

::: warning Difference from Obsidian's Query Language
Map View uses `AND`, `OR`, `NOT` — **not** `-` for NOT, and spaces are not treated as `AND`.
:::

## Examples

```
linkedfrom:"Trip to Italy" AND tag:#wine
```

Places linked from your Italy trip that are tagged with `#wine`.

```
tag:#hike AND tag:#dogs
```

Hikes suitable for dogs.

```
tag:#hike AND (tag:#dogs OR tag:#amazing) AND NOT path:"bad places"
```

Great hikes (dogs-OK or amazing), excluding notes in the "bad places" path.

## Creative Uses

- Represent location types with tags: `#hike`, `#restaurant`, `#camping`
- Use tags for traits: `#hike/summer`, `#hike/easy`
- Use Zettelkasten backlinks: link to "Hikes that I Want" from relevant notes, then use `linkedto:"Hikes that I Want"` to find them on the map
- Create trip planning notes that link to places, then use `linkedfrom:"Trip to Italy"` to focus your plan

Save complex queries as [presets](presets.md) for easy reuse.
