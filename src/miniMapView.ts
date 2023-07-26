import { TFile, WorkspaceLeaf } from 'obsidian';

import { PluginSettings } from 'src/settings';
import MapViewPlugin from 'src/main';

import { BaseMapView } from 'src/baseMapView';
import { ViewSettings } from 'src/mapContainer';
import { MapState } from 'src/mapState';

export class MiniMapView extends BaseMapView {
    constructor(
        leaf: WorkspaceLeaf,
        settings: PluginSettings,
        plugin: MapViewPlugin
    ) {
        const viewSettings: ViewSettings = {
            showZoomButtons: true,
            showMapControls: true,
            showFilters: false,
            showView: true,
            viewTabType: 'mini',
            showEmbeddedControls: false,
            showPresets: false,
            showSearch: true,
            showRealTimeButton: true,
            showLockButton: false,
            showOpenButton: true,
            autoZoom: true,
            emptyFitRevertsToDefault: true,
        };
        super(leaf, settings, viewSettings, plugin);
    }

    async onOpen() {
        await super.onOpen();
        this.mapContainer.state.followActiveNote = true;
    }

    async setState(state: MapState, result: any) {
        state.followActiveNote = true;
        await super.setState(state, result);
    }

    getViewType() {
        return 'minimap';
    }

    getDisplayText() {
        return 'Mini Map View';
    }

    getIcon() {
        return 'map-pin';
    }

    async onFileOpen(file: TFile) {
        if (!this.contentEl.isShown) return;
        super.onFileOpen(file);
        if (file) this.mapContainer.display.mapDiv.style.visibility = 'visible';
        else this.mapContainer.display.mapDiv.style.visibility = 'hidden';
    }
}
