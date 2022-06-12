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
import * as leaflet from 'leaflet';
// Ugly hack for obsidian-leaflet compatability, see https://github.com/esm7/obsidian-map-view/issues/6
// @ts-ignore
import * as leafletFullscreen from 'leaflet-fullscreen';
import '@fortawesome/fontawesome-free/js/all.min';
import 'leaflet/dist/leaflet.css';
import 'leaflet-geosearch/dist/geosearch.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';

import * as consts from 'src/consts';
import { MapState, mergeStates, stateToUrl, copyState } from 'src/mapState';
import { PluginSettings, TileSource, DEFAULT_SETTINGS } from 'src/settings';
import MapViewPlugin from 'src/main';
import * as utils from 'src/utils';

import { MapContainer, ViewSettings } from 'src/mapContainer';

export abstract class MapView extends ItemView {
	public mapContainer: MapContainer;
    /** The state that was last saved to Obsidian's history stack */
    private lastSavedState: MapState;

    /**
     * Construct a new map instance
     * @param leaf The leaf the map should be put in
     * @param settings The plugin settings
     * @param plugin The plugin instance
     */
    constructor(
        leaf: WorkspaceLeaf,
        settings: PluginSettings,
		viewSettings: ViewSettings,
        plugin: MapViewPlugin
    ) {
        super(leaf);
        this.navigation = true;
		this.mapContainer = new MapContainer(this.contentEl, settings, viewSettings, plugin, plugin.app);

		// TODO document
		this.mapContainer.highLevelSetViewState = async (partialState: Partial<MapState>) => {
			// This check is seemingly a duplicate of the one inside setViewState, but it's
			// actually very needed. Without it, it's possible that we'd call Obsidian's
			// setViewState (the one below) with the same object twice, in the first call
			// (which may have ongoingChanges > 0) we'll ignore the change and in the 2nd call
			// Obsidian will ignore the change (thinking the state didn't change).
			// We want to ensure setViewState is called only if we mean to change the state
			if (this.mapContainer.ongoingChanges > 0)
				return;
			if (!this.leaf || this.leaf.view == null)
				return;
			const viewState = this.leaf?.getViewState();
			if (viewState?.state) {
				const newState = Object.assign({}, viewState?.state, partialState);
				await this.leaf.setViewState({...viewState, state: newState});
			}
		}

        this.app.workspace.on('file-open', async (file: TFile) => await this.onFileOpen(file) );
    }


    onMoreOptionsMenu(menu: Menu) {
        menu.addItem((item: MenuItem) => {
            item.setTitle('Copy Map View URL').onClick(() => {
                this.mapContainer.copyStateUrl();
            });
        });
        super.onMoreOptionsMenu(menu);
    }

    /**
     * This is the native Obsidian setState method.
     * You should *not* call it directly, but rather through this.leaf.setViewState(state), which will
     * take care of preserving the Obsidian history if required.
     */
    async setState(state: MapState, result: any) {
        // If there are ongoing changes to the map happening at once, don't bother updating the state -- it will only
        // cause unexpected jumps and flickers
        if (this.mapContainer.ongoingChanges > 0) return;
        // It can go below 0 in some cases
        this.mapContainer.ongoingChanges = 0;
        if (this.shouldSaveToHistory(state)) {
            result.history = true;
            this.lastSavedState = copyState(state);
        }
        await this.mapContainer.internalSetViewState(state, true);
        if (this.mapContainer.display.controls) this.mapContainer.display.controls.tryToGuessPreset();
    }

	/**
	 * Native Obsidian getState method.
	 */
    getState() {
        return this.mapContainer.state;
    }

    /** Decides and returns true if the given state change, compared to the last saved state, is substantial
     * enough to be saved as an Obsidian history state */
    shouldSaveToHistory(newState: MapState) {
        if (!this.mapContainer.settings.saveHistory) return false;
        if (!this.lastSavedState) return true;
        if (newState.forceHistorySave) {
            newState.forceHistorySave = false;
            return true;
        }
        // If the zoom changed by HISTORY_SAVE_ZOOM_DIFF -- save the history
        if (
            Math.abs(newState.mapZoom - this.lastSavedState.mapZoom) >=
            consts.HISTORY_SAVE_ZOOM_DIFF
        )
            return true;
        // If the previous center is no longer visible -- save the history
        // (this is partially cheating because we use the actual map and not the state object)
        if (
            this.lastSavedState.mapCenter &&
            !this.mapContainer.display.map
                .getBounds()
                .contains(this.lastSavedState.mapCenter)
        )
            return true;
        if (
            newState.query != this.lastSavedState.query ||
            newState.chosenMapSource != this.lastSavedState.chosenMapSource
        )
            return true;
        return false;
    }

    isDarkMode(settings: PluginSettings): boolean {
        if (settings.chosenMapMode === 'dark') return true;
        if (settings.chosenMapMode === 'light') return false;
        // Auto mode - check if the theme is dark
        if ((this.app.vault as any).getConfig('theme') === 'obsidian')
            return true;
        return false;
    }

    async onOpen() {
		await this.mapContainer.onOpen();
		return super.onOpen();
    }

    onClose() {
        this.mapContainer.onClose();
		return super.onClose();
    }

    onResize() {
        this.mapContainer.display.map.invalidateSize();
    }

	async onFileOpen(file: TFile) {
		if (this.getState().followActiveNote) {
			if (file) {
				if (!this.leaf || this.leaf.view == null)
					return;
				let viewState = this.leaf?.getViewState();
				if (viewState) {
					let mapState = viewState.state as MapState;
					const newQuery = utils.replaceFollowActiveNoteQuery(file, this.mapContainer.settings);
					// Change the map state only if the file has actually changed. If the user just went back
					// and forth and the map is still focused on the same file, don't ruin the user's possible
					// zoom and pan.
					// However, if the view is an auto-zoom view (unlike an auto-zoom global setting), we re-zoom
					// on every switch
					if (mapState.query != newQuery || this.mapContainer.viewSettings.autoZoom) {
						mapState.query = newQuery;
						mapState.parentLeaf = this.app.workspace.activeLeaf;
						this.mapContainer.internalSetViewState(mapState, true, true);
					}
				}
			}
		}
	}
}
