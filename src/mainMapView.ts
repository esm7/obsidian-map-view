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

import { MapView } from 'src/mapView';
import { ViewSettings } from 'src/mapContainer';

export class MainMapView extends MapView {
	constructor(
		leaf: WorkspaceLeaf,
		settings: PluginSettings,
		plugin: MapViewPlugin
	) {
		const viewSettings: ViewSettings = {
			showMapControls: true,
			showFilters: true,
			showView: true,
			viewTabType: 'regular',
			showPresets: true,
			showSearch: true,
			showOpenButton: false
		};
		super(leaf, settings, viewSettings, plugin);
	}

    getViewType() {
        return 'map';
    }

    getDisplayText() {
        return 'Interactive Map View';
    }

}
