import {
    App,
    TAbstractFile,
    Editor,
    Menu,
    TFile,
    Loc,
    WorkspaceLeaf,
    Notice,
    MenuItem,
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
import { MapState, mergeStates, stateToUrl, getCodeBlock } from 'src/mapState';
import {
    OpenBehavior,
    PluginSettings,
    TileSource,
    DEFAULT_SETTINGS,
} from 'src/settings';
import {
    MarkersMap,
    BaseGeoLayer,
    FileMarker,
    buildMarkers,
    buildAndAppendFileMarkers,
    finalizeMarkers,
} from 'src/markers';
import { getIconFromOptions } from 'src/markerIcons';
import MapViewPlugin from 'src/main';
import * as utils from 'src/utils';
import {
    ViewControls,
    SearchControl,
    RealTimeControl,
    LockControl,
} from 'src/viewControls';
import { Query } from 'src/query';
import { GeoSearchResult } from 'src/geosearch';
import {
    RealTimeLocation,
    RealTimeLocationSource,
    isSame,
} from 'src/realTimeLocation';
import * as menus from 'src/menus';

export type ViewSettings = {
    showZoomButtons: boolean;
    showMapControls: boolean;
    showFilters: boolean;
    showView: boolean;
    viewTabType: 'regular' | 'mini';
    showEmbeddedControls: boolean;
    showPresets: boolean;
    showSearch: boolean;
    showOpenButton: boolean;
    showRealTimeButton: boolean;
    showLockButton: boolean;

    // Override the global settings auto zoom.
    // Unlike the global auto zoom, the view auto zoom also happens on every setState, so when a new view opens,
    // it makes sure to zoom
    autoZoom?: boolean;
    emptyFitRevertsToDefault?: boolean;
    skipAnimations?: boolean;
};

export class MapContainer {
    private app: App;
    public settings: PluginSettings;
    public viewSettings: ViewSettings;
    private parentEl: HTMLElement;
    /** The displayed controls and objects of the map, separated from its logical state.
     * Must only be updated in updateMarkersToState */
    public state: MapState;
    /** The map data */
    public display = new (class {
        /** The main HTML element holding the entire view (map and controls) */
        viewDiv: HTMLDivElement;
        /** The HTML element holding the map */
        mapDiv: HTMLDivElement;
        /** The leaflet map instance */
        map: leaflet.Map;
        tileLayer: leaflet.TileLayer;
        /** The cluster management class */
        clusterGroup: leaflet.MarkerClusterGroup;
        /** The markers currently on the map */
        markers: MarkersMap = new Map();
        controls: ViewControls;
        /** The zoom controls */
        zoomControls: leaflet.Control.Zoom;
        /** The search controls (search & clear buttons) */
        searchControls: SearchControl = null;
        /** The real-time geolocation controls */
        realTimeControls: RealTimeControl = null;
        /** The lock control */
        lockControl: LockControl = null;
        /** A marker of the last search result */
        searchResult: leaflet.Marker = null;
        /** The currently highlighted marker (if any) */
        highlight: leaflet.Layer = null;
        /** The actual entity that is highlighted, which is either equal to the above, or the cluster group that it belongs to */
        actualHighlight: leaflet.Marker = null;
        /** The marker used to denote a routing source if any */
        routingSource: leaflet.Marker = null;
        // TODO document
        realTimeLocationMarker: leaflet.Marker = null;
        realTimeLocationRadius: leaflet.Circle = null;
    })();
    public ongoingChanges = 0;
    public freezeMap: boolean = false;
    private plugin: MapViewPlugin;
    /** The default state as saved in the plugin settings, or something else that the view sets */
    public defaultState: MapState;
    public lastRealTimeLocation: RealTimeLocation = null;
    /**
     * The Workspace Leaf that a note was last opened in when a new pane was created.
     * This is saved so the same leaf can be reused when opening subsequent notes, making the flow consistent & predictable for the user.
     */
    private lastPaneLeaf: WorkspaceLeaf;
    /**
     * Same as above, but saved separately for when a new tab was created.
     */
    private lastTabLeaf: WorkspaceLeaf;
    /** Is the view currently open */
    private isOpen: boolean = false;
    /** On an embedded map view, this is set by the parent view object so the relevant button can call it. */
    public updateCodeBlockCallback: () => Promise<void>;
    /** On an embedded map view, this is set by the parent view object so the relevant button can call it. */
    public updateCodeBlockFromMapViewCallback: () => Promise<void>;

    /**
     * Construct a new map instance
     * @param settings The plugin settings
     * @param viewSettings The settings for what to display in this view
     * @param plugin The plugin instance
     */
    constructor(
        parentEl: HTMLElement,
        settings: PluginSettings,
        viewSettings: ViewSettings,
        plugin: MapViewPlugin,
        app: App
    ) {
        this.settings = settings;
        this.viewSettings = viewSettings;
        this.plugin = plugin;
        this.app = app;
        // Create the default state by the configuration
        this.defaultState = this.settings.defaultState;
        this.parentEl = parentEl;

        // Listen to file changes so we can update markers accordingly
        this.app.vault.on('delete', (file) =>
            this.updateMarkersWithRelationToFile(file.path, null, true)
        );
        this.app.metadataCache.on('changed', (file) =>
            this.updateMarkersWithRelationToFile(file.path, file, false)
        );
        // On rename we don't need to do anything because the markers hold a TFile, and the TFile object doesn't change
        // when the file name changes. Only its internal path field changes accordingly.
        // this.app.vault.on('rename', (file, oldPath) => this.updateMarkersWithRelationToFile(oldPath, file, true));
        this.app.workspace.on('css-change', () => {
            console.log('Map view: map refresh due to CSS change');
            this.refreshMap();
        });
    }

    getState(): MapState {
        return this.state;
    }

    copyStateUrl() {
        const params = stateToUrl(this.state);
        const url = `obsidian://mapview?do=open&${params}`;
        navigator.clipboard.writeText(url);
        new Notice('Copied state URL to clipboard');
    }

    copyCodeBlock() {
        const block = getCodeBlock(this.state);
        navigator.clipboard.writeText(block);
        new Notice(
            'Copied state as code block which you can embed in any note'
        );
    }

    getMarkers() {
        return this.display.markers;
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
        this.isOpen = true;
        this.state = structuredClone(this.defaultState);
        this.display.viewDiv = this.parentEl.createDiv('map-view-main');
        if (this.viewSettings.showMapControls) {
            this.display.controls = new ViewControls(
                this.display.viewDiv,
                this.settings,
                this.viewSettings,
                this.app,
                this,
                this.plugin
            );
            this.display.controls.createControls();
        }
        this.parentEl.style.padding = '0px 0px';
        this.display.mapDiv = this.display.viewDiv.createDiv(
            { cls: 'map' },
            (el: HTMLDivElement) => {
                el.style.zIndex = '1';
                el.style.width = '100%';
                el.style.height = '100%';
            }
        );
        // Make touch move nicer on mobile
        this.display.viewDiv.addEventListener('touchmove', (ev) => {
            ev.stopPropagation();
        });
        await this.createMap();
    }

    onClose() {
        this.isOpen = false;
    }

    /**
     * This internal method of setting the state will NOT register the change to the Obsidian
     * history stack. If you want that, use `this.leaf.setViewState(state)` instead.
     */
    public async internalSetViewState(
        state: MapState,
        updateControls: boolean = false,
        considerAutoFit: boolean = false,
        freezeMap: boolean = false
    ) {
        if (state) {
            const newState = mergeStates(this.state, state);
            this.updateTileLayerByState(newState);
            // This is delicate stuff and I've been working tediously to get to the best version of it.
            // We are doing our best to prevent updating the map while it is being interacted with, but
            // we cannot prevent this completely because there are async scenarios that can still unfreeze
            // the map during ongoing changes (especially in fast zooms and pans).
            // There are therefore multiple layers of safeguards here, i.e. both the freezeMap boolean,
            // the ongoingChanges counter, and inside updateMarkersToState there are additional safeguards
            if (!freezeMap && this.ongoingChanges == 0) {
                const willAutoFit =
                    state.autoFit || // State auto-fit
                    (considerAutoFit && // Global auto-fit
                        (this.settings.autoZoom || this.viewSettings.autoZoom));
                await this.updateMarkersToState(newState, false, willAutoFit);
                if (willAutoFit) await this.autoFitMapToMarkers();
                this.applyLock();
            }
            if (updateControls && this.display.controls) {
                this.display.controls.updateControlsToState();
            }
            if (this.display.lockControl)
                this.display.lockControl.updateFromState(state.lock);
        }
    }

    /**
     * Change the view state according to a given partial state.
     * In this class it just merges the states and calls internalSetViewState, but *this method gets overridden
     * by BaseMapView, which adds to it an update to the Obsidian state for tracking history.
     * This is deliberately *not* an async method, because in the version that calls the Obsidian setState method,
     * we want to reliably get the status of freezeMap
     */
    public highLevelSetViewState(partialState: Partial<MapState>): MapState {
        if (Object.keys(partialState).length === 0) return;
        const state = this.getState();
        if (state) {
            const newState = mergeStates(state, partialState);
            this.internalSetViewState(newState);
            return newState;
        }
        return null;
    }

    /**
     * Same as above, but an async version, that can be awaited, for cases that an updated map is required
     * after the method returns.
     */
    public async highLevelSetViewStateAsync(
        partialState: Partial<MapState>
    ): Promise<MapState> {
        if (Object.keys(partialState).length === 0) return;
        const state = this.getState();
        if (state) {
            const newState = mergeStates(state, partialState);
            await this.internalSetViewState(newState, false);
            return newState;
        }
        return null;
    }

    /**
     * This method saves in the state object a change that was already done in the map (e.g. by a user interaction
     * with Leaflet).
     * This is tricky: on one hand we want to sometimes save the state to the Obsidian history (thus
     * the version of highLevelSetViewState set in BaseMapView calls setState), however we don't
     * want setState to think it needs to update the map...
     * For this purpose, this part of the flow is synchronuous.
     */
    public updateStateAfterMapChange(partialState: Partial<MapState>) {
        this.state = mergeStates(this.state, partialState);
        this.freezeMap = true;
        this.highLevelSetViewState(partialState);
        if (this.ongoingChanges <= 0) {
            this.freezeMap = false;
            this.ongoingChanges = 0;
        }
    }

    public getMapSource(): TileSource {
        return this.settings.mapSources[this.state.chosenMapSource];
    }

    updateTileLayerByState(newState: MapState) {
        if (
            this.display.tileLayer &&
            this.state.chosenMapSource != newState.chosenMapSource
        ) {
            this.display.tileLayer.remove();
            this.display.tileLayer = null;
        }
        this.state.chosenMapSource = newState.chosenMapSource;
        if (!this.display.tileLayer) {
            const isDark = this.isDarkMode(this.settings);
            const chosenMapSource = this.getMapSource();
            const attribution =
                chosenMapSource.urlLight ===
                DEFAULT_SETTINGS.mapSources[0].urlLight
                    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    : '';
            let revertMap = false;
            let mapSourceUrl = chosenMapSource.urlLight;
            if (isDark) {
                if (chosenMapSource.urlDark)
                    mapSourceUrl = chosenMapSource.urlDark;
                else revertMap = true;
            }
            const neededClassName = revertMap ? 'dark-mode' : '';
            const maxNativeZoom =
                chosenMapSource.maxZoom ?? consts.DEFAULT_MAX_TILE_ZOOM;
            this.display.tileLayer = new leaflet.TileLayer(mapSourceUrl, {
                maxZoom: this.settings.letZoomBeyondMax
                    ? consts.MAX_ZOOM
                    : maxNativeZoom,
                maxNativeZoom: maxNativeZoom,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                attribution: attribution,
                className: neededClassName,
            });
            this.display.map.addLayer(this.display.tileLayer);

            if (!chosenMapSource?.ignoreErrors) {
                let recentTileError = false;
                this.display.tileLayer.on(
                    'tileerror',
                    (event: leaflet.TileErrorEvent) => {
                        if (!recentTileError) {
                            new Notice(
                                `Map view: unable to load map tiles. If your Internet access is ok, try switching the map source using the View controls.`,
                                20000
                            );
                            recentTileError = true;
                            setTimeout(() => {
                                recentTileError = false;
                            }, 5000);
                        }
                    }
                );
            }
        }
    }

    async refreshMap() {
        this.display?.tileLayer?.remove();
        this.display.tileLayer = null;
        this.display?.map?.off();
        this.display?.map?.remove();
        this.display?.markers?.clear();
        this.display?.controls?.controlsDiv?.remove();
        this.display?.controls?.reload();
        await this.createMap();
        this.updateMarkersToState(this.state, true);
        this.display?.controls?.updateControlsToState();
    }

    async createMap() {
        // Obsidian Leaflet compatability: disable tree-shaking for the full-screen module
        var dummy = leafletFullscreen;
        this.display.map = new leaflet.Map(this.display.mapDiv, {
            center: this.defaultState.mapCenter,
            zoom: this.defaultState.mapZoom,
            zoomControl: false,
            worldCopyJump: true,
            maxBoundsViscosity: 1.0,
        });

        if (this.viewSettings.showLockButton) {
            this.display.lockControl = new LockControl(
                { position: 'topright' },
                this,
                this.app,
                this.settings
            );
            this.display.map.addControl(this.display.lockControl);
        }

        this.addZoomButtons();
        this.updateTileLayerByState(this.state);
        this.display.clusterGroup = new leaflet.MarkerClusterGroup({
            maxClusterRadius:
                this.settings.maxClusterRadiusPixels ??
                DEFAULT_SETTINGS.maxClusterRadiusPixels,
            animate: false,
            chunkedLoading: true,
        });
        this.display.map.addLayer(this.display.clusterGroup);

        this.display.map.on('zoomend', async (event: leaflet.LeafletEvent) => {
            this.ongoingChanges -= 1;
            this.updateStateAfterMapChange({
                mapZoom: this.display.map.getZoom(),
                mapCenter: this.display.map.getCenter(),
            });
            this.display?.controls?.invalidateActivePreset();
            this.display?.controls?.updateSaveButtonVisibility();
            this.setHighlight(this.display.highlight);
            this.updateRealTimeLocationMarkers();
        });
        this.display.map.on('moveend', async (event: leaflet.LeafletEvent) => {
            this.ongoingChanges -= 1;
            this.updateStateAfterMapChange({
                mapZoom: this.display.map.getZoom(),
                mapCenter: this.display.map.getCenter(),
            });
            this.display?.controls?.invalidateActivePreset();
            this.display?.controls?.updateSaveButtonVisibility();
            this.setHighlight(this.display.highlight);
            this.updateRealTimeLocationMarkers();
        });
        this.display.map.on('movestart', (event: leaflet.LeafletEvent) => {
            this.ongoingChanges += 1;
        });
        this.display.map.on('zoomstart', (event: leaflet.LeafletEvent) => {
            this.ongoingChanges += 1;
        });
        this.display.map.on(
            'doubleClickZoom',
            (event: leaflet.LeafletEvent) => {
                this.ongoingChanges += 1;
            }
        );
        this.display.map.on('viewreset', () => {
            this.setHighlight(this.display.highlight);
            this.updateRealTimeLocationMarkers();
        });

        if (this.viewSettings.showSearch) {
            this.display.searchControls = new SearchControl(
                { position: 'topright' },
                this,
                this.app,
                this.plugin,
                this.settings
            );
            this.display.map.addControl(this.display.searchControls);
        }

        if (
            this.viewSettings.showRealTimeButton &&
            this.settings.supportRealTimeGeolocation
        ) {
            this.display.realTimeControls = new RealTimeControl(
                { position: 'topright' },
                this,
                this.app,
                this.settings
            );
            this.display.map.addControl(this.display.realTimeControls);
        }

        if (this.settings.showClusterPreview) {
            this.display.clusterGroup.on('clustermouseover', (event) => {
                if (!utils.isMobile(this.app))
                    this.openClusterPreviewPopup(event);
            });
            this.display.clusterGroup.on('clustercontextmenu', (event) => {
                if (utils.isMobile(this.app))
                    this.openClusterPreviewPopup(event);
            });
            this.display.clusterGroup.on('clustermouseout', (event) => {
                event.propagatedFrom.closePopup();
            });
            this.display.clusterGroup.on('clusterclick', () => {
                this.setHighlight(this.display.highlight);
                this.updateRealTimeLocationMarkers();
            });
        }

        this.display.map.on('click', (event: leaflet.LeafletMouseEvent) => {
            this.setHighlight(null);
        });

        // Build the map marker right-click context menu
        this.display.map.on(
            'contextmenu',
            async (event: leaflet.LeafletMouseEvent) => {
                let mapPopup = new Menu();
                menus.addNewNoteItems(
                    mapPopup,
                    event.latlng,
                    this,
                    this.settings,
                    this.app
                );
                menus.addCopyGeolocationItems(mapPopup, event.latlng);
                menus.populateRouting(
                    this,
                    event.latlng,
                    mapPopup,
                    this.settings
                );
                menus.addOpenWith(mapPopup, event.latlng, this.settings);
                mapPopup.showAtPosition(event.originalEvent);
            }
        );
    }

    /**
     * Set the map state
     * @param state The map state to set
     * @param force Force setting the state. Will ignore if the state is old
     * @param freezeMap Do not update the map, because we know it will need another update after this one
     */
    async updateMarkersToState(
        state: MapState,
        force: boolean = false,
        freezeMap: boolean = false
    ) {
        if (this.settings.debug) console.time('updateMarkersToState');
        let files = this.app.vault.getMarkdownFiles();
        // Build the markers and filter them according to the query
        let newMarkers = await buildMarkers(files, this.settings, this.app);
        try {
            newMarkers = this.filterMarkers(newMarkers, state.query);
            state.queryError = false;
        } catch (e) {
            newMarkers = [];
            state.queryError = true;
        }
        finalizeMarkers(newMarkers, this.settings, this.plugin.iconCache);
        this.state = structuredClone(state);
        this.updateMapMarkers(newMarkers);
        // There are multiple layers of safeguards here, in an attempt to minimize the cases where a series
        // of interactions and async updates compete over the map.
        // See the comment in internalSetViewState to get more context
        if (
            !freezeMap &&
            !this.freezeMap &&
            this.ongoingChanges == 0 &&
            (this.display.map.getCenter().distanceTo(this.state.mapCenter) >
                1 ||
                this.display.map.getZoom() != this.state.mapZoom)
        ) {
            // We want to call setView only if there was an actual change, because even the tiniest (epsilon) change can
            // cause Leaflet to think it's worth triggering map center change callbacks.
            // Also, in the case that we know the view is about to be changed immediately (e.g. due to a fitBounds call
            // that would follow this method), we want to skip the change too
            this.display.map.setView(this.state.mapCenter, this.state.mapZoom, {
                animate: this.viewSettings.skipAnimations ? false : true,
                duration: 0.1,
            });
        }
        if (this.display?.controls)
            this.display.controls.setQueryBoxErrorByState();
        if (this.settings.debug) console.timeEnd('updateMarkersToState');
    }

    filterMarkers(allMarkers: BaseGeoLayer[], queryString: string) {
        let results: BaseGeoLayer[] = [];
        const query = new Query(this.app, queryString);
        for (const marker of allMarkers)
            if (query.testMarker(marker)) results.push(marker);
        return results;
    }

    /**
     * Update the actual Leaflet markers of the map according to a new list of logical markers.
     * Unchanged markers are not touched, new markers are created and old markers that are not in the updated list are removed.
     * @param newMarkers The new array of FileMarkers
     */
    updateMapMarkers(newMarkers: BaseGeoLayer[]) {
        let newMarkersMap: MarkersMap = new Map();
        let markersToAdd: leaflet.Layer[] = [];
        let markersToRemove: leaflet.Layer[] = [];
        for (let marker of newMarkers) {
            const existingMarker = this.display.markers.has(marker.id)
                ? this.display.markers.get(marker.id)
                : null;
            if (existingMarker && existingMarker.isSame(marker)) {
                // This marker exists, so just keep it
                newMarkersMap.set(
                    marker.id,
                    this.display.markers.get(marker.id)
                );
                this.display.markers.delete(marker.id);
            } else if (marker instanceof FileMarker) {
                // New marker - create it
                marker.geoLayer = this.newLeafletMarker(marker);
                markersToAdd.push(marker.geoLayer);
                if (newMarkersMap.get(marker.id))
                    console.log(
                        'Map view: warning, marker ID',
                        marker.id,
                        'already exists, please open an issue if you see this.'
                    );
                newMarkersMap.set(marker.id, marker);
            }
        }
        for (let [key, value] of this.display.markers) {
            markersToRemove.push(value.geoLayer);
        }
        this.display.clusterGroup.removeLayers(markersToRemove);
        this.display.clusterGroup.addLayers(markersToAdd);
        this.display.markers = newMarkersMap;
    }

    private newLeafletMarker(marker: FileMarker): leaflet.Marker {
        let newMarker = leaflet.marker(marker.location, {
            icon: marker.icon || new leaflet.Icon.Default(),
        });
        newMarker.on('click', (event: leaflet.LeafletMouseEvent) => {
            if (utils.isMobile(this.app))
                this.showMarkerPopups(marker, newMarker);
            else
                this.goToMarker(
                    marker,
                    utils.mouseEventToOpenMode(
                        this.settings,
                        event.originalEvent,
                        'openNote'
                    ),
                    true
                );
        });
        newMarker.on('mousedown', (event: leaflet.LeafletMouseEvent) => {
            // Middle click is supported only on mousedown and not on click, so we're checking for it here
            if (event.originalEvent.button === 1)
                this.goToMarker(
                    marker,
                    utils.mouseEventToOpenMode(
                        this.settings,
                        event.originalEvent,
                        'openNote'
                    ),
                    true
                );
        });
        newMarker.on('mouseover', (event: leaflet.LeafletMouseEvent) => {
            if (!utils.isMobile(this.app))
                this.showMarkerPopups(marker, newMarker);
        });
        newMarker.on('mouseout', (event: leaflet.LeafletMouseEvent) => {
            if (!utils.isMobile(this.app)) newMarker.closePopup();
        });
        newMarker.on('add', (event: leaflet.LeafletEvent) => {
            newMarker
                .getElement()
                .addEventListener('contextmenu', (ev: MouseEvent) => {
                    this.openMarkerContextMenu(marker, newMarker, ev);
                    ev.stopPropagation();
                });
        });
        return newMarker;
    }

    private openMarkerContextMenu(
        marker: BaseGeoLayer,
        mapMarker: leaflet.Marker,
        ev: MouseEvent
    ) {
        this.setHighlight(mapMarker);
        let mapPopup = new Menu();
        if (marker instanceof FileMarker) {
            menus.populateOpenNote(this, marker, mapPopup, this.settings);
            menus.populateRouting(
                this,
                marker.location,
                mapPopup,
                this.settings
            );
            menus.populateOpenInItems(mapPopup, marker.location, this.settings);
        }
        if (ev) mapPopup.showAtPosition(ev);
    }

    private showMarkerPopups(
        fileMarker: FileMarker,
        mapMarker: leaflet.Marker
    ) {
        if (this.settings.showNotePreview) {
            const previewDetails = {
                scroll: fileMarker.fileLine,
                line: fileMarker.fileLine,
                startLoc: {
                    line: fileMarker.fileLine,
                    col: 0,
                    offset: fileMarker.fileLocation,
                } as Loc,
                endLoc: {
                    line: fileMarker.fileLine,
                    col: 0,
                    offset: fileMarker.fileLocation,
                } as Loc,
            };
            this.app.workspace.trigger(
                'link-hover',
                mapMarker.getElement(),
                mapMarker.getElement(),
                fileMarker.file.path,
                '',
                previewDetails
            );
        }
        if (this.settings.showNoteNamePopup) {
            const fileName = fileMarker.file.name;
            const fileNameWithoutExtension = fileName.endsWith('.md')
                ? fileName.substring(0, fileName.lastIndexOf('.md'))
                : fileName;
            let content = `<p class="map-view-marker-name">${fileNameWithoutExtension}</p>`;
            const showLinkSetting = this.settings.showLinkNameInPopup;
            if (
                (showLinkSetting === 'always' ||
                    (showLinkSetting === 'mobileOnly' &&
                        utils.isMobile(this.app))) &&
                fileMarker.extraName &&
                fileMarker.extraName.length > 0
            )
                content += `<p class="map-view-marker-sub-name">${fileMarker.extraName}</p>`;
            mapMarker
                .bindPopup(content, {
                    closeButton: true,
                    autoPan: false,
                    className: 'marker-popup',
                })
                .on('popupopen', (event: leaflet.PopupEvent) => {
                    event.popup.getElement()?.onClickEvent((ev: MouseEvent) => {
                        this.goToMarker(
                            fileMarker,
                            utils.mouseEventToOpenMode(
                                this.settings,
                                ev,
                                'openNote'
                            ),
                            true
                        );
                    });
                })
                .openPopup()
                .on('popupclose', (event: leaflet.LeafletEvent) => {
                    // For some reason popups don't recycle on mobile if this is not added
                    mapMarker.unbindPopup();
                });
        }
    }

    private openClusterPreviewPopup(event: leaflet.LeafletEvent) {
        let content = this.display.viewDiv.createDiv();
        content.classList.add('clusterPreviewContainer');
        for (const m of event.propagatedFrom.getAllChildMarkers()) {
            const marker = m as leaflet.Marker;
            const iconElement = marker.options.icon.createIcon();
            iconElement.classList.add('clusterPreviewIcon');
            content.appendChild(iconElement);
            if (content.children.length >= consts.MAX_CLUSTER_PREVIEW_ICONS)
                break;
        }
        event.propagatedFrom
            .bindPopup(content, {
                closeButton: true,
                autoPan: false,
                className: 'marker-popup',
            })
            .openPopup();
        event.propagatedFrom.activePopup = content;
    }

    /** Zoom the map to fit all markers on the screen */
    public async autoFitMapToMarkers() {
        if (this.display.markers.size > 0) {
            const locations: leaflet.LatLng[] = [];
            for (const marker of this.display.markers.values()) {
                locations.push(...marker.getBounds());
            }
            this.display.map.fitBounds(leaflet.latLngBounds(locations), {
                maxZoom: Math.min(
                    this.settings.zoomOnGoFromNote,
                    this.getMapSource().maxZoom ?? consts.DEFAULT_MAX_TILE_ZOOM
                ),
            });
        } else if (this.viewSettings.emptyFitRevertsToDefault) {
            this.display.map.setView(
                this.defaultState.mapCenter,
                this.defaultState.mapZoom
            );
        }
    }

    /**
     * Open a file in an editor window
     * @param file The file object to open
     * @param openBehavior the required type of action
     * @param editorAction Optional callback to run when the file is opened
     */
    async goToFile(
        file: TFile,
        openBehavior: OpenBehavior,
        editorAction?: (editor: Editor) => Promise<void>
    ) {
        // Find the best candidate for a leaf to open the note according to the required behavior.
        // This is similar to MainViewPlugin.openMap and should be in sync with that code.
        let chosenLeaf: WorkspaceLeaf = null;
        const paneToReuse: WorkspaceLeaf =
            this.lastPaneLeaf && (this.lastPaneLeaf as any).parent
                ? this.lastPaneLeaf
                : null;
        const tabToReuse: WorkspaceLeaf =
            this.lastTabLeaf && (this.lastTabLeaf as any).parent
                ? this.lastTabLeaf
                : null;
        const otherExistingLeaf = this.app.workspace.getLeaf(false);
        const emptyLeaf = this.app.workspace.getLeavesOfType('empty');
        let createPane = false;
        let createTab = false;
        switch (openBehavior) {
            case 'replaceCurrent':
                chosenLeaf = otherExistingLeaf;
                if (!chosenLeaf && emptyLeaf) chosenLeaf = emptyLeaf[0];
                break;
            case 'dedicatedPane':
                chosenLeaf = paneToReuse;
                if (!chosenLeaf) createPane = true;
                break;
            case 'dedicatedTab':
                chosenLeaf = tabToReuse;
                if (!chosenLeaf) createTab = true;
                break;
            case 'alwaysNewPane':
                createPane = true;
                break;
            case 'alwaysNewTab':
                createTab = true;
                break;
            case 'lastUsed':
                chosenLeaf = utils.getLastUsedValidMarkdownLeaf();
                if (!chosenLeaf) createPane = true;
        }
        if (createTab) {
            chosenLeaf = this.app.workspace.getLeaf('tab');
            this.lastTabLeaf = chosenLeaf;
        }
        if (createPane) {
            chosenLeaf = this.app.workspace.getLeaf(
                'split',
                this.settings.newPaneSplitDirection
            );
            this.lastPaneLeaf = chosenLeaf;
        }
        if (!chosenLeaf) {
            chosenLeaf = this.app.workspace.getLeaf(true);
        }
        await chosenLeaf.openFile(file);
        const editor = await utils.getEditor(this.app, chosenLeaf);
        if (editor && editorAction) await editorAction(editor);
    }

    /**
     * Open and go to the editor location represented by the marker
     * @param marker The FileMarker to open
     * @param openBehavior the required type of action
     * @param highlight If true will highlight the line
     */
    async goToMarker(
        marker: FileMarker,
        openBehavior: OpenBehavior,
        highlight: boolean
    ) {
        return this.goToFile(marker.file, openBehavior, async (editor) => {
            await utils.goToEditorLocation(
                editor,
                marker.fileLocation,
                highlight
            );
        });
    }

    /**
     * Update the map markers with a list of markers not from the removed file plus the markers from the new file.
     * Run when a file is deleted, renamed or changed.
     * @param fileRemoved The old file path
     * @param fileAddedOrChanged The new file data
     */
    private async updateMarkersWithRelationToFile(
        fileRemoved: string,
        fileAddedOrChanged: TAbstractFile,
        skipMetadata: boolean
    ) {
        if (!this.display.map || !this.isOpen)
            // If the map has not been set up yet then do nothing
            return;
        let newMarkers: BaseGeoLayer[] = [];
        // Create an array of all file markers not in the removed file
        for (let [_markerId, existingMarker] of this.display.markers) {
            if (existingMarker.file.path !== fileRemoved)
                newMarkers.push(existingMarker);
        }
        if (fileAddedOrChanged && fileAddedOrChanged instanceof TFile)
            // Add file markers from the added file
            await buildAndAppendFileMarkers(
                newMarkers,
                fileAddedOrChanged,
                this.settings,
                this.app
            );
        finalizeMarkers(newMarkers, this.settings, this.plugin.iconCache);
        this.updateMapMarkers(newMarkers);
    }

    addSearchResultMarker(details: GeoSearchResult, keepZoom: boolean) {
        this.display.searchResult = leaflet.marker(details.location, {
            icon: getIconFromOptions(
                consts.SEARCH_RESULT_MARKER,
                this.plugin.iconCache
            ),
        });
        const marker = this.display.searchResult;
        marker.on('mouseover', (event: leaflet.LeafletMouseEvent) => {
            marker
                .bindPopup(details.name, {
                    closeButton: true,
                    className: 'marker-popup',
                })
                .openPopup();
        });
        marker.on('mouseout', (event: leaflet.LeafletMouseEvent) => {
            marker.closePopup();
        });
        marker.addTo(this.display.map);
        this.goToSearchResult(details.location, marker, keepZoom);
    }

    goToSearchResult(
        location: leaflet.LatLng,
        marker: FileMarker | leaflet.Marker,
        keepZoom: boolean = false
    ) {
        this.setHighlight(marker);
        let newState: Partial<MapState> = {};
        if (!keepZoom) {
            newState = {
                mapCenter: location,
                mapZoom: this.settings.zoomOnGoFromNote,
            };
        } else {
            // If the user asked to go to the search result while keeping the current zoom, we indeed
            // don't the zoom.
            // We try to also not touch the pan, and pan to it only if the wanted location is outside the
            // displayed map area.
            if (!this.display.map.getBounds().contains(location))
                newState.mapCenter = location;
        }
        this.highLevelSetViewState(newState);
    }

    removeSearchResultMarker() {
        if (this.display.searchResult) {
            this.display.searchResult.removeFrom(this.display.map);
            this.display.searchResult = null;
        }
    }

    openSearch() {
        if (this.display.searchControls)
            this.display.searchControls.openSearch(this.display.markers);
    }

    setHighlight(mapOrFileMarker: leaflet.Layer | BaseGeoLayer) {
        // The Marker object that should be highlighted
        let highlight: leaflet.Layer = mapOrFileMarker
            ? mapOrFileMarker instanceof leaflet.Layer
                ? mapOrFileMarker
                : mapOrFileMarker.geoLayer
            : null;
        // In case the marker is hidden in a cluster group, we actually want the cluster group
        // to be the highlighted item
        let actualHighlight: leaflet.Marker = null;
        if (highlight) {
            if (highlight instanceof leaflet.Marker) {
                const parent =
                    this.display.clusterGroup.getVisibleParent(highlight);
                actualHighlight = parent || actualHighlight;
            }
        }
        if (
            this.display.actualHighlight &&
            this.display.actualHighlight != actualHighlight
        ) {
            const existingElement = this.display.actualHighlight.getElement();
            if (existingElement)
                existingElement.removeClass(consts.HIGHLIGHT_CLASS_NAME);
        }
        if (actualHighlight) {
            // If the marker is currently part of a cluster, make the cluster the actual highlight.
            // The parent can be either the marker itself or its cluster
            const newElement = actualHighlight.getElement();
            if (newElement) {
                newElement.addClass(consts.HIGHLIGHT_CLASS_NAME);
            }
            // Update even if there is no HTML element yet
        }
        this.display.highlight = highlight;
        this.display.actualHighlight = actualHighlight;
    }

    /** Try to find the marker that corresponds to a specific file (front matter) or a line in the file (inline) */
    findMarkerByFileLine(
        file: TAbstractFile,
        fileLine: number | null = null
    ): BaseGeoLayer | null {
        for (let [_, fileMarker] of this.display.markers) {
            if (fileMarker.file == file) {
                if (!fileLine) return fileMarker;
                if (fileLine == fileMarker.fileLine) return fileMarker;
            }
        }
        return null;
    }

    findMarkerById(markerId: string): BaseGeoLayer | undefined {
        return this.display.markers.get(markerId);
    }

    updateRealTimeLocationMarkers() {
        if (this.display.realTimeLocationMarker)
            this.display.realTimeLocationMarker.removeFrom(this.display.map);
        if (this.display.realTimeLocationRadius)
            this.display.realTimeLocationRadius.removeFrom(this.display.map);
        if (this.lastRealTimeLocation === null) return;
        const center = this.lastRealTimeLocation.center;
        const accuracy = this.lastRealTimeLocation.accuracy;
        this.display.realTimeLocationMarker = leaflet
            .marker(center, {
                icon: getIconFromOptions(
                    consts.CURRENT_LOCATION_MARKER,
                    this.plugin.iconCache
                ),
            })
            .addTo(this.display.map);
        this.display.realTimeLocationRadius = leaflet
            .circle(center, { radius: accuracy })
            .addTo(this.display.map);
        this.display.realTimeControls.onLocationFound();
    }

    setRealTimeLocation(
        center: leaflet.LatLng,
        accuracy: number,
        source: RealTimeLocationSource,
        forceRefresh: boolean = false
    ) {
        const location =
            center === null
                ? null
                : {
                      center: center,
                      accuracy: accuracy,
                      source: source,
                      timestamp: Date.now(),
                  };
        console.log(`New location received from source '${source}':`, location);
        if (!isSame(location, this.lastRealTimeLocation) || forceRefresh) {
            this.lastRealTimeLocation = location;
            this.updateRealTimeLocationMarkers();
            if (location) {
                // If there's a real location (contrary to clearing an existing location), update the view
                let newState: Partial<MapState> = {};
                if (this.state.mapZoom < this.settings.zoomOnGoFromNote)
                    newState.mapZoom = this.settings.zoomOnGoFromNote;
                // If the new zoom is higher than the current zoom, OR the new center isn't already visible, change
                // the map center.
                // Or maybe easier to understand it this way: if the new center is already visible in the viewport, AND
                // the new zoom is lower (meaning it will remain visible), we don't need to bother the user with a center change
                if (
                    newState.mapZoom != this.state.mapZoom ||
                    !this.display.map.getBounds().contains(location.center)
                )
                    newState.mapCenter = location.center;
                this.highLevelSetViewState(newState);
            }
        }
    }

    setRoutingSource(location: leaflet.LatLng) {
        if (this.display.routingSource) {
            this.display.routingSource.removeFrom(this.display.map);
            this.display.routingSource = null;
        }
        if (location) {
            this.display.routingSource = leaflet
                .marker(location, {
                    icon: getIconFromOptions(
                        consts.ROUTING_SOURCE_MARKER,
                        this.plugin.iconCache
                    ),
                })
                .addTo(this.display.map);
            this.display.routingSource.on(
                'contextmenu',
                (ev: leaflet.LeafletMouseEvent) => {
                    let routingSourcePopup = new Menu();
                    routingSourcePopup.addItem((item: MenuItem) => {
                        item.setTitle('Remove');
                        item.setIcon('trash');
                        item.onClick(() => {
                            this.setRoutingSource(null);
                        });
                    });
                    routingSourcePopup.showAtPosition(ev.originalEvent);
                }
            );
        }
    }

    setLock(lock: boolean) {
        this.state.lock = lock;
        this.applyLock();
        this.display?.controls?.updateSaveButtonVisibility();
    }

    addZoomButtons() {
        if (this.viewSettings.showZoomButtons && !this.state.lock) {
            this.display.zoomControls = leaflet.control
                .zoom({
                    position: 'topright',
                })
                .addTo(this.display.map);
        }
    }

    applyLock() {
        // If the view does not support locking, refuse to lock.
        // This is important if the MapState is taken from another view, e.g. Open is clicked in a locked embedded map
        // to open it in a full Map View, which cannot be locked.
        if (this.state.lock && !this.viewSettings.showLockButton) {
            this.setLock(false);
            return;
        }
        if (this.state.lock) {
            this.display.map.dragging.disable();
            this.display.map.touchZoom.disable();
            this.display.map.doubleClickZoom.disable();
            this.display.map.scrollWheelZoom.disable();
            this.display.map.boxZoom.disable();
            this.display.map.keyboard.disable();
            if (this.display.map.tap) this.display.map.tap.disable();
            if (this.display.zoomControls) {
                this.display.zoomControls.remove();
                this.display.zoomControls = null;
            }
        } else {
            this.display.map.dragging.enable();
            this.display.map.touchZoom.enable();
            this.display.map.doubleClickZoom.enable();
            this.display.map.scrollWheelZoom.enable();
            this.display.map.boxZoom.enable();
            this.display.map.keyboard.enable();
            if (this.display.map.tap) this.display.map.tap.disable();
            if (!this.display.zoomControls) this.addZoomButtons();
        }
    }
}
