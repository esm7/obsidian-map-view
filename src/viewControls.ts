import {
    App,
    getIcon,
    TFile,
    type HeadingCache,
    Menu,
    MenuItem,
    Notice,
    normalizePath,
} from 'obsidian';

import { type PluginSettings } from 'src/settings';

import { MapContainer, type ViewSettings } from 'src/mapContainer';
import MapViewPlugin from 'src/main';
import { LocationSearchDialog, SuggestInfo } from 'src/locationSearchDialog';
import { FileMarker } from 'src/fileMarker';
import { LayerCache } from 'src/layerCache';
import { type MapState } from 'src/mapState';

import * as leaflet from 'leaflet';
import { mount, unmount } from 'svelte';
import ViewControlsPanel from './components/ViewControlsPanel.svelte';
import ImportDialog from './components/ImportDialog.svelte';
import { SvelteModal } from 'src/svelte';
import { convertToGeoJson, createGeoJsonInFile } from 'src/geojsonLayer';
import { getMarkerFromUser } from 'src/markerSelectDialog';
import * as menus from 'src/menus';

export type EditModeTools = {
    noteToEdit: TFile;
    noteHeading: string | null;
    tags: string[];
};

export class ViewControls {
    private parentElement: HTMLElement;
    private settings: PluginSettings;
    private viewSettings: ViewSettings;
    private app: App;
    private view: MapContainer;
    private plugin: MapViewPlugin;

    private controlPanel: any;

    public editModeTools: EditModeTools = {
        noteToEdit: null,
        noteHeading: null,
        tags: [],
    };

    constructor(
        parentElement: HTMLElement,
        settings: PluginSettings,
        viewSettings: ViewSettings,
        app: App,
        view: MapContainer,
        plugin: MapViewPlugin,
    ) {
        this.parentElement = parentElement;
        this.settings = settings;
        this.viewSettings = viewSettings;
        this.app = app;
        this.view = view;
        this.plugin = plugin;
    }

    public reload() {
        if (this.controlPanel) {
            unmount(this.controlPanel);
        }
        this.createControls();
    }

    createControls() {
        this.controlPanel = mount(ViewControlsPanel, {
            target: this.parentElement,
            props: {
                app: this.app,
                plugin: this.plugin,
                settings: this.settings,
                view: this.view,
                viewSettings: this.viewSettings,
                editModeTools: this.editModeTools,
            },
        });
    }

    setViewSettings(newSettings: Partial<ViewSettings>) {
        for (const key in newSettings) {
            (this.viewSettings as any)[key] = (newSettings as any)[key];
        }
    }

    public updateControlsToState() {
        if (this.controlPanel) this.controlPanel.updateControlsToState();
    }

    public openEditSection(file?: TFile) {
        if (this.controlPanel) this.controlPanel.openEditSection(file);
    }
}

export class SearchControl extends leaflet.Control {
    view: MapContainer;
    app: App;
    plugin: MapViewPlugin;
    settings: PluginSettings;
    searchButton: HTMLAnchorElement;
    clearButton: HTMLAnchorElement;

    constructor(
        options: any,
        view: MapContainer,
        app: App,
        plugin: MapViewPlugin,
        settings: PluginSettings,
    ) {
        super(options);
        this.view = view;
        this.app = app;
        this.plugin = plugin;
        this.settings = settings;
    }

    onAdd(map: leaflet.Map) {
        const div = leaflet.DomUtil.create(
            'div',
            'leaflet-bar leaflet-control',
        );

        this.searchButton = div.createEl('a', 'mv-icon-button');
        this.searchButton.title = 'Search';
        this.searchButton.appendChild(getIcon('search'));
        this.searchButton.addEventListener('click', (ev: MouseEvent) => {
            this.openSearch(this.view.getMarkers());
        });
        this.clearButton = div.createEl('a', 'mv-icon-button');
        this.clearButton.title = 'Clear search result';
        this.clearButton.appendChild(getIcon('trash'));
        this.clearButton.addClass('mv-hidden');
        this.clearButton.addEventListener('click', (ev: MouseEvent) => {
            this.view.removeSearchResultMarker();
            this.clearButton.addClass('mv-hidden');
        });

        return div;
    }

    openSearch(existingLayers: LayerCache) {
        let markerSearchResults: SuggestInfo[] = [];
        for (const marker of existingLayers.layers) {
            if (marker instanceof FileMarker) {
                markerSearchResults.push({
                    name: marker.extraName
                        ? `${marker.extraName} (${marker.file.basename})`
                        : marker.file.basename,
                    location: marker.location,
                    resultType: 'existingMarker',
                    existingMarker: marker,
                    icon: marker.icon.options,
                });
            }
        }
        const markersByDistanceToCenter = markerSearchResults.sort(
            (item1: SuggestInfo, item2: SuggestInfo) => {
                const center = this.view.state.mapCenter;
                const d1 = item1.location.distanceTo(center);
                const d2 = item2.location.distanceTo(center);
                if (d1 < d2) return -1;
                else return 1;
            },
        );

        const searchDialog = new LocationSearchDialog(
            this.app,
            this.plugin,
            this.settings,
            'custom',
            'Find in map',
            null,
            null,
            markersByDistanceToCenter,
            true,
            [{ command: 'shift+enter', purpose: 'go without zoom & pan' }],
        );
        searchDialog.customOnSelect = (
            selection: SuggestInfo,
            evt: MouseEvent | KeyboardEvent,
        ) => {
            this.view.removeSearchResultMarker();
            const keepZoom = evt.shiftKey;
            if (selection && selection.resultType == 'existingMarker') {
                this.view.goToSearchResult(
                    selection.location,
                    selection.existingMarker,
                    keepZoom,
                );
            } else if (selection && selection.location) {
                this.view.addSearchResultMarker(selection, keepZoom);
                this.clearButton.removeClass('mv-hidden');
            }
        };
        searchDialog.searchArea = this.view.display.map.getBounds();
        searchDialog.open();
    }
}

export class RealTimeControl extends leaflet.Control {
    view: MapContainer;
    app: App;
    settings: PluginSettings;
    locateButton: HTMLAnchorElement;

    constructor(
        options: any,
        view: MapContainer,
        app: App,
        settings: PluginSettings,
    ) {
        super(options);
        this.view = view;
        this.app = app;
        this.settings = settings;
    }

    onAdd(map: leaflet.Map) {
        const div = leaflet.DomUtil.create(
            'div',
            'leaflet-bar leaflet-control',
        );
        this.locateButton = div.createEl('a', 'mv-icon-button');
        this.locateButton.addClass('mv-location-button');
        this.locateButton.addEventListener('click', (ev: MouseEvent) => {
            this.view.goToRealTimeLocation();
        });
        this.disable();

        return div;
    }

    enable() {
        this.locateButton.innerHTML = '';
        this.locateButton.appendChild(getIcon('locate'));
        this.locateButton.title = 'Go to current location';
    }

    disable() {
        this.locateButton.innerHTML = '';
        this.locateButton.appendChild(getIcon('locate-off'));
        this.locateButton.title = 'Location unavailable';
    }
}

export class LockControl extends leaflet.Control {
    view: MapContainer;
    app: App;
    settings: PluginSettings;
    lockButton: HTMLAnchorElement;
    locked: boolean = false;

    constructor(
        options: any,
        view: MapContainer,
        app: App,
        settings: PluginSettings,
    ) {
        super(options);
        this.view = view;
        this.app = app;
        this.settings = settings;
    }

    onAdd(map: leaflet.Map) {
        const div = leaflet.DomUtil.create(
            'div',
            'leaflet-bar leaflet-control',
        );
        this.lockButton = div.createEl('a', 'mv-icon-button');
        const icon = getIcon('lock');
        this.lockButton.appendChild(icon);
        this.lockButton.addEventListener('click', (ev: MouseEvent) => {
            this.locked = !this.locked;
            this.updateIcon();
            this.view.setLock(this.locked);
        });

        return div;
    }

    updateFromState(locked: boolean) {
        this.locked = locked;
        this.updateIcon();
    }

    updateIcon() {
        if (this.locked) this.lockButton.addClass('on');
        else this.lockButton.removeClass('on');
    }
}

export class EditControl extends leaflet.Control {
    view: MapContainer;
    app: App;
    settings: PluginSettings;
    editButton: HTMLAnchorElement;

    constructor(
        options: any,
        view: MapContainer,
        app: App,
        settings: PluginSettings,
    ) {
        super(options);
        this.view = view;
        this.app = app;
        this.settings = settings;
    }

    onAdd(map: leaflet.Map) {
        const div = leaflet.DomUtil.create(
            'div',
            'leaflet-bar leaflet-control',
        );
        this.editButton = div.createEl('a', 'mv-icon-button');
        this.editButton.title = 'Edit Mode';
        const icon = getIcon('pencil');
        this.editButton.appendChild(icon);
        this.editButton.addEventListener('click', (ev: MouseEvent) => {
            const newEditMode = !this.view.state.editMode;
            this.view.highLevelSetViewState({ editMode: newEditMode });
            if (newEditMode) {
                // Open the 'edit' view pane
                this.view.display.controls.openEditSection();
            }
        });

        return div;
    }

    updateFromState(editMode: boolean) {
        this.updateIcon(editMode);
    }

    updateIcon(editMode: boolean) {
        if (editMode) this.editButton.addClass('on');
        else this.editButton.removeClass('on');
    }
}

export class AddFileControl extends leaflet.Control {
    view: MapContainer;
    app: App;
    plugin: MapViewPlugin;
    settings: PluginSettings;
    addFileButton: HTMLAnchorElement;

    constructor(
        options: any,
        view: MapContainer,
        app: App,
        plugin: MapViewPlugin,
        settings: PluginSettings,
    ) {
        super(options);
        this.view = view;
        this.app = app;
        this.settings = settings;
    }

    verifyNoteSelected() {
        if (!this.view.display.controls.editModeTools.noteToEdit) {
            new Notice('You must first select a note.');
            return false;
        }
        return true;
    }

    onAdd(map: leaflet.Map) {
        const div = leaflet.DomUtil.create(
            'div',
            'leaflet-bar leaflet-control',
        );
        this.addFileButton = div.createEl('a', 'mv-icon-button');
        this.addFileButton.title = 'Add from file...';
        const icon = getIcon('file-plus');
        this.addFileButton.appendChild(icon);
        this.addFileButton.addEventListener('click', (ev: MouseEvent) => {
            const menu = new Menu();
            menu.addItem((item: MenuItem) => {
                item.setTitle('Import geolocations from KML...');
                item.onClick(() => {
                    if (!this.verifyNoteSelected()) return;
                    const file =
                        this.view.display.controls.editModeTools.noteToEdit;
                    const heading =
                        this.view.display.controls.editModeTools.noteHeading;
                    const dialog = new SvelteModal(
                        ImportDialog,
                        this.app,
                        this.plugin,
                        this.settings,
                        {
                            editor: null,
                            file,
                            heading,
                            doAfterImport: () => {
                                new Notice(
                                    `Locations were imported into ${file.name}.`,
                                );
                            },
                        },
                    );
                    dialog.open();
                });
            });
            menu.addItem((item: MenuItem) => {
                item.setTitle(
                    'Import a path and add to Edit Mode note (as inline)...',
                );
                item.onClick(async () => {
                    const result = await getFileFromUser();
                    if (result) {
                        const [fileName, fileContent] = result;
                        if (fileName && fileContent) {
                            const extension = fileName
                                .split('.')
                                .pop()
                                .toLowerCase();
                            try {
                                const geojson = convertToGeoJson(
                                    fileContent,
                                    extension,
                                );
                                if (geojson) {
                                    const file =
                                        this.view.display.controls.editModeTools
                                            .noteToEdit;
                                    const heading =
                                        this.view.display.controls.editModeTools
                                            .noteHeading;
                                    const tags =
                                        this.view.display.controls.editModeTools
                                            .tags;
                                    await createGeoJsonInFile(
                                        geojson,
                                        file,
                                        heading,
                                        tags,
                                        this.app,
                                        this.settings,
                                    );
                                    new Notice(
                                        'The path was saved as an inline GeoJSON in the selected Edit Mode file.',
                                    );
                                } else new Notice('Error converting file');
                            } catch (e) {
                                console.error('Error converting file:', e);
                                new Notice('Error converting file');
                            }
                        }
                    }
                });
            });
            menu.addItem((item: MenuItem) => {
                item.setTitle('Import a path as vault attachment...');
                item.onClick(async () => {
                    const result = await getFileFromUser();
                    if (result) {
                        const [fileName, fileContent] = result;
                        if (fileName && fileContent) {
                            const saveInPath =
                                await this.app.fileManager.getAvailablePathForAttachment(
                                    fileName,
                                );
                            await this.app.vault.create(
                                saveInPath,
                                fileContent,
                            );
                            new Notice(
                                'The chosen file was added as a vault attachment.',
                            );
                        }
                    }
                });
            });
            menu.showAtMouseEvent(ev);
        });

        async function getFileFromUser(): Promise<[string, string] | null> {
            return new Promise((resolve) => {
                const fileInput = div.createEl('input');
                fileInput.type = 'file';
                fileInput.style.display = 'none';
                fileInput.accept = '.gpx,.kml,.geojson';

                fileInput.addEventListener('change', async (event) => {
                    const target = event.target as HTMLInputElement;
                    if (target.files && target.files.length > 0) {
                        const inputFile = target.files[0];
                        const content = await inputFile.text();
                        resolve([inputFile.name, content]);
                    } else {
                        resolve(null);
                    }
                });

                // Handle cancel case
                fileInput.addEventListener('cancel', () => {
                    resolve(null);
                });

                fileInput.click();
            });
        }

        return div;
    }
}

export class RoutingControl extends leaflet.Control {
    view: MapContainer;
    app: App;
    plugin: MapViewPlugin;
    settings: PluginSettings;
    sourceButton: HTMLAnchorElement;
    clearButton: HTMLAnchorElement;
    destinationButton: HTMLAnchorElement;

    constructor(
        options: any,
        view: MapContainer,
        app: App,
        plugin: MapViewPlugin,
        settings: PluginSettings,
    ) {
        super(options);
        this.view = view;
        this.app = app;
        this.plugin = plugin;
        this.settings = settings;
    }

    onAdd(map: leaflet.Map) {
        const div = leaflet.DomUtil.create(
            'div',
            'leaflet-bar leaflet-control',
        );

        this.sourceButton = div.createEl('a', 'mv-icon-button');
        this.sourceButton.title = 'Select a routing source';
        this.sourceButton.appendChild(getIcon('flag'));
        this.sourceButton.addEventListener('click', async (ev: MouseEvent) => {
            const result = await getMarkerFromUser(
                this.view.getState().mapCenter,
                'Select a marker for routing',
                this.app,
                this.plugin,
                this.settings,
                [{ command: 'shift+enter', purpose: 'use without zoom & pan' }],
            );
            if (result) {
                const [marker, ev] = result;
                if (marker && marker instanceof FileMarker) {
                    this.view.setRoutingSource(marker.location, marker.name);
                    if (!ev.shiftKey) {
                        const keepZoom = ev.shiftKey;
                        this.view.goToSearchResult(
                            marker.location,
                            this.view.display.routingSource,
                            keepZoom,
                        );
                    }
                }
            }
        });

        this.destinationButton = div.createEl('a', 'mv-icon-button');
        this.destinationButton.title = 'Select a routing destination';
        this.destinationButton.appendChild(getIcon('milestone'));
        this.destinationButton.addEventListener(
            'click',
            async (ev: MouseEvent) => {
                if (
                    !this.view.display.routingSource &&
                    !this.view.lastRealTimeLocation
                ) {
                    new Notice('You must select a routing source first.');
                    return;
                }
                const result = await getMarkerFromUser(
                    this.view.getState().mapCenter,
                    'Select a marker for routing',
                    this.app,
                    this.plugin,
                    this.settings,
                );
                if (result) {
                    const [marker, _] = result;
                    if (marker && marker instanceof FileMarker) {
                        const menu = new Menu();
                        menus.populateRouteToPoint(
                            this.view,
                            marker.location,
                            menu,
                            this.settings,
                        );
                        menu.showAtMouseEvent(ev);
                    }
                }
            },
        );

        this.clearButton = div.createEl('a', 'mv-icon-button');
        this.clearButton.title = 'Clear all routing';
        this.clearButton.appendChild(getIcon('trash'));
        this.clearButton.addEventListener('click', async (ev: MouseEvent) => {
            this.view.clearAllRouting(true);
        });

        this.updateControlsToState();

        return div;
    }

    public updateControlsToState() {
        if (!this.view.display.routingSource) {
            this.destinationButton.addClass('mv-hidden');
            this.clearButton.addClass('mv-hidden');
        } else {
            this.destinationButton.removeClass('mv-hidden');
            this.clearButton.removeClass('mv-hidden');
        }
    }
}
