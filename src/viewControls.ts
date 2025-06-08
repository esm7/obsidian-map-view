import { App, getIcon, TFile } from 'obsidian';
import { askForLocation } from 'src/realTimeLocation';

import { type PluginSettings } from 'src/settings';

import { MapContainer, type ViewSettings } from 'src/mapContainer';
import MapViewPlugin from 'src/main';
import { LocationSearchDialog, SuggestInfo } from 'src/locationSearchDialog';
import { FileMarker } from 'src/fileMarker';
import { LayerCache } from 'src/layerCache';

import * as leaflet from 'leaflet';
import { mount, unmount } from 'svelte';
import ViewControlsPanel from './components/ViewControlsPanel.svelte';

export type EditModeTools = { noteToEdit: TFile };

export class ViewControls {
    private parentElement: HTMLElement;
    private settings: PluginSettings;
    private viewSettings: ViewSettings;
    private app: App;
    private view: MapContainer;
    private plugin: MapViewPlugin;

    private controlPanel: any;

    public editModeTools: EditModeTools = { noteToEdit: null };

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

    public updateControlsToState() {
        if (this.controlPanel) this.controlPanel.updateControlsToState();
    }

    public openEditSection() {
        if (this.controlPanel) this.controlPanel.openEditSection();
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
        this.searchButton = div.createEl('a');
        this.searchButton.innerHTML = '🔍';
        this.searchButton.addEventListener('click', (ev: MouseEvent) => {
            this.openSearch(this.view.getMarkers());
        });
        this.clearButton = div.createEl('a');
        this.clearButton.innerHTML = 'X';
        this.clearButton.style.display = 'none';
        this.clearButton.addEventListener('click', (ev: MouseEvent) => {
            this.view.removeSearchResultMarker();
            this.clearButton.style.display = 'none';
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
                this.clearButton.style.display = 'block';
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
    clearButton: HTMLAnchorElement;

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
        this.locateButton = div.createEl('a');
        this.locateButton.innerHTML = '⌖';
        this.locateButton.style.fontSize = '25px';
        this.locateButton.addEventListener('click', (ev: MouseEvent) => {
            askForLocation(this.app, this.settings, 'locate', 'showonmap');
        });
        this.clearButton = div.createEl('a');
        this.clearButton.innerHTML = 'X';
        this.clearButton.style.display = 'none';
        this.clearButton.addEventListener('click', (ev: MouseEvent) => {
            this.view.setRealTimeLocation(null, 0, 'clear');
            this.clearButton.style.display = 'none';
        });

        return div;
    }

    onLocationFound() {
        // Show the 'clear' button
        this.clearButton.style.display = 'block';
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
