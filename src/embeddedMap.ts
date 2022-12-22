import {
    App,
    TAbstractFile,
    Loc,
    Editor,
    ItemView,
    MenuItem,
    Menu,
    TFile,
    WorkspaceLeaf,
    Notice,
} from 'obsidian';

import { PluginSettings } from 'src/settings';
import MapViewPlugin from 'src/main';

import { MapContainer, ViewSettings } from 'src/mapContainer';
import { MapState } from 'src/mapState';

export class EmbeddedMap {
    public mapContainer: MapContainer;

    constructor(
        parentEl: HTMLElement,
        settings: PluginSettings,
        plugin: MapViewPlugin
    ) {
        const viewSettings: ViewSettings = {
            showMapControls: true,
            showFilters: false,
            showView: true,
            viewTabType: 'mini',
            showPresets: false,
            showSearch: false,
            showRealTimeButton: false,
            showOpenButton: true,
            autoZoom: true,
            emptyFitRevertsToDefault: true,
        };

		// TODO TEMP
		parentEl.style.height = '300px';
		parentEl.addEventListener('resize', () => {
			this.onResize();
		});

        this.mapContainer = new MapContainer(
            parentEl,
            settings,
            viewSettings,
            plugin,
            plugin.app
        );
    }

	async onOpen() {
		await this.mapContainer.onOpen();
		// // TODO TEMP this is a terrible patch
		// setTimeout(() => this.onResize(), 100);
	}

	onResize() {
		if (this.mapContainer.display.map)
			this.mapContainer.display.map.invalidateSize();
	}
}
