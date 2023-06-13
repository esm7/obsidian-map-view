import { Editor, MenuItem, Menu, App, TFile, TAbstractFile } from 'obsidian';

import * as leaflet from 'leaflet';

import * as settings from 'src/settings';
import * as utils from 'src/utils';
import { LocationSearchDialog } from 'src/locationSearchDialog';
import { UrlConvertor } from 'src/urlConvertor';
import { LocationSuggest } from 'src/locationSuggest';
import { MapState } from 'src/mapState';
import MapViewPlugin from 'src/main';
import { MapContainer } from 'src/mapContainer';
import { ImportDialog } from 'src/importDialog';
import { PluginSettings } from 'src/settings';
import { FileMarker } from 'src/markers';

export function addShowOnMap(
    menu: Menu,
    geolocation: leaflet.LatLng,
    file: TAbstractFile,
    editorLine: number,
    plugin: MapViewPlugin,
    settings: PluginSettings
) {
    if (geolocation) {
        menu.addItem((item: MenuItem) => {
            item.setTitle('Show on map');
            item.setSection('mapview');
            item.setIcon('globe');
            const openFunc = async (evt: MouseEvent) =>
                await plugin.openMapWithLocation(
                    geolocation,
                    utils.mouseEventToOpenMode(settings, evt, 'openMap'),
                    file,
                    editorLine,
                    evt.shiftKey
                );
            item.onClick(openFunc);
            addPatchyMiddleClickHandler(item, menu, openFunc);
        });
    }
}

export function addOpenWith(
    menu: Menu,
    geolocation: leaflet.LatLng,
    settings: settings.PluginSettings
) {
    if (geolocation) {
        menu.addItem((item: MenuItem) => {
            item.setTitle('Open with default app');
            item.setIcon('map-pin');
            item.setSection('mapview');
            item.onClick((_ev) => {
                open(`geo:${geolocation.lat},${geolocation.lng}`);
            });
        });
        // Populate menu items from user defined "Open In" strings
        populateOpenInItems(menu, geolocation, settings);
    }
}

/**
 * Populate a context menu from the user configurable URLs
 * @param menu The menu to attach
 * @param location The geolocation to use in the menu item
 * @param settings Plugin settings
 */
export function populateOpenInItems(
    menu: Menu,
    location: leaflet.LatLng,
    settings: settings.PluginSettings
) {
    for (let setting of settings.openIn) {
        if (!setting.name || !setting.urlPattern) continue;
        const fullUrl = setting.urlPattern
            .replace('{x}', location.lat.toString())
            .replace('{y}', location.lng.toString());
        menu.addItem((item: MenuItem) => {
            item.setTitle(`Open in ${setting.name}`);
            item.setIcon('map-pin');
            item.setSection('mapview');
            item.onClick((_ev) => {
                open(fullUrl);
            });
        });
    }
}

export function addGeolocationToNote(
    menu: Menu,
    app: App,
    plugin: MapViewPlugin,
    editor: Editor,
    settings: settings.PluginSettings
) {
    menu.addItem((item: MenuItem) => {
        item.setTitle('Add geolocation (front matter)');
        item.setSection('mapview');
        item.setIcon('globe');
        item.onClick(async (_evt: MouseEvent) => {
            const dialog = new LocationSearchDialog(
                app,
                plugin,
                settings,
                'addToNote',
                'Add geolocation to note',
                editor
            );
            dialog.open();
        });
    });
}

export function addFocusNoteInMapView(
    menu: Menu,
    file: TFile,
    settings: settings.PluginSettings,
    plugin: MapViewPlugin
) {
    menu.addItem((item: MenuItem) => {
        const fileName = utils.trimmedFileName(file);
        item.setTitle(`Focus '${fileName}' in Map View`);
        item.setIcon('globe');
        item.setSection('mapview');
        const openFunc = async (evt: MouseEvent) =>
            await plugin.openMapWithState(
                {
                    query: utils.replaceFollowActiveNoteQuery(file, settings),
                } as MapState,
                utils.mouseEventToOpenMode(settings, evt, 'openMap'),
                true
            );
        item.onClick(openFunc);
        addPatchyMiddleClickHandler(item, menu, openFunc);
    });
}

export function addUrlConversionItems(
    menu: Menu,
    editor: Editor,
    suggestor: LocationSuggest,
    urlConvertor: UrlConvertor,
    settings: PluginSettings
) {
    if (editor.getSelection()) {
        // If there is text selected, add a menu item to convert it to coordinates using geosearch
        menu.addItem((item: MenuItem) => {
            item.setTitle('Convert to geolocation (geosearch)');
            item.setIcon('search');
            item.setSection('mapview');
            item.onClick(async () => await suggestor.selectionToLink(editor));
        });
    }

    if (urlConvertor.hasMatchInLine(editor))
        // If the line contains a recognized geolocation that can be converted from a URL parsing rule
        menu.addItem(async (item: MenuItem) => {
            item.setTitle('Convert to geolocation');
            item.setIcon('search');
            item.setSection('mapview');
            item.onClick(async () => {
                urlConvertor.convertUrlAtCursorToGeolocation(editor);
            });
        });

    menu.addItem((item: MenuItem) => {
        item.setTitle('Paste as geolocation');
        item.setSection('mapview');
        item.setIcon('clipboard-x');
        item.onClick(async () => {
            const clipboard = await navigator.clipboard.readText();
            let clipboardLocation =
                urlConvertor.parseLocationFromUrl(clipboard);
            if (clipboardLocation instanceof Promise)
                clipboardLocation = await clipboardLocation;
            if (clipboardLocation)
                utils.insertLocationToEditor(
                    clipboardLocation.location,
                    editor,
                    settings
                );
        });
    });
}

export function addEmbed(menu: Menu, plugin: MapViewPlugin, editor: Editor) {
    menu.addItem((item: MenuItem) => {
        item.setTitle('Embed a Map View');
        item.setSection('mapview');
        item.setIcon('log-in');
        item.onClick(() => {
            plugin.openQuickEmbed(editor);
        });
    });
}

export function addNewNoteItems(
    menu: Menu,
    geolocation: leaflet.LatLng,
    mapContainer: MapContainer,
    settings: settings.PluginSettings,
    app: App
) {
    const locationString = `${geolocation.lat},${geolocation.lng}`;
    menu.addItem((item: MenuItem) => {
        item.setTitle('New note here (inline)');
        item.setIcon('edit');
        item.setSection('new');
        const openFunc = async (ev: MouseEvent) => {
            const newFileName = utils.formatWithTemplates(
                settings.newNoteNameFormat
            );
            const [file, cursorPos] = await utils.newNote(
                app,
                'multiLocation',
                settings.newNotePath,
                newFileName,
                locationString,
                settings.newNoteTemplate
            );
            mapContainer.goToFile(
                file,
                utils.mouseEventToOpenMode(settings, ev, 'openNote'),
                async (editor) =>
                    utils.goToEditorLocation(editor, cursorPos, false)
            );
        };
        item.onClick(openFunc);
        addPatchyMiddleClickHandler(item, menu, openFunc);
    });
    menu.addItem((item: MenuItem) => {
        item.setTitle('New note here (front matter)');
        item.setIcon('edit');
        item.setSection('new');
        const openFunc = async (ev: MouseEvent) => {
            const newFileName = utils.formatWithTemplates(
                settings.newNoteNameFormat
            );
            const [file, cursorPos] = await utils.newNote(
                app,
                'singleLocation',
                settings.newNotePath,
                newFileName,
                locationString,
                settings.newNoteTemplate
            );
            mapContainer.goToFile(
                file,
                utils.mouseEventToOpenMode(settings, ev, 'openNote'),
                async (editor) =>
                    utils.goToEditorLocation(editor, cursorPos, false)
            );
        };
        item.onClick(openFunc);
        addPatchyMiddleClickHandler(item, menu, openFunc);
    });
}

export function addCopyGeolocationItems(
    menu: Menu,
    geolocation: leaflet.LatLng
) {
    const locationString = `${geolocation.lat},${geolocation.lng}`;
    menu.addItem((item: MenuItem) => {
        item.setTitle(`Copy geolocation`);
        item.setIcon('copy');
        item.setSection('copy');
        item.onClick((_ev) => {
            navigator.clipboard.writeText(`[](geo:${locationString})`);
        });
    });
    menu.addItem((item: MenuItem) => {
        item.setTitle(`Copy geolocation as front matter`);
        item.setIcon('copy');
        item.setSection('copy');
        item.onClick((_ev) => {
            navigator.clipboard.writeText(
                `---\nlocation: [${locationString}]\n---\n\n`
            );
        });
    });
}

export function addFocusLinesInMapView(
    menu: Menu,
    file: TFile,
    fromLine: number,
    toLine: number,
    numLocations: number,
    plugin: MapViewPlugin,
    settings: settings.PluginSettings
) {
    menu.addItem((item: MenuItem) => {
        item.setTitle(
            `Focus ${numLocations} ${
                numLocations > 1 ? 'geolocations' : 'geolocation'
            } in Map View`
        );
        item.setIcon('globe');
        item.setSection('mapview');
        const openFunc = async (evt: MouseEvent) =>
            await plugin.openMapWithState(
                {
                    query: `path:"${file.path}" AND lines:${fromLine}-${toLine}`,
                } as MapState,
                utils.mouseEventToOpenMode(settings, evt, 'openMap'),
                true
            );
        item.onClick(openFunc);
        addPatchyMiddleClickHandler(item, menu, openFunc);
    });
}

export function addImport(
    menu: Menu,
    editor: Editor,
    app: App,
    plugin: MapViewPlugin,
    settings: settings.PluginSettings
) {
    menu.addItem((item: MenuItem) => {
        // TODO: this is an unfinished corner of the code, currently bypassed by default
        item.setTitle('Import geolocations from file...');
        item.setIcon('globe');
        item.setSection('mapview');
        item.onClick(async (evt: MouseEvent) => {
            const importDialog = new ImportDialog(
                editor,
                app,
                plugin,
                settings
            );
            importDialog.open();
        });
    });
}

export function populateOpenNote(
    mapContainer: MapContainer,
    fileMarker: FileMarker,
    menu: Menu,
    settings: PluginSettings
) {
    menu.addItem((item: MenuItem) => {
        item.setTitle('Open note');
        item.setIcon('file');
        item.setSection('open-note');
        item.onClick(async (evt: MouseEvent) => {
            mapContainer.goToMarker(
                fileMarker,
                utils.mouseEventToOpenMode(settings, evt, 'openNote'),
                true
            );
        });
        addPatchyMiddleClickHandler(item, menu, async (evt: MouseEvent) => {
            mapContainer.goToMarker(
                fileMarker,
                utils.mouseEventToOpenMode(settings, evt, 'openNote'),
                true
            );
        });
    });
}

// The MenuItem object in the Obsidian API doesn't let us listen to a middle-click, so we patch around it
function addPatchyMiddleClickHandler(
    item: MenuItem,
    menu: Menu,
    handler: (ev: MouseEvent) => void
) {
    const itemDom = (item as any).dom as HTMLDivElement;
    if (itemDom) {
        itemDom.addEventListener('mousedown', (ev: MouseEvent) => {
            if (ev.button === 1) {
                menu.close();
                handler(ev);
            }
        });
    }
}

export function populateRouting(
    mapContainer: MapContainer,
    geolocation: leaflet.LatLng,
    menu: Menu,
    settings: settings.PluginSettings
) {
    if (geolocation) {
        menu.addItem((item: MenuItem) => {
            item.setTitle('Mark as routing source');
            item.setSection('mapview');
            item.setIcon('flag');
            item.onClick(() => {
                mapContainer.setRoutingSource(geolocation);
            });
        });

        if (mapContainer.display.routingSource) {
            menu.addItem((item: MenuItem) => {
                item.setTitle('Route to point');
                item.setSection('mapview');
                item.setIcon('milestone');
                item.onClick(() => {
                    const origin =
                        mapContainer.display.routingSource.getLatLng();
                    const routingTemplate = settings.routingUrl;
                    const url = routingTemplate
                        .replace('{x0}', origin.lat.toString())
                        .replace('{y0}', origin.lng.toString())
                        .replace('{x1}', geolocation.lat.toString())
                        .replace('{y1}', geolocation.lng.toString());
                    open(url);
                });
            });
        }
    }
}
