import { WorkspaceLeaf } from 'obsidian';

import { type PluginSettings } from 'src/settings';
import MapViewPlugin from 'src/main';

import { BaseMapView } from 'src/baseMapView';
import { type ViewSettings } from 'src/mapContainer';

export class MainMapView extends BaseMapView {
    constructor(
        leaf: WorkspaceLeaf,
        settings: PluginSettings,
        plugin: MapViewPlugin,
    ) {
        const viewSettings: ViewSettings = {
            showMinimizeButton: true,
            showZoomButtons: true,
            showMapControls: true,
            showFilters: true,
            showView: true,
            viewTabType: 'regular',
            showLinks: true,
            showEmbeddedControls: false,
            showPresets: true,
            showSearch: true,
            showRealTimeButton: true,
            showLockButton: false,
            showOpenButton: false,
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
