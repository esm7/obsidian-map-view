import { App, TAbstractFile, Editor, ItemView, MenuItem, Menu, TFile, WorkspaceLeaf } from 'obsidian';
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

/** The map viewer class */
export class MapView extends ItemView {
	/** The settings for the plugin */
	private settings: PluginSettings;
	/** The private map state. Must only be updated in updateMarkersToState */
	private state: MapState;
	/** The map data */
	private display = new class {
		/** The HTML element holding the map */
		mapDiv: HTMLDivElement;
		/** The leaflet map instance for this map viewer */
		map: leaflet.Map;
		tileLayer: leaflet.TileLayer;
		/** The cluster management class */
		clusterGroup: leaflet.MarkerClusterGroup;
		/** The markers currently on the map */
		markers: MarkersMap = new Map();
		controls: ViewControls;
	};
	/** The plugin instance */
	private plugin: MapViewPlugin;
	/** The default map state */
	private defaultState: MapState;
	/**
	 * The leaf (obsidian sub-window) that a note was last opened in.
	 * This is cached so that it can be reused when opening notes in the future
	 */
	private newPaneLeaf: WorkspaceLeaf;
	/** Has the view been opened */
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
		this.setState = async (state: MapState, result) => {
			await this.setViewState(state, true, false);
			if (this.display.controls)
				this.display.controls.tryToGuessPreset();
		}
		this.getState = (): MapState => {
			return this.state;
		}

		// Listen to file changes so we can rebuild the UI
		this.app.vault.on('delete', file => this.updateMarkersWithRelationToFile(file.path, null, true));
		this.app.vault.on('rename', (file, oldPath) => this.updateMarkersWithRelationToFile(oldPath, file, true));
		this.app.metadataCache.on('changed', file => this.updateMarkersWithRelationToFile(file.path, file, false));
		this.app.workspace.on('css-change', () => {
			console.log('Map view: map refresh due to CSS change');
			this.refreshMap();
		});
	}

	/** The name of the view type */
	getViewType() { return 'map'; }

	/** The display name for the view */
	getDisplayText() { return 'Interactive Map View'; }

	/** Is the map in dark mode */
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

	/** Run when the view is opened */
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

	/** On view close */
	onClose() {
		this.isOpen = false;
		return super.onClose();
	}

	/** On window resize */
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
		}
	}

	async refreshMap() {
		this.display?.tileLayer?.remove();
		this.display.tileLayer = null;
		// remove all event listeners
		this.display?.map?.off();
		// destroy the map and event listeners
		this.display?.map?.remove();
		// clear the marker storage
		this.display?.markers?.clear();
		this.display?.controls?.controlsDiv?.remove();
		this.display.controls?.reload();
		await this.createMap();
		this.updateMarkersToState(this.state, true);
		this.display.controls.updateControlsToState();
	}

	/** Create the leaflet map */
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
			this.display?.controls?.invalidateActivePreset();
		});
		this.display.map.on('moveend', (event: leaflet.LeafletEvent) => {
			this.state.mapCenter = this.display.map.getCenter();
			this.display?.controls?.invalidateActivePreset();
		});
		// --- Work in progress ---
		// this.display.clusterGroup.on('clustermouseover', cluster => {
		// 	console.log(cluster.propagatedFrom.getAllChildMarkers());
		// 	let content = this.contentEl.createDiv();
		// 	for (const marker of cluster.propagatedFrom.getAllChildMarkers()) {
		// 		console.log(marker);
		// 		const iconElement = marker.options.icon.createIcon();
		// 		let style = iconElement.style;
		// 		style.marginLeft = style.marginTop = '0';
		// 		style.position = 'relative';
		// 		content.appendChild(iconElement);
		// 	}
		// 	cluster.propagatedFrom.bindPopup(content, {closeButton: false, autoPan: false}).openPopup();
		// 	cluster.propagatedFrom.activePopup = content;
		// });
		// this.display.clusterGroup.on('clustermouseout', cluster => {
		// 	// cluster.propagatedFrom.closePopup();
		// });

		// build the right click context menu
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
	 * Set the map state if the state version is not lower than the current state version
	 * (so concurrent async updates always keep the latest one)
	 * @param state The map state to set
	 * @param force Force setting the state. Will ignore if the state is old
	 */
	async updateMarkersToState(state: MapState, force: boolean = false) {
		if (this.settings.debug)
			console.time('updateMarkersToState');
		// get a list of all files matching the tags
		const files = this.getFileListByQuery(state.tags);
		// build the tags for all files matching the tag
		let newMarkers = await buildMarkers(files, this.settings, this.app);
		// --- BEYOND THIS POINT NOTHING SHOULD BE ASYNC ---
		// Saying it again: do not use 'await' below this line!
		this.state = state;
		this.updateMapMarkers(newMarkers);
		if (this.state.mapCenter && this.state.mapZoom)
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
	 * Set the markers on the map.
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
			let content = `<p class="map-view-marker-name">${marker.file.name}</p>`;
			if (marker.extraName)
				content += `<p class="map-view-extra-name">${marker.extraName}</p>`;
			if (marker.snippet)
				content += `<p class="map-view-marker-snippet">${marker.snippet}</p>`;
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
	 * @param file The file descriptor to open
	 * @param useCtrlKeyBehavior If true will open the file in a different editor instance
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
	 * Open the marker in an editor instance
	 * @param marker The file marker to open
	 * @param useCtrlKeyBehavior If true the file will be opened in a new instance
	 * @param highlight If true will highlight the line
	 */
	async goToMarker(marker: FileMarker, useCtrlKeyBehavior: boolean, highlight: boolean) {
		return this.goToFile(marker.file, useCtrlKeyBehavior,
			async (editor) => { await utils.goToEditorLocation(editor, marker.fileLocation, highlight); });
	}

	/**
	 * Run when a file is deleted, renamed or changed
	 * @param fileRemoved The old file path
	 * @param fileAddedOrChanged The new file data
	 * @param skipMetadata currently unused TODO: what is this for?
	 */
	private async updateMarkersWithRelationToFile(fileRemoved: string, fileAddedOrChanged: TAbstractFile, skipMetadata: boolean) {
		if (!this.display.map || !this.isOpen)
			// If the map has not been set up yet then do nothing
			return;
		let newMarkers: FileMarker[] = [];
		// create an array of all file markers not in the removed file
		for (let [markerId, fileMarker] of this.display.markers) {
			if (fileMarker.file.path !== fileRemoved)
				newMarkers.push(fileMarker);
		}
		if (fileAddedOrChanged && fileAddedOrChanged instanceof TFile)
			// add file markers from the added file
			await buildAndAppendFileMarkers(newMarkers, fileAddedOrChanged, this.settings, this.app)
		this.updateMapMarkers(newMarkers);
	}

}

