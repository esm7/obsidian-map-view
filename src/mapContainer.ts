import {
    App,
    TAbstractFile,
    Editor,
    Menu,
    TFile,
    WorkspaceLeaf,
    Notice,
    MenuItem,
    type Loc,
} from 'obsidian';
import * as leaflet from 'leaflet';
// Ugly hack for obsidian-leaflet compatability, see https://github.com/esm7/obsidian-map-view/issues/6
// @ts-ignore
import * as leafletFullscreen from 'leaflet-fullscreen';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

import 'leaflet/dist/leaflet.css';
import 'leaflet-geosearch/dist/geosearch.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import {
    type TileLayerOffline,
    tileLayerOffline,
    hasTile,
} from 'leaflet.offline';
import { mount, unmount } from 'svelte';
import * as consts from 'src/consts';
import {
    type MapState,
    mergeStates,
    stateToUrl,
    getCodeBlock,
    areStatesEqual,
} from 'src/mapState';
import {
    type OpenBehavior,
    type PluginSettings,
    type TileSource,
    DEFAULT_SETTINGS,
} from 'src/settings';
import {
    FileMarker,
    addEdgesToMarkers,
    moveFileMarker,
    createMarkerInFile,
} from 'src/fileMarker';
import { FloatingMarker } from 'src/floatingMarker';
import {
    GeoJsonLayer,
    createGeoJsonInFile,
    editGeoJson,
} from 'src/geojsonLayer';
import { BaseGeoLayer } from 'src/baseGeoLayer';
import { LayerCache } from 'src/layerCache';
import { getIconFromOptions, type IconOptions } from 'src/markerIcons';
import MapViewPlugin from 'src/main';
import * as utils from 'src/utils';
import {
    ViewControls,
    SearchControl,
    RealTimeControl,
    LockControl,
    EditControl,
} from 'src/viewControls';
import { Query } from 'src/query';
import { GeoSearchResult } from 'src/geosearch';
import {
    type RealTimeLocation,
    type RealTimeLocationSource,
    isSame,
} from 'src/realTimeLocation';
import * as menus from 'src/menus';
import { createPopper, type Instance as PopperInstance } from '@popperjs/core';
import * as offlineTiles from 'src/offlineTiles.svelte';
import MarkerPopup from './components/MarkerPopup.svelte';
import { type RoutingResult } from 'src/routing';

export type ViewSettings = {
    showMinimizeButton: boolean;
    showZoomButtons: boolean;
    showMapControls: boolean;
    showFilters: boolean;
    showView: boolean;
    showLinks: boolean;
    viewTabType: 'regular' | 'mini';
    showEmbeddedControls: boolean;
    showPresets: boolean;
    showEdit: boolean;
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
        /** The element holding map marker popups */
        popupDiv: HTMLDivElement;
        popperInstance: PopperInstance;
        popupElement: leaflet.Marker;
        popupElementUnmount: () => void;
        popupClickEventListener: (ev: MouseEvent) => void;
        /** The leaflet map instance */
        map: leaflet.Map;
        tileLayer: TileLayerOffline;
        /** The cluster management class */
        clusterGroup: leaflet.MarkerClusterGroup;
        /** The markers currently on the map */
        // TODO change name
        markers: LayerCache = new LayerCache();
        /** The polylines currently on the map */
        polylines: leaflet.Polyline[] = [];
        /** The view controls */
        controls: ViewControls;
        /** The zoom controls */
        zoomControls: leaflet.Control.Zoom;
        /** The search controls (search & clear buttons) */
        searchControls: SearchControl = null;
        /** The real-time geolocation controls */
        realTimeControls: RealTimeControl = null;
        /** The pencil button for showing edit controls */
        editControl: EditControl = null;
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
        /** The routes added to the map */
        calculatedRoutes: leaflet.GeoJSON[] = [];
        realTimeLocationMarker: leaflet.Marker = null;
        realTimeLocationRadius: leaflet.Circle = null;
        /** Part of an ugly mechanism that's required to cache loaded tiles */
        offlineHelperCanvas: HTMLCanvasElement = null;
    })();
    /*
     * An array of one-time actions to be done in the next time the map is updated and valid (has a size).
     * The doPostUpdateActions method clears the array after they are done.
     */
    public postUpdateActions: (() => void)[] = [];
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
    // TODO document
    private mapContainerId: number;
    private static staticMaxMapContainerId: number = 0;
    /** On an embedded map view, this is set by the parent view object so the relevant button can call it. */
    public updateCodeBlockCallback: () => Promise<void>;
    /** On an embedded map view, this is set by the parent view object so the relevant button can call it. */
    public updateCodeBlockFromMapViewCallback: () => Promise<void>;
    /** Internal URL for a pre-generated "error" tile */
    private errorTileUrl = '';

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
        app: App,
    ) {
        this.settings = settings;
        this.viewSettings = viewSettings;
        this.plugin = plugin;
        this.app = app;
        this.plugin.registerMapContainer(this);
        this.mapContainerId = MapContainer.staticMaxMapContainerId;
        MapContainer.staticMaxMapContainerId++;
        // Create the default state by the configuration. Since state fields can be added on new plugin versions,
        // we start by applying the state from DEFAULT_SETTINGS, so new fields can get default vaules
        this.defaultState = mergeStates(
            DEFAULT_SETTINGS.defaultState,
            this.settings.defaultState,
        );
        this.parentEl = parentEl;

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
            'Copied state as code block which you can embed in any note',
        );
    }

    getMarkers() {
        return this.display.markers;
    }

    isDarkMode(settings: PluginSettings): boolean {
        if (settings.chosenMapMode === 'dark') return true;
        if (settings.chosenMapMode === 'light') return false;

        // Auto mode - check if the theme is dark
        const theme = (this.app.vault as any).getConfig('theme');
        if (theme === 'obsidian') return true;
        else if (theme === 'moonstone') return false;
        else if (theme === 'system')
            return !document.body.classList.contains('theme-light');

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
                this.plugin,
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
            },
        );
        // Make touch move nicer on mobile.
        // See here a discussion of why this was done the way it was:
        // https://github.com/Leaflet/Leaflet/discussions/8972
        document.addEventListener('touchmove', (ev: TouchEvent) => {
            const mapDiv = this.display.mapDiv;
            const targetNode = ev.target as Node;
            const isEventOnMap =
                ev.target === mapDiv || mapDiv.contains(targetNode);
            if (isEventOnMap) ev.stopPropagation();
        });

        this.display.offlineHelperCanvas =
            this.display.mapDiv.createEl('canvas');
        this.display.offlineHelperCanvas.style.display = 'none';

        await this.createMap();

        // Prepare marker popups
        this.display.popupDiv = this.display.viewDiv.createDiv();
        this.display.popupDiv.addClasses([
            'mv-marker-popup-container',
            'popover',
            'hover-popup',
        ]);
        this.createErrorTile();
        const dummyPopperElement = this.display.viewDiv.createDiv();
        // Popper doesn't work well under mobile
        if (!utils.isMobile(this.app)) {
            this.display.popperInstance = createPopper(
                dummyPopperElement,
                this.display.popupDiv,
                {
                    placement: 'top', // Initial preferred placement
                    modifiers: [
                        {
                            name: 'flip',
                            options: {
                                fallbackPlacements: ['bottom', 'right', 'left'], // Other placements to consider if 'top' is not suitable
                            },
                        },
                        {
                            name: 'offset',
                            options: {
                                offset: [0, 8],
                            },
                        },
                    ],
                },
            );
        }
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
        freezeMap: boolean = false,
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
            if (!freezeMap && !this.freezeMap && this.ongoingChanges <= 0) {
                const willAutoFit =
                    state.autoFit || // State auto-fit
                    (considerAutoFit && // Global auto-fit
                        (this.settings.autoZoom || this.viewSettings.autoZoom));
                await this.updateMarkersToState(newState, false, willAutoFit);
                if (willAutoFit) await this.autoFitMapToMarkers();
                this.applyLock();
            }
            if (this.display.controls) {
                this.display.controls.updateControlsToState();
                if (newState.editMode) {
                    this.display.map.pm.addControls({
                        position: 'topright',
                        drawCircleMarker: false,
                        drawCircle: false,
                        drawText: false,
                        removalMode: false,
                    });
                    // this.display.map.pm.enableGlobalEditMode({});
                } else {
                    this.display.map.pm.removeControls();
                    // this.display.map.pm.disableGlobalEditMode();
                }
            }
            if (this.display.lockControl)
                this.display.lockControl.updateFromState(state.lock);
            if (this.display.editControl)
                this.display.editControl.updateFromState(newState.editMode);
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
        partialState: Partial<MapState>,
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
        const mergedState = mergeStates(this.state, partialState);
        if (!areStatesEqual(this.state, mergedState, this.display?.map)) {
            this.state = mergedState;
            this.freezeMap = true;
            this.highLevelSetViewState(partialState);
        }
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
            this.display.tileLayer = this.createTileLayer(mapSourceUrl, {
                maxZoom: this.settings.letZoomBeyondMax
                    ? consts.MAX_ZOOM
                    : maxNativeZoom,
                maxNativeZoom: maxNativeZoom,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                attribution: attribution,
                className: neededClassName,
                errorTileUrl: this.createErrorTile(),
            });
            this.display.map.addLayer(this.display.tileLayer);
        }
    }

    createErrorTile() {
        const dpr = window.devicePixelRatio || 1;
        const tileSize = 256;
        const canvas = this.display.viewDiv.createEl('canvas');
        canvas.style.display = 'none';

        // Set actual size in memory (scaled for retina)
        canvas.width = tileSize * dpr;
        canvas.height = tileSize * dpr;

        // Set display size
        canvas.style.width = tileSize + 'px';
        canvas.style.height = tileSize + 'px';

        const ctx = canvas.getContext('2d');

        // Scale all drawing operations by dpr
        ctx.scale(dpr, dpr);

        // Fill with light gray background
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, tileSize, tileSize);

        // Add error text
        ctx.fillStyle = '#666666';
        ctx.font = `${Math.round(14 * (dpr / 2))}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('Tile unavailable', tileSize / 2, tileSize / 2);

        return canvas.toDataURL();
    }

    async refreshMap() {
        this.display?.tileLayer?.remove();
        this.display.tileLayer = null;
        this.display?.map?.off();
        this.display?.map?.remove();
        this.display?.markers?.clear();
        this.display?.controls?.reload();
        await this.createMap();
        this.updateMarkersToState(this.state, true);
        this.display?.controls?.updateControlsToState();
    }

    async createMap() {
        // Obsidian Leaflet compatability: disable tree-shaking for the full-screen module
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
                this.settings,
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
            pmIgnore: true,
            polygonOptions: {
                pmIgnore: true,
            },
        });
        this.display.map.addLayer(this.display.clusterGroup);

        this.display.map.on('zoomend', async (_event: leaflet.LeafletEvent) => {
            this.ongoingChanges -= 1;
            this.updateStateAfterMapChange({
                mapZoom: this.display.map.getZoom(),
                mapCenter: this.display.map.getCenter(),
            });
            this.setHighlight(this.display.highlight);
            this.updateRealTimeLocationMarkers();
            this.doPostUpdateActions();
        });
        this.display.map.on('moveend', async (_event: leaflet.LeafletEvent) => {
            this.ongoingChanges -= 1;
            this.updateStateAfterMapChange({
                mapZoom: this.display.map.getZoom(),
                mapCenter: this.display.map.getCenter(),
            });
            this.setHighlight(this.display.highlight);
            this.updateRealTimeLocationMarkers();
            this.doPostUpdateActions();
        });
        this.display.map.on('movestart', (_event: leaflet.LeafletEvent) => {
            this.ongoingChanges += 1;
        });
        this.display.map.on('zoomstart', (_event: leaflet.LeafletEvent) => {
            this.ongoingChanges += 1;
        });
        this.display.map.on(
            'doubleClickZoom',
            (_event: leaflet.LeafletEvent) => {
                this.ongoingChanges += 1;
            },
        );

        const [defaultIcon, defaultPathOptions, _] =
            this.plugin.displayRulesCache.getDefaults();
        this.display.map.pm.setGlobalOptions({
            snapDistance: 10,
            markerStyle: {
                icon: getIconFromOptions(
                    defaultIcon,
                    [],
                    this.plugin.iconFactory,
                ),
            },
            pathOptions: defaultPathOptions,
            limitMarkersToCount: 20,
            continueDrawing: false,
        });
        this.display.map.on('pm:drawstart', (e) => {
            if (!this.display.controls.editModeTools.noteToEdit) {
                new Notice('You must first select a note.');
                this.display.map.pm.disableDraw();
                this.display.controls.openEditSection();
            }
        });
        this.display.map.on(
            'pm:create',
            (e: {
                shape: leaflet.PM.SUPPORTED_SHAPES;
                layer: leaflet.Layer;
            }) => {
                const file = this.display.controls.editModeTools.noteToEdit;
                const heading = this.display.controls.editModeTools.noteHeading;
                const tags = this.display.controls.editModeTools.tags;
                if (
                    e.shape === 'Line' ||
                    e.shape === 'Rectangle' ||
                    e.shape === 'Polygon'
                ) {
                    createGeoJsonInFile(
                        (e.layer as leaflet.Polyline).toGeoJSON(),
                        file,
                        heading,
                        tags,
                        this.app,
                        this.settings,
                    );
                } else if (
                    e.shape === 'Marker' &&
                    e.layer instanceof leaflet.Marker
                ) {
                    createMarkerInFile(
                        e.layer.getLatLng(),
                        file,
                        heading,
                        tags,
                        this.app,
                        this.settings,
                        this.plugin,
                    );
                } else {
                    console.log('Unsupported shape:', e);
                }
                // This temporary layer doesn't truly represent a Map View marker -- remove it as it will soon be replaced by the
                // newly-picked-up geolocation
                e.layer.remove();
            },
        );

        this.display.map.on('viewreset', () => {
            this.setHighlight(this.display.highlight);
            this.updateRealTimeLocationMarkers();
            this.doPostUpdateActions();
        });

        if (this.viewSettings.showSearch) {
            this.display.searchControls = new SearchControl(
                { position: 'topright' },
                this,
                this.app,
                this.plugin,
                this.settings,
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
                this.settings,
            );
            this.display.map.addControl(this.display.realTimeControls);
        }

        if (this.viewSettings.showEdit && !this.state.editMode) {
            this.display.editControl = new EditControl(
                { position: 'topright' },
                this,
                this.app,
                this.settings,
            );
            this.display.map.addControl(this.display.editControl);
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

        this.display.map.on('click', (_event: leaflet.LeafletMouseEvent) => {
            this.setHighlight(null);
            this.closeMarkerPopup(false);
        });

        // Build the map right-click context menu
        this.display.map.on(
            'contextmenu',
            async (event: leaflet.LeafletMouseEvent) => {
                let mapPopup = new Menu();
                menus.addMapContextMenuItems(
                    mapPopup,
                    event.latlng,
                    this,
                    this.settings,
                    this.app,
                    this.plugin,
                );
                mapPopup.showAtPosition(event.originalEvent);
            },
        );

        // This is an ugly work-around for an issue of marker popups sometimes not closing when they should,
        // seemingly due to a race condition of closing and opening the popup from multiple markers upon
        // rapid mouse movements.
        // I couldn't find a better solution to this edge case rather than check once in a while if a popup
        // happens to be open when it shouldn't.
        setInterval(async () => {
            if (
                this.display.popupDiv &&
                this.display.popupDiv.hasClass('visible')
            ) {
                if (utils.isMobile(this.app)) return;
                // If the popup is displayed, we're not on mobile (so it should be only displayed on hover) but
                // there's no popup element, close the popup
                if (!this.display.popupElement) this.closeMarkerPopup(false);
                if (this.display.popupElement) {
                    const mousePosition = await utils.getMousePosition();
                    const element = this.display.popupElement?.getElement();
                    const rect = element?.getBoundingClientRect();
                    if (
                        rect &&
                        !(
                            mousePosition.x >= rect.left &&
                            mousePosition.x <= rect.right &&
                            mousePosition.y >= rect.top &&
                            mousePosition.y <= rect.bottom
                        )
                    ) {
                        // The mouse position is not inside the marker the popup belongs to, seems like we missed
                        // an event to close the popup
                        this.closeMarkerPopup(false);
                    }
                }
            }
        }, 500);
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
        freezeMap: boolean = false,
    ) {
        if (this.settings.debug) console.time('updateMarkersToState');
        if (!this.isOpen) {
            console.log('Skipping closed map container:', this);
            return;
        }
        await this.plugin.waitForInitialization();
        const allLayers = this.filterAndPrepareMarkers(
            this.plugin.layerCache.layers,
            state,
        );
        const forceRecreate = state.markerLabels != this.state.markerLabels;
        this.state = structuredClone(state);

        // TODO TEMP change names
        if (forceRecreate) this.updateMapMarkers([]);
        this.updateMapMarkers(allLayers);
        // There are multiple layers of safeguards here, in an attempt to minimize the cases where a series
        // of interactions and async updates compete over the map.
        // See the comment in internalSetViewState to get more context
        if (
            !freezeMap &&
            !this.freezeMap &&
            this.ongoingChanges <= 0 &&
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
        if (this.settings.debug) console.timeEnd('updateMarkersToState');
    }

    filterAndPrepareMarkers(
        layers: Iterable<BaseGeoLayer>,
        state: MapState,
    ): BaseGeoLayer[] {
        let filteredLayers: BaseGeoLayer[] = [];
        try {
            filteredLayers = this.filterMarkers(layers, state.query);
            state.queryError = false;
        } catch (e) {
            filteredLayers = [];
            state.queryError = true;
        }
        addEdgesToMarkers(
            filteredLayers,
            this.app,
            state.showLinks,
            this.display.polylines,
        );
        return filteredLayers;
    }

    filterMarkers(allMarkers: Iterable<BaseGeoLayer>, queryString: string) {
        let results: BaseGeoLayer[] = [];
        const query = new Query(this.app, queryString);
        for (const marker of allMarkers)
            if (query.testMarker(marker)) results.push(marker);
        return results;
    }

    /**
     * Update the actual Leaflet markers of the map according to a new list of logical markers.
     * Unchanged markers are not touched, new markers are created and old markers that are not in the updated list are removed.
     * Also, all the polylines (edge lines representing links) are cleared and redrawn, which is inefficient and can
     * be optimized in the future.
     * @param newLayer The new array of layers
     */
    updateMapMarkers(newLayers: Iterable<BaseGeoLayer>) {
        for (const layer of this.display.markers.layers) layer.touched = false;
        let layersToAdd: BaseGeoLayer[] = [];
        let totalLayers = 0;
        for (let layer of newLayers) {
            const existingLayer = this.display.markers.get(layer.id);
            if (existingLayer && existingLayer.isSame(layer)) {
                // This layer exists, so just keep it
                existingLayer.touched = true;
            } else {
                // New layer - create it
                if (layer instanceof FileMarker)
                    layer.geoLayers.set(
                        this.mapContainerId,
                        this.newLeafletMarker(layer),
                    );
                else if (layer instanceof GeoJsonLayer)
                    layer.geoLayers.set(
                        this.mapContainerId,
                        this.newLeafletGeoJson(layer),
                    );
                layersToAdd.push(layer);
            }
            totalLayers++;
        }
        let layersToRemove: BaseGeoLayer[] = [];
        for (const layer of this.display.markers.layers) {
            if (!layer.touched) {
                layersToRemove.push(layer);
                this.display.markers.delete(layer.id);
                // Remove the edges that connect the markers we are removing, together with their polylines
                if (layer instanceof FileMarker)
                    layer.removeEdges(this.display.polylines);
            }
        }
        this.display.clusterGroup.removeLayers(
            layersToRemove.map((layer) => this.getGeoLayer(layer)),
        );
        for (const layer of layersToAdd) this.display.markers.add(layer);
        // Now add the actual markers & paths on the map
        this.display.clusterGroup.addLayers(
            layersToAdd.map((layer) => this.getGeoLayer(layer)),
        );
        this.buildPolylines();
        // Just a cheap sanity check
        if (totalLayers != this.display.markers.size)
            console.error(
                'Something went wrong building the map, it has',
                this.display.markers.size,
                'items instead of',
                totalLayers,
            );
    }

    /**
     * Builds all the non-existing polylines according to the edges stored in the markers, and adds them to the map.
     */
    private buildPolylines() {
        if (this.state.showLinks) {
            for (const marker of this.display.markers.layers) {
                if (marker instanceof FileMarker) {
                    // Draw edges between markers
                    for (const edge of marker.edges) {
                        // Since an edge is linked from both of its sides, we want to make sure we create
                        // the polyline just once
                        if (edge.polyline) {
                            continue;
                        }
                        let polyline = leaflet.polyline(
                            [edge.marker1.location, edge.marker2.location],
                            {
                                color: this.state.linkColor,
                                weight: 1,
                            },
                        );
                        edge.polyline = polyline;
                        polyline.addTo(this.display.map);
                        this.display.polylines.push(polyline);
                    }
                }
            }
        }
    }

    private newLeafletMarker(marker: FileMarker): leaflet.Marker {
        let icon: leaflet.Icon<IconOptions> | leaflet.DivIcon;
        if (marker.icon) {
            icon = marker.icon;
        } else {
            icon = new leaflet.Icon.Default();
        }

        let newMarker = leaflet.marker(marker.location, {
            icon: icon,
            autoPan: true,
        });

        if (this.state.markerLabels && this.state.markerLabels != 'off')
            newMarker.bindTooltip(marker.name, {
                permanent: true,
                direction: this.state.markerLabels,
                className: 'mv-marker-label',
            });

        newMarker.on('click', async (event: leaflet.LeafletMouseEvent) => {
            if (utils.isMobile(this.app)) {
                this.setHighlight(marker);
                await this.showMarkerPopups(marker, newMarker, event);
            } else
                this.goToMarker(
                    marker,
                    utils.mouseEventToOpenMode(
                        this.settings,
                        event.originalEvent,
                        'openNote',
                    ),
                    true,
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
                        'openNote',
                    ),
                    true,
                );
        });

        newMarker.on('mouseover', (event: leaflet.LeafletMouseEvent) => {
            if (!utils.isMobile(this.app)) {
                this.showMarkerPopups(marker, newMarker, event);
            }
        });
        newMarker.on('mouseout', (_event: leaflet.LeafletMouseEvent) => {
            if (!utils.isMobile(this.app)) {
                this.closeMarkerPopup(false);
            }
        });
        newMarker.on('remove', (_event: leaflet.LeafletMouseEvent) => {
            this.closeMarkerPopup(true);
        });
        newMarker.on('add', (_event: leaflet.LeafletEvent) => {
            newMarker
                .getElement()
                .addEventListener('contextmenu', (ev: MouseEvent) => {
                    this.openMarkerContextMenu(marker, newMarker, ev);
                    ev.stopPropagation();
                });
            newMarker
                .getElement()
                .addEventListener('touchstart', (ev: MouseEvent) => {
                    // For non-mobile devices, don't let the touch events trigger a 'click' event.
                    // This way a popup is displayed as part of a "mouse hover", but stays on.
                    if (!utils.isMobile(this.app)) {
                        ev.stopPropagation();
                        ev.preventDefault();
                    }
                });
            newMarker
                .getElement()
                .addEventListener('touchend', (ev: MouseEvent) => {
                    // For non-mobile devices, don't let the touch events trigger a 'click' event.
                    // This way a popup is displayed as part of a "mouse hover", but stays on.
                    if (!utils.isMobile(this.app)) {
                        ev.stopPropagation();
                        ev.preventDefault();
                    }
                });
        });
        newMarker.on(
            'pm:edit',
            (e: {
                shape: leaflet.PM.SUPPORTED_SHAPES;
                layer: leaflet.Layer;
            }) => {
                if (e.layer instanceof leaflet.Marker) {
                    moveFileMarker(
                        marker,
                        e.layer.getLatLng(),
                        this.settings,
                        this.app,
                    );
                } else {
                    new Notice('Cannot edit this path.');
                    console.error('Cannot edit unknown object:', e);
                }
            },
        );
        return newMarker;
    }

    private openMarkerContextMenu(
        marker: BaseGeoLayer,
        mapMarker: leaflet.Marker,
        ev: MouseEvent,
    ) {
        this.setHighlight(mapMarker);
        let mapPopup = new Menu();
        if (marker instanceof FileMarker) {
            menus.populateOpenNote(this, marker, mapPopup, this.settings);
            if (this.state.editMode) {
                menus.populateRename(
                    this,
                    marker,
                    mapPopup,
                    this.settings,
                    this.app,
                    this.plugin,
                );
            } else {
                menus.addStartEditMode(
                    this,
                    marker,
                    mapPopup,
                    this.settings,
                    this.app,
                    this.plugin,
                );
            }
            menus.populateRouting(
                this,
                marker.location,
                mapPopup,
                this.settings,
            );
            const name = marker.name;
            menus.populateOpenInItems(
                mapPopup,
                marker.location,
                name,
                this.settings,
            );
        }
        if (ev) mapPopup.showAtPosition(ev);
    }

    private async showMarkerPopups(
        layer: BaseGeoLayer,
        leafletLayer: leaflet.Layer,
        event: leaflet.LeafletMouseEvent,
    ) {
        // Popups based on the layers below the cursor shouldn't be opened while animations
        // are occuring
        if (this.settings.showNoteNamePopup || this.settings.showNotePreview) {
            this.closeMarkerPopup(true);
            const component = mount(MarkerPopup, {
                target: this.display.popupDiv,
                props: {
                    plugin: this.plugin,
                    app: this.app,
                    settings: this.settings,
                    view: this,
                    layer: layer,
                    leafletLayer: leafletLayer,
                    doClose: () => {
                        this.closeMarkerPopup(false);
                    },
                },
            });
            this.display.popupElementUnmount = () => {
                unmount(component);
            };

            const markerElement = event.target.getElement();
            // Make the popup visible
            this.display.popupDiv.addClass('visible');
            // If we're using Popper (non-mobile), update the Popper instance about which marker it should follow.
            // Otherwise, use a more naive placement
            if (this.display.popperInstance) {
                this.display.popperInstance.state.elements.reference =
                    markerElement;
                this.display.popperInstance.update();
            } else {
                this.display.popupDiv.addClass('simple-placement');
            }
        }
        if (
            this.settings.showNativeObsidianHoverPopup &&
            layer.layerType === 'fileMarker'
        ) {
            const previewDetails = {
                scroll: layer.fileLine,
                line: layer.fileLine,
                startLoc: {
                    line: layer.fileLine,
                    col: 0,
                    offset: layer.fileLocation,
                } as Loc,
                endLoc: {
                    line: layer.fileLine,
                    col: 0,
                    offset: layer.fileLocation,
                } as Loc,
            };
            const fileMarker = layer as FileMarker;
            this.app.workspace.trigger(
                'link-hover',
                this.getGeoLayer(fileMarker).getElement(),
                this.getGeoLayer(fileMarker).getElement(),
                layer.file.path,
                '',
                previewDetails,
            );
        }
        this.startHoverHighlight(layer);
        if (leafletLayer instanceof leaflet.Marker)
            this.display.popupElement = leafletLayer;
    }

    /*
     * Popups can be closed in two ways:
     * 1. A "soft" close, which means the user just hovered out of the popup element, and we may want the popup to fade away nicely, OR,
     * 2. A "hard" close, which means a new popup needs to be opened right away, and there's no time for a fadeout.
     */
    private closeMarkerPopup(hardClose: boolean) {
        this.endHoverHighlight();
        this.display.popupDiv.removeClass('visible');
        if (hardClose) {
            this.display.popupElement = null;
            if (this.display.popupElementUnmount)
                this.display.popupElementUnmount();
            this.display.popupElementUnmount = null;
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
        const mapSize = this.display?.map?.getSize();
        if (!(mapSize && mapSize.x > 0 && mapSize.y > 0)) {
            // The map is not ready for an auto-fit.
            // Add a call to this method for when the map finished updating.
            this.postUpdateActions.push(() => {
                this.autoFitMapToMarkers();
            });
        }
        if (this.display.markers.size > 0) {
            const locations: leaflet.LatLng[] = [];
            for (const marker of this.display.markers.layers) {
                locations.push(...marker.getBounds());
            }
            this.display.map.fitBounds(leaflet.latLngBounds(locations), {
                maxZoom: Math.min(
                    this.settings.zoomOnGoFromNote,
                    this.getMapSource().maxZoom ?? consts.DEFAULT_MAX_TILE_ZOOM,
                ),
            });
        } else if (this.viewSettings.emptyFitRevertsToDefault) {
            this.display.map.setView(
                this.defaultState.mapCenter,
                this.defaultState.mapZoom,
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
        editorAction?: (editor: Editor) => Promise<void>,
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
                this.settings.newPaneSplitDirection,
            );
            this.lastPaneLeaf = chosenLeaf;
        }
        if (!chosenLeaf) {
            chosenLeaf = this.app.workspace.getLeaf(true);
        }
        // Open the file and switch to it -- unless we created a new tab for it, on which case we should respect the user's
        // "always focus new tabs" Obsidian setting
        let active = undefined; // Respect user's "always focus new tabs" settings
        if (!createTab) active = true; // Focus the leaf
        await chosenLeaf.openFile(file, { active });
        const editor = utils.getEditor(this.app, chosenLeaf);
        if (editor && editorAction) await editorAction(editor);
    }

    /**
     * Open and go to the editor location represented by the marker
     * @param marker The marker to open
     * @param openBehavior the required type of action
     * @param highlight If true will highlight the line
     * @param fileLocationOffset Go before or after the marker in the file
     */
    async goToMarker(
        marker: BaseGeoLayer,
        openBehavior: OpenBehavior,
        highlight: boolean,
        fileLocationOffset: number = 0,
    ) {
        return this.goToFile(marker.file, openBehavior, async (editor) => {
            await utils.goToEditorLocation(
                editor,
                marker.fileLocation + fileLocationOffset,
                highlight,
            );
        });
    }

    addSearchResultMarker(details: GeoSearchResult, keepZoom: boolean) {
        this.display.searchResult = leaflet.marker(details.location, {
            icon: getIconFromOptions(
                consts.SEARCH_RESULT_MARKER,
                [],
                this.plugin.iconFactory,
            ),
        });
        const marker = this.display.searchResult;
        marker.on('mouseover', (_event: leaflet.LeafletMouseEvent) => {
            marker
                .bindPopup(details.name, {
                    closeButton: true,
                    className: 'marker-popup',
                })
                .openPopup();
        });
        marker.on('mouseout', (_event: leaflet.LeafletMouseEvent) => {
            marker.closePopup();
        });
        marker.on('contextmenu', (event: leaflet.LeafletMouseEvent) => {
            let mapPopup = new Menu();
            // This is the same context menu when right-clicking a blank area of the map, but in contrast to a blank
            // area, in a search result marker we use the location of the marker and not the mouse pointer
            menus.addMapContextMenuItems(
                mapPopup,
                details.location,
                this,
                this.settings,
                this.app,
                this.plugin,
            );
            mapPopup.showAtPosition(event.originalEvent);
        });
        marker.addTo(this.display.map);
        this.goToSearchResult(details.location, marker, keepZoom);
    }

    addFloatingRoute(route: RoutingResult) {
        const distanceKmStr = (route.distanceMeters / 1000).toFixed(1);
        const timeMinutesStr = Math.round(route.timeMinutes);
        const geoJsonLayer = leaflet.geoJSON(route.path, {
            style: {
                ...consts.ROUTING_PATH_OPTIONS,
                bubblingMouseEvents: false,
            },
            onEachFeature: (feature: any, layer: leaflet.Layer) => {
                const popupContent = `
					<b>Routing with '${route.profileUsed}':</b> <br>
					Distance: ${distanceKmStr}km <br>
					Time: ${timeMinutesStr} minutes
				`;
                layer.bindPopup(popupContent, { autoClose: true });
                layer.on('mouseover', (event: leaflet.LeafletMouseEvent) => {
                    layer.openPopup(event.latlng);
                });
                layer.on('mouseout', (_event: leaflet.LeafletMouseEvent) => {
                    layer.closePopup();
                });
            },
        });
        geoJsonLayer.on('contextmenu', (event: leaflet.LeafletMouseEvent) => {
            let menu = new Menu();
            menus.addPathAddToNote(
                menu,
                route.path,
                this,
                this.settings,
                this.app,
                this.plugin,
                () => {
                    this.display.map.removeLayer(geoJsonLayer);
                    this.display.calculatedRoutes.remove(geoJsonLayer);
                },
            );
            menu.addItem((item: MenuItem) => {
                item.setTitle('Remove calculated route');
                item.setIcon('trash');
                item.onClick(() => {
                    this.display.map.removeLayer(geoJsonLayer);
                    this.display.calculatedRoutes.remove(geoJsonLayer);
                });
            });
            menu.addItem((item: MenuItem) => {
                item.setTitle('Remove all calculated routes');
                item.setIcon('trash');
                item.onClick(() => {
                    for (const route of this.display.calculatedRoutes)
                        this.display.map.removeLayer(route);
                    this.display.calculatedRoutes = [];
                });
            });
            menu.showAtPosition(event.originalEvent);
        });
        geoJsonLayer.addTo(this.display.map);
        this.display.calculatedRoutes.push(geoJsonLayer);
        new Notice(
            `Routing with '${route.profileUsed}': ${distanceKmStr}km, ${timeMinutesStr} minutes`,
        );
    }

    goToSearchResult(
        location: leaflet.LatLng,
        marker: FileMarker | leaflet.Marker,
        keepZoom: boolean = false,
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
                : this.getGeoLayer(mapOrFileMarker)
            : null;
        // In case the marker is hidden in a cluster group, we actually want the cluster group
        // to be the highlighted item
        let actualHighlight: leaflet.Marker = null;
        if (highlight) {
            if (highlight instanceof leaflet.Marker) {
                const parent =
                    this.display.clusterGroup.getVisibleParent(highlight);
                actualHighlight = parent || highlight;
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
        fileLine: number | null = null,
    ): BaseGeoLayer | null {
        for (let [_, fileMarker] of this.display.markers.map) {
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
                    [],
                    this.plugin.iconFactory,
                ),
            })
            .addTo(this.display.map);
        this.display.realTimeLocationMarker.on(
            'contextmenu',
            (event: leaflet.LeafletMouseEvent) => {
                let mapPopup = new Menu();
                // This is the same context menu when right-clicking a blank area of the map, but in contrast to a blank
                // area, we use the location of the marker and not the mouse pointer
                menus.addMapContextMenuItems(
                    mapPopup,
                    this.lastRealTimeLocation.center,
                    this,
                    this.settings,
                    this.app,
                    this.plugin,
                );
                mapPopup.showAtPosition(event.originalEvent);
            },
        );
        this.display.realTimeLocationRadius = leaflet
            .circle(center, { radius: accuracy })
            .addTo(this.display.map);
        this.display.realTimeControls.onLocationFound();
    }

    setRealTimeLocation(
        center: leaflet.LatLng,
        accuracy: number,
        source: RealTimeLocationSource,
        forceRefresh: boolean = false,
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
                        [],
                        this.plugin.iconFactory,
                    ),
                })
                .addTo(this.display.map);
            this.display.routingSource.on(
                'contextmenu',
                (ev: leaflet.LeafletMouseEvent) => {
                    let routingSourcePopup = new Menu();
                    routingSourcePopup.addItem((item: MenuItem) => {
                        item.setTitle('Remove routing source');
                        item.setIcon('trash');
                        item.onClick(() => {
                            this.setRoutingSource(null);
                        });
                    });
                    routingSourcePopup.showAtPosition(ev.originalEvent);
                },
            );
        }
    }

    setLock(lock: boolean) {
        this.state.lock = lock;
        this.applyLock();
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
            if (!this.display.zoomControls) this.addZoomButtons();
        }
    }

    startHoverHighlight(markerToFocus: BaseGeoLayer) {
        if (!this.state.showLinks) return;
        this.display.mapDiv.addClass('mv-fade-active');
        for (const marker of this.display.markers.layers) {
            if (
                markerToFocus &&
                marker instanceof FileMarker &&
                this.getGeoLayer(marker)
            ) {
                const geoLayer = this.getGeoLayer(marker);
                const parent =
                    this.display.clusterGroup.getVisibleParent(geoLayer);
                const visibleLeafletMarker = parent || geoLayer;
                const element = visibleLeafletMarker.getElement();
                const shouldBeVisible =
                    marker === markerToFocus ||
                    (markerToFocus.layerType === 'fileMarker' &&
                        marker.isLinkedTo(markerToFocus as FileMarker));
                if (element) {
                    // We add two classes, one denoting that generally a fade is active and another to denote
                    // that a specific marker should be shown. It is done this way because of cluster groups.
                    // We want a cluster group to be shown if *at least one* of its markers should be shown
                    if (shouldBeVisible)
                        element.addClass('mv-fade-marker-shown');
                }
                if (marker === markerToFocus) {
                    for (const edge of marker.edges) {
                        if (edge.polyline) {
                            edge.polyline
                                .getElement()
                                ?.addClass('mv-fade-edge-shown');
                        }
                    }
                }
            }
        }
    }

    endHoverHighlight() {
        this.display.mapDiv.removeClass('mv-fade-active');
        for (const marker of this.display.markers.layers) {
            const geoLayer = this.getGeoLayer(marker);
            if (geoLayer && geoLayer instanceof leaflet.Marker) {
                const parent =
                    this.display.clusterGroup.getVisibleParent(geoLayer);
                const visibleLeafletMarker = parent || geoLayer;
                const element = visibleLeafletMarker.getElement();
                if (element) element.removeClasses(['mv-fade-marker-shown']);
                if (marker instanceof FileMarker) {
                    for (const edge of marker.edges) {
                        if (edge.polyline) {
                            edge.polyline
                                .getElement()
                                ?.removeClass('mv-fade-edge-shown');
                        }
                    }
                }
            }
        }
    }

    createTileLayer(
        url: string,
        options: leaflet.TileLayerOptions,
    ): TileLayerOffline {
        const tileLayer = tileLayerOffline(url, options);
        const originalCreateFunction = tileLayer.createTile;
        // Override the tile creation function and add a class to denote for each
        // tile if it is available offline or not
        tileLayer.createTile = (
            coords: leaflet.Coords,
            done: leaflet.DoneCallback,
        ): HTMLElement => {
            const element = originalCreateFunction.call(
                tileLayer,
                coords,
                done,
            ) as HTMLElement;
            const tileSize = tileLayer.getTileSize();
            element.style.width = tileSize.x + 1 + 'px';
            element.style.height = tileSize.y + 1 + 'px';
            const key = tileLayer._getStorageKey(coords);
            hasTile(key).then((availableOffline) => {
                if (availableOffline) element.classList.add('mv-offline');
                else {
                    element.classList.add('mv-online');
                    if (this.settings.cacheAllTiles)
                        offlineTiles.saveDownloadedTile(
                            element as HTMLImageElement,
                            tileLayer,
                            coords,
                            this.display.map.getZoom(),
                            this.display.offlineHelperCanvas,
                        );
                }
            });
            return element;
        };
        return tileLayer;
    }

    private newLeafletGeoJson(marker: GeoJsonLayer): leaflet.GeoJSON {
        // TODO: use the marker popup component here, and less code repetition.
        const geoJsonLayer = leaflet.geoJSON(marker.geojson, {
            style: marker.pathOptions,
            onEachFeature: (feature: any, layer: leaflet.Layer) => {
                // Features of type 'Point' are handled below
                if (feature?.geometry?.type !== 'Point') {
                    const name = (feature as any)?.properties?.name;
                    let header = name
                        ? `${name} (in '${marker.file.name}')`
                        : marker.file.name;
                    layer.bindPopup(header, { autoClose: true });
                    layer.on(
                        'mouseover',
                        (event: leaflet.LeafletMouseEvent) => {
                            layer.openPopup(event.latlng);
                        },
                    );
                    layer.on(
                        'mouseout',
                        (_event: leaflet.LeafletMouseEvent) => {
                            layer.closePopup();
                        },
                    );
                    layer.on('click', (event: leaflet.LeafletMouseEvent) => {
                        // TODO proper mobile support
                        if (
                            marker.sourceType === 'geojson' &&
                            marker.fileLocation > 0
                        ) {
                            // Go to note
                            this.goToMarker(
                                marker,
                                utils.mouseEventToOpenMode(
                                    this.settings,
                                    event.originalEvent,
                                    'openNote',
                                ),
                                false,
                                // Move the cursor right before the GeoJSON in the file, so it will show the map preview and not the source code
                                -1,
                            );
                        } else {
                            // The path is an independent file, reveal it
                            if (
                                !(this.app.vault as any)?.config
                                    ?.showUnsupportedFiles
                            )
                                new Notice(
                                    'Some file types can only be displayed if you turn on "detect all file extensions" in the Obsidian "Files and links" settings.',
                                    60 * 1000,
                                );
                            const fileExplorer = (
                                this.app as any
                            )?.internalPlugins?.getEnabledPluginById(
                                'file-explorer',
                            );
                            fileExplorer?.revealInFolder(marker.file);
                        }
                    });
                }
            },
            pointToLayer: (feature: any, latlng: leaflet.LatLng) => {
                const leafletMarker = leaflet.marker(latlng, {
                    icon: getIconFromOptions(
                        consts.GEOJSON_MARKER,
                        [],
                        this.plugin.iconFactory,
                    ),
                });
                const floatingMarker = new FloatingMarker(
                    marker.file,
                    leafletMarker,
                );
                floatingMarker.header =
                    feature?.properties?.name ?? marker.file.name;
                floatingMarker.description = feature?.properties?.desc ?? '';
                floatingMarker.extraName = `Stored in '${marker.file.name}'`;
                // TODO proper mobile support
                leafletMarker.on(
                    'mouseover',
                    (event: leaflet.LeafletMouseEvent) => {
                        this.showMarkerPopups(
                            floatingMarker,
                            leafletMarker,
                            event,
                        );
                    },
                );
                leafletMarker.on(
                    'mouseout',
                    (_event: leaflet.LeafletMouseEvent) => {
                        this.closeMarkerPopup(false);
                    },
                );
                return leafletMarker;
            },
        });

        geoJsonLayer.on(
            'pm:edit',
            async (e: {
                shape: leaflet.PM.SUPPORTED_SHAPES;
                layer: leaflet.Layer;
            }) => {
                if (e.layer instanceof leaflet.Polyline) {
                    await editGeoJson(
                        marker,
                        (e.layer as leaflet.Polyline).toGeoJSON(),
                        this.settings,
                        this.app,
                    );
                } else {
                    new Notice('Cannot edit this path.');
                    console.error('Cannot edit unknown object:', e);
                }
            },
        );

        return geoJsonLayer;
    }

    private getGeoLayer<T extends BaseGeoLayer>(
        layer: T,
    ): T extends FileMarker ? leaflet.Marker : leaflet.Layer {
        return layer.geoLayers.get(this.mapContainerId) as any;
    }

    private doPostUpdateActions() {
        const mapSize = this.display?.map?.getSize();
        if (
            mapSize &&
            mapSize.x > 0 &&
            mapSize.y > 0 &&
            this.postUpdateActions.length > 0
        ) {
            // We clear the list of actions before running them because the action themselves may recursively trigger this method
            // (e.g. an auto-fit causes zoom and pan events).
            const actions = this.postUpdateActions;
            this.postUpdateActions = [];
            for (const action of actions) {
                action();
            }
        }
    }
}
