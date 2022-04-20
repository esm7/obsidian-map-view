import { App, TAbstractFile, Loc, Editor, ItemView, MenuItem, Menu, TFile, WorkspaceLeaf, Notice, ViewState } from 'obsidian';
import * as leaflet from 'leaflet';
// Ugly hack for obsidian-leaflet compatability, see https://github.com/esm7/obsidian-map-view/issues/6
// @ts-ignore
import * as leafletFullscreen from 'leaflet-fullscreen';
import '@fortawesome/fontawesome-free/js/all.min';
import 'leaflet/dist/leaflet.css';
import { GeoSearchControl } from 'leaflet-geosearch';
import 'leaflet-geosearch/dist/geosearch.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';

import * as consts from 'src/consts';
import { PluginSettings, MapState, DEFAULT_SETTINGS, mergeStates } from 'src/settings';
import { MarkersMap, FileMarker, buildMarkers, getIconFromOptions, buildAndAppendFileMarkers } from 'src/markers';
import { LocationSuggest } from 'src/geosearch';
import MapViewPlugin from 'src/main';
import * as utils from 'src/utils';
import { ViewControls } from 'src/viewControls';


export class MapView extends ItemView {
	private settings: PluginSettings;
	/** The displayed controls and objects of the map, separated from its logical state.
	 * Must only be updated in updateMarkersToState */
	private state: MapState;
	/** The state that was last saved to Obsidian's history stack */
	private lastSavedState: MapState;
	/** The map data */
	private display = new class {
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
	};
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
	 * @param leaf The leaf the map should be put in
	 * @param settings The plugin settings
	 * @param plugin The plugin instance
	 */
	constructor(leaf: WorkspaceLeaf, settings: PluginSettings, plugin: MapViewPlugin) {
		super(leaf);
		this.navigation = true;
		this.settings = settings;
		this.plugin = plugin;
		// Create the default state by the configuration
		this.defaultState = this.settings.defaultState;

		// Listen to file changes so we can update markers accordingly
		this.app.vault.on('delete', file => this.updateMarkersWithRelationToFile(file.path, null, true));
		this.app.metadataCache.on('changed', file => this.updateMarkersWithRelationToFile(file.path, file, false));
		// On rename we don't need to do anything because the markers hold a TFile, and the TFile object doesn't change
		// when the file name changes. Only its internal path field changes accordingly.
		// this.app.vault.on('rename', (file, oldPath) => this.updateMarkersWithRelationToFile(oldPath, file, true));
		this.app.workspace.on('css-change', () => {
			console.log('Map view: map refresh due to CSS change');
			this.refreshMap();
		});
	}

	async setState(state: MapState, result: any) {
		if (this.shouldSaveToHistory(state)) {
			result.history = true;
			this.lastSavedState = Object.assign({}, state);
		}
		await this.setViewState(state, true, false);
		if (this.display.controls)
			this.display.controls.tryToGuessPreset();
	}

	getState() {
		return this.state;
	}

	/** Decides and returns true if the given state change, compared to the last saved state, is substantial
	 * enough to be saved as an Obsidian history state */
	shouldSaveToHistory(newState: MapState) {
		if (!this.settings.saveHistory)
			return false;
		if (!this.lastSavedState)
			return true;
		if (newState.forceHistorySave) {
			newState.forceHistorySave = false;
			return true;
		}
		// If the zoom changed by HISTORY_SAVE_ZOOM_DIFF -- save the history
		if (Math.abs(newState.mapZoom - this.lastSavedState.mapZoom) >= consts.HISTORY_SAVE_ZOOM_DIFF)
			return true;
		// If the previous center is no longer visible -- save the history
		// (this is partially cheating because we use the actual map and not the state object)
		if (this.lastSavedState.mapCenter && !this.display.map.getBounds().contains(this.lastSavedState.mapCenter))
			return true;
		if (newState.tags != this.lastSavedState.tags || newState.chosenMapSource != this.lastSavedState.chosenMapSource)
			return true;
		return false;
	}

	getViewType() { return 'map'; }
	getDisplayText() { return 'Interactive Map View'; }

	isDarkMode(settings: PluginSettings): boolean {
		if (settings.chosenMapMode === 'dark')
			return true;
		if (settings.chosenMapMode === 'light')
			return false;
		// Auto mode - check if the theme is dark
		if ((this.app.vault as any).getConfig('theme') === 'obsidian')
			return true;
		return false;
	}

	async onOpen() {
		this.isOpen = true;
		this.state = this.defaultState;
		this.display.controls = new ViewControls(this.contentEl, this.settings, this.app, this, this.plugin);
		this.contentEl.style.padding = '0px 0px';
		this.display.controls.createControls();
		this.display.mapDiv = createDiv({cls: 'map'}, (el: HTMLDivElement) => {
			el.style.zIndex = '1';
			el.style.width = '100%';
			el.style.height = '100%';
		});
		this.contentEl.append(this.display.mapDiv);
		// Make touch move nicer on mobile
		this.contentEl.addEventListener('touchmove', (ev) => {
			ev.stopPropagation();
		});
		await this.createMap();
		return super.onOpen();
	}

	onClose() {
		this.isOpen = false;
		return super.onClose();
	}

	onResize() {
		this.display.map.invalidateSize();
	}

	public async setViewState(state: MapState, updateControls: boolean, considerAutoFit: boolean) {
		if (state) {
			const newState = mergeStates(this.state, state);
			this.updateTileLayerByState(newState);
			await this.updateMarkersToState(newState);
			if (considerAutoFit && this.settings.autoZoom)
				await this.autoFitMapToMarkers();
			if (updateControls)
				this.display.controls.updateControlsToState();
		}
	}

	updateTileLayerByState(newState: MapState) {
		if (this.display.tileLayer && this.state.chosenMapSource != newState.chosenMapSource) {
			this.display.tileLayer.remove();
			this.display.tileLayer = null;
		}
		this.state.chosenMapSource = newState.chosenMapSource;
		if (!this.display.tileLayer) {
			const isDark = this.isDarkMode(this.settings);
			const chosenMapSource = this.settings.mapSources[this.state.chosenMapSource];
			const attribution = chosenMapSource.urlLight === DEFAULT_SETTINGS.mapSources[0].urlLight ?
				'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' : '';
			let revertMap = false;
			let mapSourceUrl = chosenMapSource.urlLight;
			if (isDark) {
				if (chosenMapSource.urlDark)
					mapSourceUrl = chosenMapSource.urlDark;
				else
					revertMap = true;
			}
			const neededClassName = revertMap ? "dark-mode" : "";
			this.display.tileLayer = new leaflet.TileLayer(mapSourceUrl, {
				maxZoom: 20,
				subdomains:['mt0','mt1','mt2','mt3'],
				attribution: attribution,
				className: neededClassName });
			this.display.map.addLayer(this.display.tileLayer);

			if (!chosenMapSource?.ignoreErrors) {
				let recentTileError = false;
				this.display.tileLayer.on('tileerror', (event: leaflet.TileErrorEvent) => {
					if (!recentTileError) {
						new Notice(`Map view: unable to load map tiles. Try switching the map source using the View controls.`, 20000);
						recentTileError = true;
						setTimeout(() => { recentTileError = false; }, 5000);
					}
				});
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
		this.display.controls?.reload();
		await this.createMap();
		this.updateMarkersToState(this.state, true);
		this.display.controls.updateControlsToState();
	}

	async createMap() {
		// LeafletJS compatability: disable tree-shaking for the full-screen module
		var dummy = leafletFullscreen;
		this.display.map = new leaflet.Map(this.display.mapDiv, {
			center: this.defaultState.mapCenter,
			zoom: this.defaultState.mapZoom,
			zoomControl: false,
			worldCopyJump: true,
			maxBoundsViscosity: 1.0});
		leaflet.control.zoom({
			position: 'topright'
		}).addTo(this.display.map);
		this.updateTileLayerByState(this.state);
		this.display.clusterGroup = new leaflet.MarkerClusterGroup({
			maxClusterRadius: this.settings.maxClusterRadiusPixels ?? DEFAULT_SETTINGS.maxClusterRadiusPixels});
		this.display.map.addLayer(this.display.clusterGroup);

		const suggestor = new LocationSuggest(this.app, this.settings);
		const searchControl = GeoSearchControl({
			provider: suggestor.searchProvider,
			position: 'topright',
			marker: {
				icon: getIconFromOptions(consts.SEARCH_RESULT_MARKER as leaflet.BaseIconOptions)
			},
			style: 'button'});
		this.display.map.addControl(searchControl);
		this.display.map.on('zoomend', (event: leaflet.LeafletEvent) => {
			this.state.mapZoom = this.display.map.getZoom();
			this.state.mapCenter = this.display.map.getCenter();
			this.display?.controls?.invalidateActivePreset();
			const state = this.leaf.getViewState();
			this.leaf.setViewState(state);
		});
		this.display.map.on('moveend', (event: leaflet.LeafletEvent) => {
			this.state.mapCenter = this.display.map.getCenter();
			this.display?.controls?.invalidateActivePreset();
			const state = this.leaf.getViewState();
			this.leaf.setViewState(state);
		});

		if (this.settings.showClusterPreview) {
			this.display.clusterGroup.on('clustermouseover', cluster => {
				let content = this.contentEl.createDiv();
				content.classList.add('clusterPreviewContainer');
				for (const m of cluster.propagatedFrom.getAllChildMarkers()) {
					const marker = m as leaflet.Marker;
					const iconElement = marker.options.icon.createIcon();
					iconElement.classList.add('clusterPreviewIcon');
					content.appendChild(iconElement);
					if (content.children.length >= consts.MAX_CLUSTER_PREVIEW_ICONS)
						break;
				}
				cluster.propagatedFrom.bindPopup(content, {closeButton: true, autoPan: false}).openPopup();
				cluster.propagatedFrom.activePopup = content;
			});
			this.display.clusterGroup.on('clustermouseout', cluster => {
				cluster.propagatedFrom.closePopup();
			});
			this.display.clusterGroup.on('clusterclick', cluster => {
				const state = this.leaf.getViewState();
				// After a cluster click always save the history, the user expects 'back' to really go back
				state.state.forceHistorySave = true;
				this.leaf.setViewState(state);
			});
		}

		// Build the map marker right-click context menu
		this.display.map.on('contextmenu', async (event: leaflet.LeafletMouseEvent) => {
			let mapPopup = new Menu(this.app);
			mapPopup.setNoIcon();
			mapPopup.addItem((item: MenuItem) => {
				const location = `${event.latlng.lat},${event.latlng.lng}`;
				item.setTitle('New note here (inline)');
				item.onClick(async ev => {
					const newFileName = utils.formatWithTemplates(this.settings.newNoteNameFormat);
					const file: TFile = await utils.newNote(this.app, 'multiLocation', this.settings.newNotePath,
						newFileName, location, this.settings.newNoteTemplate);
					this.goToFile(file, ev.ctrlKey, utils.handleNewNoteCursorMarker);
				});
			})
			mapPopup.addItem((item: MenuItem) => {
				const location = `${event.latlng.lat},${event.latlng.lng}`;
				item.setTitle('New note here (front matter)');
				item.onClick(async ev => {
					const newFileName = utils.formatWithTemplates(this.settings.newNoteNameFormat);
					const file: TFile = await utils.newNote(this.app, 'singleLocation', this.settings.newNotePath,
						newFileName, location, this.settings.newNoteTemplate);
					this.goToFile(file, ev.ctrlKey, utils.handleNewNoteCursorMarker);
				});
			})
			mapPopup.addItem((item: MenuItem) => {
				const location = `${event.latlng.lat},${event.latlng.lng}`;
				item.setTitle(`Copy geolocation`);
				item.onClick(_ev => {
					navigator.clipboard.writeText(`[](geo:${location})`);
				});
			});
			mapPopup.addItem((item: MenuItem) => {
				const location = `${event.latlng.lat},${event.latlng.lng}`;
				item.setTitle(`Copy geolocation as front matter`);
				item.onClick(_ev => {
					navigator.clipboard.writeText(`---\nlocation: [${location}]\n---\n\n`);
				});
			});
			mapPopup.addItem((item: MenuItem) => {
				item.setTitle('Open in default app');
				item.onClick(_ev => {
					open(`geo:${event.latlng.lat},${event.latlng.lng}`);
				});
			});
			utils.populateOpenInItems(mapPopup, event.latlng, this.settings);
			mapPopup.showAtPosition(event.originalEvent);
		});
	}

	/**
	 * Set the map state
	 * @param state The map state to set
	 * @param force Force setting the state. Will ignore if the state is old
	 */
	async updateMarkersToState(state: MapState, force: boolean = false) {
		if (this.settings.debug)
			console.time('updateMarkersToState');
		// Get a list of all files matching the tags
		const files = this.getFileListByQuery(state.tags);
		// Build the markers for all files matching the tag
		let newMarkers = await buildMarkers(files, this.settings, this.app);
		// --- BEYOND THIS POINT NOTHING SHOULD BE ASYNC ---
		// Saying it again: do not use 'await' below this line!
		this.state = state;
		this.updateMapMarkers(newMarkers);
		this.display.map.setView(this.state.mapCenter, this.state.mapZoom);
		if (this.settings.debug)
			console.timeEnd('updateMarkersToState');
	}

	/**
	 * Get a list of files containing at least one of the tags
	 * @param tags A list of string tags to match
	 */
	getFileListByQuery(tags: string[]): TFile[] {
		let results: TFile[] = [];
		const allFiles = this.app.vault.getFiles();
		for (const file of allFiles) {
			var match = true;
			if (tags && tags.length > 0) {
				// A tags query exist, file defaults to non-matching and we'll add it if it has one of the tags
				match = false;
				const fileCache = this.app.metadataCache.getFileCache(file);
				if (fileCache && fileCache.tags) {
					const tagsMatch = fileCache.tags.some(tagInFile => tags.indexOf(tagInFile.tag) > -1);
					if (tagsMatch)
						match = true;
				}
			}
			if (match)
				results.push(file);
		}
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
			const existingMarker = this.display.markers.has(marker.id) ?
				this.display.markers.get(marker.id) : null;
			if (existingMarker && existingMarker.isSame(marker)) {
				// This marker exists, so just keep it
				newMarkersMap.set(marker.id, this.display.markers.get(marker.id));
				this.display.markers.delete(marker.id);
			} else {
				// New marker - create it
				marker.mapMarker = this.newLeafletMarker(marker);
				markersToAdd.push(marker.mapMarker);
				newMarkersMap.set(marker.id, marker);
			}
		}
		for (let [key, value] of this.display.markers) {
			markersToRemove.push(value.mapMarker);
		}
		this.display.clusterGroup.addLayers(markersToAdd);
		this.display.clusterGroup.removeLayers(markersToRemove);
		this.display.markers = newMarkersMap;
	}

	private newLeafletMarker(marker: FileMarker) : leaflet.Marker {
		let newMarker = leaflet.marker(marker.location, { icon: marker.icon || new leaflet.Icon.Default() });
		newMarker.on('click', (event: leaflet.LeafletMouseEvent) => {
			this.goToMarker(marker, event.originalEvent.ctrlKey, true);
		});
		newMarker.on('mouseover', (event: leaflet.LeafletMouseEvent) => {
			if (this.settings.showNotePreview) {
				const previewDetails = {
					scroll: marker.fileLine,
					line: marker.fileLine,
					startLoc: {line: marker.fileLine, col: 0, offset: marker.fileLocation} as Loc,
					endLoc: {line: marker.fileLine, col: 0, offset: marker.fileLocation} as Loc
				};
				this.app.workspace.trigger('link-hover', newMarker.getElement(), newMarker.getElement(), marker.file.path, '', previewDetails);
			}
			let content = `<p class="map-view-marker-name">${marker.file.name}</p>`;
			if (marker.extraName)
				content += `<p class="map-view-extra-name">${marker.extraName}</p>`;
			newMarker.bindPopup(content, {closeButton: true, autoPan: false}).openPopup();
		});
		newMarker.on('mouseout', (event: leaflet.LeafletMouseEvent) => {
			newMarker.closePopup();
		});
		newMarker.on('add', (event: leaflet.LeafletEvent) => {
			newMarker.getElement().addEventListener('contextmenu', (ev: MouseEvent) => {
				let mapPopup = new Menu(this.app);
				mapPopup.setNoIcon();
				mapPopup.addItem((item: MenuItem) => {
					item.setTitle('Open note');
					item.onClick(async ev => { this.goToMarker(marker, ev.ctrlKey, true); });
				});
				mapPopup.addItem((item: MenuItem) => {
					item.setTitle('Open geolocation in default app');
					item.onClick(ev => {
						open(`geo:${marker.location.lat},${marker.location.lng}`);
					});
				});
				utils.populateOpenInItems(mapPopup, marker.location, this.settings);
				mapPopup.showAtPosition(ev);
				ev.stopPropagation();
			})
		});
		return newMarker;
	}

	/** Zoom the map to fit all markers on the screen */
	public async autoFitMapToMarkers() {
		if (this.display.markers.size > 0) {
			const locations: leaflet.LatLng[] = Array.from(this.display.markers.values()).map(fileMarker => fileMarker.location);
			this.display.map.fitBounds(leaflet.latLngBounds(locations));
		}
	}

	/**
	 * Open a file in an editor window
	 * @param file The file object to open
	 * @param useCtrlKeyBehavior If true will use the alternative behaviour, as set in the settings
	 * @param editorAction Optional callback to run when the file is opened
	 */
	async goToFile(file: TFile, useCtrlKeyBehavior: boolean, editorAction?: (editor: Editor) => Promise<void>) {
		let leafToUse = this.app.workspace.activeLeaf;
		const defaultDifferentPane = this.settings.markerClickBehavior != 'samePane';
		// Having a pane to reuse means that we previously opened a note in a new pane and that pane still exists (wasn't closed)
		const havePaneToReuse = this.newPaneLeaf && this.newPaneLeaf.view && this.settings.markerClickBehavior != 'alwaysNew';
		if (havePaneToReuse || (defaultDifferentPane && !useCtrlKeyBehavior) || (!defaultDifferentPane && useCtrlKeyBehavior)) {
			// We were instructed to use a different pane for opening the note.
			// We go here in the following cases:
			// 1. An existing pane to reuse exists (the user previously opened it, with or without Ctrl).
			//    In this case we use the pane regardless of the default or of Ctrl, assuming that if a user opened a pane
			//    once, she wants to retain it until it's closed. (I hope no one will treat this as a bug...)
			// 2. The default is to use a different pane and Ctrl is not pressed.
			// 3. The default is to NOT use a different pane and Ctrl IS pressed.
			const someOpenMarkdownLeaf = this.app.workspace.getLeavesOfType('markdown');
			if (havePaneToReuse) {
				// We have an existing pane, that pane still has a view (it was not closed), and the settings say
				// to use a 2nd pane. That's the only case on which we reuse a pane
				this.app.workspace.setActiveLeaf(this.newPaneLeaf);
				leafToUse = this.newPaneLeaf;
			} else if (someOpenMarkdownLeaf.length > 0 && this.settings.markerClickBehavior != 'alwaysNew') {
				// We don't have a pane to reuse but the user wants a new pane and there is currently an open
				// Markdown pane. Let's take control over it and hope it's the right thing to do
				this.app.workspace.setActiveLeaf(someOpenMarkdownLeaf[0]);
				leafToUse = someOpenMarkdownLeaf[0];
				this.newPaneLeaf = leafToUse;
			} else {
				// We need a new pane. We split it the way the settings tell us
				this.newPaneLeaf = this.app.workspace.splitActiveLeaf(this.settings.newPaneSplitDirection || 'horizontal');
				leafToUse = this.newPaneLeaf;
			}
		}
		await leafToUse.openFile(file);
		const editor = await utils.getEditor(this.app, leafToUse);
		if (editor && editorAction)
			await editorAction(editor);
	}

	/**
	 * Open and go to the editor location represented by the marker
	 * @param marker The FileMarker to open
	 * @param useCtrlKeyBehavior If true will use the alternative behaviour, as set in the settings
	 * @param highlight If true will highlight the line
	 */
	async goToMarker(marker: FileMarker, useCtrlKeyBehavior: boolean, highlight: boolean) {
		return this.goToFile(marker.file, useCtrlKeyBehavior,
			async (editor) => { await utils.goToEditorLocation(editor, marker.fileLocation, highlight); });
	}

	/**
	 * Update the map markers with a list of markers not from the removed file plus the markers from the new file.
	 * Run when a file is deleted, renamed or changed.
	 * @param fileRemoved The old file path
	 * @param fileAddedOrChanged The new file data
	 */
	private async updateMarkersWithRelationToFile(fileRemoved: string, fileAddedOrChanged: TAbstractFile, skipMetadata: boolean) {
		if (!this.display.map || !this.isOpen)
			// If the map has not been set up yet then do nothing
			return;
		let newMarkers: FileMarker[] = [];
		// Create an array of all file markers not in the removed file
		for (let [markerId, fileMarker] of this.display.markers) {
			if (fileMarker.file.path !== fileRemoved)
				newMarkers.push(fileMarker);
		}
		if (fileAddedOrChanged && fileAddedOrChanged instanceof TFile)
			// Add file markers from the added file
			await buildAndAppendFileMarkers(newMarkers, fileAddedOrChanged, this.settings, this.app)
		this.updateMapMarkers(newMarkers);
	}

}

