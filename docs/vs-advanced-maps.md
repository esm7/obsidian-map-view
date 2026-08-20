# Map View vs. Advanced Maps

[Advanced Maps](https://jin1c-3.github.io/obsidian-advanced-maps/en/) differs from the other plugins compared here in one structural way: it has no map view of its own. It extends the first-party Obsidian Maps view rather than rendering its own map, and bundles no map library. [Map View vs. Obsidian Maps](vs-obsidian-maps.md) is worth reading first, because several rows marked unsupported there change when Advanced Maps is installed.

## What's Similar

- Both display notes as pins on an interactive map, and respond to Bases filters.
- Both draw GPX, KML, TCX and GeoJSON paths, from stand-alone files or from notes that link to them.
- Both can search for places, enter a geolocation from the map, use the device's GPS, and show a map with no network connection.
- Both draw an elevation profile for a path that carries elevation data.

## What's Different

|                        | Map View                                                     | Obsidian Maps + Advanced Maps                                                                           |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| **Work mode**          | Bases or a stand-alone view                                  | Bases, plus inline maps from an embedded track file                                                     |
| **Locations per note** | Many — front matter + unlimited inline locations             | One, front matter only                                                                                  |
| **Inline locations**   | Supported, with per-location inline tags                     | Not supported                                                                                           |
| **Marker styling**     | Query-based display rules with icons, colors, shapes, badges | Bases properties and formulas, which the plugin leaves untouched                                        |
| **Filtering**          | Bases filter + Map View's own query language                 | Bases filter                                                                                            |
| **Routing**            | Built-in via GraphHopper API                                 | Not supported                                                                                           |
| **Path statistics**    | Elevation profile in the marker popup                        | Elevation profile, plus distance and elevation figures written into note properties that Bases can sort |
| **Geotagged photos**   | Not supported                                                | Placed on the map by their own EXIF, as thumbnails                                                      |
| **Offline usage**      | Automatic cache + batch download                             | A folder of tiles already on disk; no bulk download                                                     |
| **Map sources**        | Tile based                                                   | Vector or tile based                                                                                    |
| **Basemap alignment**  | Any tile source, with no datum conversion                    | GCJ-02 and BD-09 basemaps aligned with WGS-84 note coordinates                                          |

## Which Should I Use?

- **Map View** is the better choice if you want several locations in one note, inline geolocations in body text, display rules, built-in routing, or a map that does not require Bases at all.
- **Advanced Maps** may be the better choice if your notes already live in Bases, and you want the built-in Maps view to also show paths with sortable statistics, whole folders of geotagged photos, and locations entered from a search, a pasted map link or the map itself. It is also the one that aligns a Chinese basemap with WGS-84 coordinates.

The two are not mutually exclusive, and they do not read the same data: inline geolocations are invisible to Bases, so a vault that uses them keeps needing Map View either way.
