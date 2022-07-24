import {
    App,
    TAbstractFile,
    Loc,
    Editor,
    MenuItem,
    Menu,
    TFile,
    WorkspaceLeaf,
    Notice,
    MarkdownView,
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
import {
    MarkersMap,
    FileMarker,
    buildMarkers,
    getIconFromOptions,
    buildAndAppendFileMarkers,
    finalizeMarkers,
} from 'src/markers';
import MapViewPlugin from 'src/main';
import * as utils from 'src/utils';
import { ViewControls, SearchControl } from 'src/viewControls';
import { Query } from 'src/query';
import { GeoSearchResult } from 'src/geosearch';

export type ViewSettings = {
    showMapControls: boolean;
    showFilters: boolean;
    showView: boolean;
    viewTabType: 'regular' | 'mini';
    showPresets: boolean;
    showSearch: boolean;
    showOpenButton: boolean;

    // Override the global settings auto zoom.
    // Unlike the global auto zoom, the view auto zoom also happens on every setState, so when a new view opens,
    // it makes sure to zoom
    autoZoom?: boolean;
    emptyFitRevertsToDefault?: boolean;
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
        /** The search controls (search & clear buttons) */
        searchControls: SearchControl = null;
        /** A marker of the last search result */
        searchResult: leaflet.Marker = null;
        /** The currently highlighted marker (if any) */
        highlight: leaflet.Marker = null;
        /** The actual entity that is highlighted, which is either equal to the above, or the cluster group that it belongs to */
        actualHighlight: leaflet.Marker = null;
    })();
    public ongoingChanges = 0;
    public freezeMap: boolean = false;
    private plugin: MapViewPlugin;
    /** The default state as saved in the plugin settings */
    private defaultState: MapState;
    /**
     * The Workspace Leaf that a note was last opened in.
     * This is saved so the same leaf can be reused when opening subsequent notes, making the flow consistent & predictable for the user.
     */
    private newPaneLeaf: WorkspaceLeaf;
    /** Is the view currently open */
    private isOpen: boolean = false;

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

    getState() {
        return this.state;
    }

    copyStateUrl() {
        const params = stateToUrl(this.state);
        const url = `obsidian://mapview?action=open&${params}`;
        navigator.clipboard.writeText(url);
        new Notice('Copied state URL to clipboard');
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
        this.state = this.defaultState;
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
                    considerAutoFit &&
                    (this.settings.autoZoom || this.viewSettings.autoZoom);
                await this.updateMarkersToState(newState, false, willAutoFit);
                if (willAutoFit) await this.autoFitMapToMarkers();
            }
            if (updateControls && this.display.controls)
                this.display.controls.updateControlsToState();
        }
    }

    /**
     * Change the view state according to a given partial state.
     * In this class it just merges the states and calls internalSetViewState, but *this method gets overridden
     * by BaseMapView, which adds to it an update to the Obsidian state for tracking history.
     * This is deliberately *not* an async method, because in the version that calls the Obsidian setState method,
     * we want to reliably get the status of freezeMap
     */
    public highLevelSetViewState(partialState: Partial<MapState>) {
        const state = this.getState();
        if (state) {
            const newState = Object.assign({}, state, partialState);
            this.internalSetViewState(newState);
        }
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
        this.state = Object.assign(this.state, partialState);
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
        // LeafletJS compatability: disable tree-shaking for the full-screen module
        var dummy = leafletFullscreen;
        this.display.map = new leaflet.Map(this.display.mapDiv, {
            center: this.defaultState.mapCenter,
            zoom: this.defaultState.mapZoom,
            zoomControl: false,
            worldCopyJump: true,
            maxBoundsViscosity: 1.0,
        });
        leaflet.control
            .zoom({
                position: 'topright',
            })
            .addTo(this.display.map);
        this.updateTileLayerByState(this.state);
        this.display.clusterGroup = new leaflet.MarkerClusterGroup({
            maxClusterRadius:
                this.settings.maxClusterRadiusPixels ??
                DEFAULT_SETTINGS.maxClusterRadiusPixels,
            animate: false,
        });
        this.display.map.addLayer(this.display.clusterGroup);

        this.display.map.on('zoomend', async (event: leaflet.LeafletEvent) => {
            this.ongoingChanges -= 1;
            this.updateStateAfterMapChange({
                mapZoom: this.display.map.getZoom(),
                mapCenter: this.display.map.getCenter(),
            });
            this.display?.controls?.invalidateActivePreset();
            this.setHighlight(this.display.highlight);
        });
        this.display.map.on('moveend', async (event: leaflet.LeafletEvent) => {
            this.ongoingChanges -= 1;
            this.updateStateAfterMapChange({
                mapZoom: this.display.map.getZoom(),
                mapCenter: this.display.map.getCenter(),
            });
            this.display?.controls?.invalidateActivePreset();
            this.setHighlight(this.display.highlight);
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
        });

        if (this.viewSettings.showSearch) {
            this.display.searchControls = new SearchControl(
                { position: 'topright' },
                this,
                this.app,
                this.settings
            );
            this.display.map.addControl(this.display.searchControls);
        }

        if (this.settings.showClusterPreview) {
            this.display.clusterGroup.on('clustermouseover', (event) => {
                if (!(this.app as any)?.isMobile)
                    this.openClusterPreviewPopup(event);
            });
            this.display.clusterGroup.on('clustercontextmenu', (event) => {
                if ((this.app as any)?.isMobile)
                    this.openClusterPreviewPopup(event);
            });
            this.display.clusterGroup.on('clustermouseout', (event) => {
                event.propagatedFrom.closePopup();
            });
            this.display.clusterGroup.on('clusterclick', () => {
                this.setHighlight(this.display.highlight);
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
                mapPopup.setNoIcon();
                const location = `${event.latlng.lat},${event.latlng.lng}`;
                mapPopup.addItem((item: MenuItem) => {
                    item.setTitle('New note here (inline)');
                    item.onClick(async (ev) => {
                        const newFileName = utils.formatWithTemplates(
                            this.settings.newNoteNameFormat
                        );
                        const file: TFile = await utils.newNote(
                            this.app,
                            'multiLocation',
                            this.settings.newNotePath,
                            newFileName,
                            location,
                            this.settings.newNoteTemplate
                        );
                        this.goToFile(
                            file,
                            ev.ctrlKey,
                            utils.handleNewNoteCursorMarker
                        );
                    });
                });
                mapPopup.addItem((item: MenuItem) => {
                    item.setTitle('New note here (front matter)');
                    item.onClick(async (ev) => {
                        const newFileName = utils.formatWithTemplates(
                            this.settings.newNoteNameFormat
                        );
                        const file: TFile = await utils.newNote(
                            this.app,
                            'singleLocation',
                            this.settings.newNotePath,
                            newFileName,
                            location,
                            this.settings.newNoteTemplate
                        );
                        this.goToFile(
                            file,
                            ev.ctrlKey,
                            utils.handleNewNoteCursorMarker
                        );
                    });
                });
                mapPopup.addItem((item: MenuItem) => {
                    item.setTitle(`Copy geolocation`);
                    item.onClick((_ev) => {
                        navigator.clipboard.writeText(`[](geo:${location})`);
                    });
                });
                mapPopup.addItem((item: MenuItem) => {
                    item.setTitle(`Copy geolocation as front matter`);
                    item.onClick((_ev) => {
                        navigator.clipboard.writeText(
                            `---\nlocation: [${location}]\n---\n\n`
                        );
                    });
                });
                mapPopup.addItem((item: MenuItem) => {
                    item.setTitle('Open in default app');
                    item.onClick((_ev) => {
                        open(`geo:${event.latlng.lat},${event.latlng.lng}`);
                    });
                });
                utils.populateOpenInItems(
                    mapPopup,
                    event.latlng,
                    this.settings
                );
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
        let files = this.app.vault.getFiles();
        // Build the markers and filter them according to the query
        let newMarkers = await buildMarkers(files, this.settings, this.app);
        try {
            newMarkers = this.filterMarkers(newMarkers, state.query);
            state.queryError = false;
        } catch (e) {
            newMarkers = [];
            state.queryError = true;
        }
        finalizeMarkers(newMarkers, this.settings);
        this.state = state;
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
                animate: true,
                duration: 0.1,
            });
        }
        if (this.display?.controls)
            this.display.controls.setQueryBoxErrorByState();
        if (this.settings.debug) console.timeEnd('updateMarkersToState');
    }

    filterMarkers(allMarkers: FileMarker[], queryString: string) {
        let results: FileMarker[] = [];
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
    updateMapMarkers(newMarkers: FileMarker[]) {
        let newMarkersMap: MarkersMap = new Map();
        let markersToAdd: leaflet.Marker[] = [];
        let markersToRemove: leaflet.Marker[] = [];
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
            } else {
                // New marker - create it
                marker.mapMarker = this.newLeafletMarker(marker);
                markersToAdd.push(marker.mapMarker);
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
            markersToRemove.push(value.mapMarker);
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
            if ((this.app as any)?.isMobile)
                this.showMarkerPopups(marker, newMarker);
            else this.goToMarker(marker, event.originalEvent.ctrlKey, true);
        });
        newMarker.on('mouseover', (event: leaflet.LeafletMouseEvent) => {
            if (!(this.app as any)?.isMobile)
                this.showMarkerPopups(marker, newMarker);
        });
        newMarker.on('mouseout', (event: leaflet.LeafletMouseEvent) => {
            if (!(this.app as any)?.isMobile) newMarker.closePopup();
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
        fileMarker: FileMarker,
        mapMarker: leaflet.Marker,
        ev: MouseEvent
    ) {
        this.setHighlight(mapMarker);
        let mapPopup = new Menu();
        mapPopup.setNoIcon();
        mapPopup.addItem((item: MenuItem) => {
            item.setTitle('Open note');
            item.onClick(async (ev) => {
                this.goToMarker(fileMarker, ev.ctrlKey, true);
            });
        });
        mapPopup.addItem((item: MenuItem) => {
            item.setTitle('Open geolocation in default app');
            item.onClick((ev) => {
                open(
                    `geo:${fileMarker.location.lat},${fileMarker.location.lng}`
                );
            });
        });
        utils.populateOpenInItems(mapPopup, fileMarker.location, this.settings);
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
            if (
                (this.app as any)?.isMobile &&
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
                .openPopup()
                .on('popupclose', (event: leaflet.LeafletEvent) => {
                    // For some reason popups don't recycle on mobile if this is not added
                    mapMarker.unbindPopup();
                });
            mapMarker
                .getPopup()
                .getElement()
                ?.onClickEvent(() => {
                    this.goToMarker(fileMarker, false, true);
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
        if (this.display.markers.size > 1) {
            const locations: leaflet.LatLng[] = Array.from(
                this.display.markers.values()
            ).map((fileMarker) => fileMarker.location);
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
     * @param useCtrlKeyBehavior If true will use the alternative behaviour, as set in the settings
     * @param editorAction Optional callback to run when the file is opened
     */
    async goToFile(
        file: TFile,
        useCtrlKeyBehavior: boolean,
        editorAction?: (editor: Editor) => Promise<void>
    ) {
        let leafToUse = this.app.workspace.activeLeaf;
        const defaultDifferentPane =
            this.settings.markerClickBehavior != 'samePane';
        // Having a pane to reuse means that we previously opened a note in a new pane and that pane still exists (wasn't closed)
        const havePaneToReuse =
            this.newPaneLeaf &&
            this.newPaneLeaf.view &&
            this.settings.markerClickBehavior != 'alwaysNew';
        if (
            havePaneToReuse ||
            (defaultDifferentPane && !useCtrlKeyBehavior) ||
            (!defaultDifferentPane && useCtrlKeyBehavior)
        ) {
            // We were instructed to use a different pane for opening the note.
            // We go here in the following cases:
            // 1. An existing pane to reuse exists (the user previously opened it, with or without Ctrl).
            //    In this case we use the pane regardless of the default or of Ctrl, assuming that if a user opened a pane
            //    once, she wants to retain it until it's closed. (I hope no one will treat this as a bug...)
            // 2. The default is to use a different pane and Ctrl is not pressed.
            // 3. The default is to NOT use a different pane and Ctrl IS pressed.
            const someOpenMarkdownLeaf =
                this.app.workspace.getLeavesOfType('markdown');
            if (havePaneToReuse) {
                // We have an existing pane, that pane still has a view (it was not closed), and the settings say
                // to use a 2nd pane. That's the only case on which we reuse a pane
                this.app.workspace.setActiveLeaf(this.newPaneLeaf);
                leafToUse = this.newPaneLeaf;
            } else if (
                someOpenMarkdownLeaf.length > 0 &&
                this.settings.markerClickBehavior != 'alwaysNew'
            ) {
                // We don't have a pane to reuse but the user wants a new pane and there is currently an open
                // Markdown pane. Let's take control over it and hope it's the right thing to do
                this.app.workspace.setActiveLeaf(someOpenMarkdownLeaf[0]);
                leafToUse = someOpenMarkdownLeaf[0];
                this.newPaneLeaf = leafToUse;
            } else {
                // We need a new pane. We split it the way the settings tell us
                this.newPaneLeaf = this.app.workspace.splitActiveLeaf(
                    this.settings.newPaneSplitDirection || 'horizontal'
                );
                leafToUse = this.newPaneLeaf;
            }
        }
        await leafToUse.openFile(file);
        const editor = await utils.getEditor(this.app, leafToUse);
        if (editor && editorAction) await editorAction(editor);
    }

    /**
     * Open and go to the editor location represented by the marker
     * @param marker The FileMarker to open
     * @param useCtrlKeyBehavior If true will use the alternative behaviour, as set in the settings
     * @param highlight If true will highlight the line
     */
    async goToMarker(
        marker: FileMarker,
        useCtrlKeyBehavior: boolean,
        highlight: boolean
    ) {
        return this.goToFile(
            marker.file,
            useCtrlKeyBehavior,
            async (editor) => {
                await utils.goToEditorLocation(
                    editor,
                    marker.fileLocation,
                    highlight
                );
            }
        );
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
        let newMarkers: FileMarker[] = [];
        // Create an array of all file markers not in the removed file
        for (let [_markerId, existingFileMarker] of this.display.markers) {
            if (existingFileMarker.file.path !== fileRemoved)
                newMarkers.push(existingFileMarker);
        }
        if (fileAddedOrChanged && fileAddedOrChanged instanceof TFile)
            // Add file markers from the added file
            await buildAndAppendFileMarkers(
                newMarkers,
                fileAddedOrChanged,
                this.settings,
                this.app
            );
        finalizeMarkers(newMarkers, this.settings);
        this.updateMapMarkers(newMarkers);
    }

    addSearchResultMarker(details: GeoSearchResult, keepZoom: boolean) {
        this.display.searchResult = leaflet.marker(details.location, {
            icon: getIconFromOptions(consts.SEARCH_RESULT_MARKER),
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

    setHighlight(mapOrFileMarker: leaflet.Marker | FileMarker) {
        // The Marker object that should be highlighted
        let highlight: leaflet.Marker = mapOrFileMarker
            ? mapOrFileMarker instanceof leaflet.Marker
                ? mapOrFileMarker
                : mapOrFileMarker.mapMarker
            : null;
        // In case the marker is hidden in a cluster group, we actually want the cluster group
        // to be the highlighted item
        let actualHighlight: leaflet.Marker = null;
        if (highlight) {
            const parent =
                this.display.clusterGroup.getVisibleParent(highlight);
            actualHighlight = parent || actualHighlight;
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
    ): FileMarker | null {
        for (let [_, fileMarker] of this.display.markers) {
            if (fileMarker.file == file) {
                if (!fileLine) return fileMarker;
                if (fileLine == fileMarker.fileLine) return fileMarker;
            }
        }
        return null;
    }
}
