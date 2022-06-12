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
			showSearch: true,
			showOpenButton: true,
			autoZoom: true,
			emptyFitRevertsToDefault: true
		};

		this.mapContainer = new MapContainer(parentEl, settings, viewSettings, plugin, plugin.app);
	}

}
