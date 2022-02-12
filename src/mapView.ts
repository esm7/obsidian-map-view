import { TAbstractFile, Editor, ButtonComponent, getAllTags, ItemView, MenuItem, Menu, TFile, TextComponent, DropdownComponent, WorkspaceLeaf } from 'obsidian';
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
import { PluginSettings, MapLightDark, DEFAULT_SETTINGS } from 'src/settings';
import { MarkersMap, FileMarker, buildMarkers, getIconFromOptions, buildAndAppendFileMarkers } from 'src/markers';
import { LocationSuggest } from 'src/geosearch';
import MapViewPlugin from 'src/main';
import * as utils from 'src/utils';

/**
 * The state of the map instance
 */
type MapState = {
	/**
	 * The zoom level of the map
	 */
	mapZoom: number;
	/**
	 * The viewed center of the map
	 */
	mapCenter: leaflet.LatLng;
	/**
	 * The tags that the user specified
	 */
	tags: string[];
	/**
	 * The version of the map to track if data is old
	 */
	version: number;
}

/**
 * The map viewer class
 */
export class MapView extends ItemView {
	readonly settings: PluginSettings;
	// The private state needs to be updated solely via updateMapToState
	private state: MapState;
	/**
	 * The map data
	 * @private
	 */
	private display = new class {
		/**
		 * The leaflet map instance for this map viewer
		 */
		map: leaflet.Map;
		/**
		 * The cluster management class
		 */
		clusterGroup: leaflet.MarkerClusterGroup;
		/**
		 * The markers currently on the map
		 */
		markers: MarkersMap = new Map();
		/**
		 * The HTML element containing the map controls
		 */
		controlsDiv: HTMLDivElement;
		/**
		 * The HTML element holding the map
		 */
		mapDiv: HTMLDivElement;
		/**
		 * The HTML text entry the user can type tags in
		 */
		tagsBox: TextComponent;
	};
	/**
	 * The plugin instance
	 * @private
	 */
	private plugin: MapViewPlugin;
	/**
	 * The map state
	 * @private
	 */
	private defaultState: MapState;
	/**
	 * The leaf (obsidian sub-window) that a note was last opened in.
	 * This is cached so that it can be reused when opening notes in the future
	 * @private
	 */
	private newPaneLeaf: WorkspaceLeaf;
	/**
	 * Has the view been opened
	 * @private
	 */
	private isOpen: boolean = false;

	/**
	 * TODO: unused what does this do?
	 */
	public onAfterOpen: (map: leaflet.Map, markers: MarkersMap) => any = null;

	/**
	 * Construct a new map instance
	 * @param leaf The leaf the map should be put in
	 * @param settings The plugin settings
	 * @param plugin The plugin instance
	 */
	constructor(leaf: WorkspaceLeaf, settings: PluginSettings, plugin: MapViewPlugin) {
		super(leaf);
		this.navigation = true;  // TODO: unused?
		this.settings = settings;
		this.plugin = plugin;
		// Create the default state by the configuration
		this.defaultState = {
			mapZoom: this.settings.defaultZoom || consts.DEFAULT_ZOOM,
			mapCenter: this.settings.defaultMapCenter || consts.DEFAULT_CENTER,
			tags: this.settings.defaultTags || consts.DEFAULT_TAGS,
			version: 0
		};

		// Listen to file changes so we can rebuild the UI
		this.app.vault.on(
			'delete',
			file => this.onFileChange(file.path, null, true)
		);
		this.app.vault.on(
			'rename',
			(file, oldPath) => this.onFileChange(oldPath, file, true)
		);
		this.app.metadataCache.on(
			'changed',
			file => this.onFileChange(file.path, file, false)
		);
		this.app.workspace.on('css-change', () => {
			console.log('Map view: map refresh due to CSS change');
			this.refreshMap();
		});
	}

	/**
	 * Set the maps state. Used as part of the forwards/backwards arrows
	 * @param state The map state to set
	 * @param result
	 */
	async setState(state: MapState, result: ViewStateResult): Promise<void> {
		if (state) {
			if (!state.version) {
				// We give the given state priority by setting a high version
				state.version = this.plugin.highestVersionSeen + 1;
			}
			if (!state.mapCenter || !state.mapZoom) {
				state.mapCenter = this.defaultState.mapCenter;
				state.mapZoom = this.defaultState.mapZoom;
			}
			await this.setMapState(state, false);
		}
	}

	/**
	 * Get the maps state. Used as part of the forwards/backwards arrows
	 */
	async getState(): Promise<MapState> {
		return this.state;
	}

	/**
	 * The name of the view type
	 */
	getViewType() { return consts.MAP_VIEW_NAME; }

	/**
	 * The display name for the view
	 */
	getDisplayText() { return 'Interactive Map View'; }

	/**
	 * Is the map in dark mode
	 */
	isDarkMode(): boolean {
		if (this.settings.chosenMapMode === 'dark')
			return true;
		if (this.settings.chosenMapMode === 'light')
			return false;
		// Auto mode - check if the theme is dark
		if ((this.app.vault as any).getConfig('theme') === 'obsidian')
			return true;
		return false;
	}

	public updateMapSources = () => {};

	/**
	 * Run when the view is opened
	 */
	async onOpen() {
		this.isOpen = true;
		this.state = this.defaultState;
		this.display.controlsDiv = this.createControls();
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

	createControls() {
		let controlsDiv = createDiv({
			'cls': 'graph-controls'
		});
		let filtersDiv = controlsDiv.createDiv({'cls': 'graph-control-div'});
		filtersDiv.innerHTML = `
			<input id="filtersCollapsible" class="toggle" type="checkbox">
			<label for="filtersCollapsible" class="lbl-toggle">Filters</label>
			`;
		const filtersButton = filtersDiv.getElementsByClassName('toggle')[0] as HTMLInputElement;
		filtersButton.checked = this.settings.mapControls.filtersDisplayed;
		filtersButton.onclick = async () => {
			this.settings.mapControls.filtersDisplayed = filtersButton.checked;
			this.plugin.saveSettings();
		}
		let filtersContent = filtersDiv.createDiv({'cls': 'graph-control-content'});
		this.display.tagsBox = new TextComponent(filtersContent);
		this.display.tagsBox.setPlaceholder('Tags, e.g. "#one,#two"');
		this.display.tagsBox.onChange(async (tagsBox: string) => {
			this.state.tags = tagsBox.split(',').filter(t => t.length > 0);
			await this.updateMapToState(this.state, this.settings.autoZoom);
		});
		let tagSuggestions = new DropdownComponent(filtersContent);
		tagSuggestions.setValue('Quick add tag');
		tagSuggestions.addOption('', 'Quick add tag');
		for (const tagName of this.getAllTagNames())
			tagSuggestions.addOption(tagName, tagName);
		tagSuggestions.onChange(value => {
			let currentTags = this.display.tagsBox.getValue();
			if (currentTags.indexOf(value) < 0) {
				this.display.tagsBox.setValue(currentTags.split(',').filter(tag => tag.length > 0).concat([value]).join(','));
			}
			tagSuggestions.setValue('Quick add tag');
			this.display.tagsBox.inputEl.focus();
			this.display.tagsBox.onChanged();
		});

		let viewDiv = controlsDiv.createDiv({'cls': 'graph-control-div'});
		viewDiv.innerHTML = `
			<input id="viewCollapsible" class="toggle" type="checkbox">
			<label for="viewCollapsible" class="lbl-toggle">View</label>
			`;
		const viewButton = viewDiv.getElementsByClassName('toggle')[0] as HTMLInputElement;
		viewButton.checked = this.settings.mapControls.viewDisplayed;
		viewButton.onclick = async () => {
			this.settings.mapControls.viewDisplayed = viewButton.checked;
			this.plugin.saveSettings();
		}
		let viewDivContent = viewDiv.createDiv({'cls': 'graph-control-content'});
		let mapSource = new DropdownComponent(viewDivContent);
		for (const [index, source] of this.settings.mapSources.entries()) {
			mapSource.addOption(index.toString(), source.name);
		}
		this.updateMapSources();
		mapSource.onChange(async (value: string) => {
			this.settings.chosenMapSource = parseInt(value);
			await this.plugin.saveSettings();
			this.refreshMap();
		});
		const chosenMapSource = this.settings.chosenMapSource ?? 0;
		mapSource.setValue(chosenMapSource.toString());
		let sourceMode = new DropdownComponent(viewDivContent);
		sourceMode.addOptions({auto: 'Auto', light: 'Light', dark: 'Dark'})
			.setValue(this.settings.chosenMapMode ?? 'auto')
			.onChange(async value => {
				this.settings.chosenMapMode = value as MapLightDark;
				await this.plugin.saveSettings();
				this.refreshMap();
			});
		let goDefault = new ButtonComponent(viewDivContent);
		goDefault
			.setButtonText('Reset')
			.setTooltip('Reset the view to the defined default.')
			.onClick(async () => {
				let newState = {
					mapZoom: this.settings.defaultZoom || consts.DEFAULT_ZOOM,
					mapCenter: this.settings.defaultMapCenter || consts.DEFAULT_CENTER,
					tags: this.settings.defaultTags || consts.DEFAULT_TAGS,
					version: this.state.version + 1
				};
				await this.updateMapToState(newState, false);
			});
		let fitButton = new ButtonComponent(viewDivContent);
		fitButton
			.setButtonText('Fit')
			.setTooltip('Set the map view to fit all currently-displayed markers.')
			.onClick(() => this.autoFitMapToMarkers());
		let setDefault = new ButtonComponent(viewDivContent);
		setDefault
			.setButtonText('Set as Default')
			.setTooltip('Set this view (map state & filters) as default.')
			.onClick(async () => {
				this.settings.defaultZoom = this.state.mapZoom;
				this.settings.defaultMapCenter = this.state.mapCenter;
				this.settings.defaultTags = this.state.tags;
				await this.plugin.saveSettings();
			});
		this.contentEl.style.padding = '0px 0px';
		this.contentEl.append(controlsDiv);
		return controlsDiv;
	}

	/**
	 * On view close
	 */
	onClose() {
		this.isOpen = false;
		return super.onClose();
	}

	/**
	 * On window resize
	 */
	onResize() {
		this.display.map.invalidateSize();
	}

	async refreshMap() {
		// remove all event listeners
		this.display?.map?.off();
		// destroy the map and event listeners
		this.display?.map?.remove();
		// clear the marker storage
		this.display?.markers?.clear();
		this.display?.controlsDiv.remove();
		this.display.controlsDiv = this.createControls();
		this.createMap();
		this.updateMapToState(this.state, false, true);
	}

	async createMap() {
		const isDark = this.isDarkMode();
		// LeafletJS compatability: disable tree-shaking for the full-screen module
		var dummy = leafletFullscreen;
		this.display.map = new leaflet.Map(
			this.display.mapDiv,
			{
				center: this.defaultState.mapCenter,
				zoom: this.defaultState.mapZoom,
				zoomControl: false,
				worldCopyJump: true,
				maxBoundsViscosity: 1.0
			}
		);
		leaflet.control.zoom({
			position: 'topright'
		}).addTo(this.display.map);
		const chosenMapSource = this.settings.mapSources[this.settings.chosenMapSource ?? 0];
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
		this.display.map.addLayer(
			new leaflet.TileLayer(mapSourceUrl, {
				maxZoom: 25,
				maxNativeZoom: 19,
				subdomains:['mt0','mt1','mt2','mt3'],
				attribution: attribution,
				className: revertMap ? "dark-mode" : ""
			})
		);
		this.display.clusterGroup = new leaflet.MarkerClusterGroup({
			maxClusterRadius: this.settings.maxClusterRadiusPixels ?? DEFAULT_SETTINGS.maxClusterRadiusPixels
		});
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
		});
		this.display.map.on('moveend', (event: leaflet.LeafletEvent) => {
			this.state.mapCenter = this.display.map.getCenter();
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
	 * Updates the map to the given state and then sets the state accordingly, but only if the given state version
	 * is not lower than the current state version (so concurrent async updates always keep the latest one)
	 * @param state
	 * @param autoFit
	 * @param force
	 */
	async updateMapToState(state: MapState, autoFit: boolean = false, force: boolean = false) {
		if (this.settings.debug)
			console.time('updateMapToState');
		const files = this.getFileListByQuery(state.tags);
		let newMarkers = await buildMarkers(files, this.settings, this.app);
		if (state.version < this.state.version && !force) {
			// If the state we were asked to update is old (e.g. because while we were building markers a newer instance
			// of the method was called), cancel the update
			return;
		}
		// --- BEYOND THIS POINT NOTHING SHOULD BE ASYNC ---
		// Saying it again: do not use 'await' below this line!
		this.state = state;
		this.plugin.highestVersionSeen = Math.max(this.plugin.highestVersionSeen, this.state.version);
		this.updateMapMarkers(newMarkers);
		this.state.tags = this.state.tags || [];
		this.display.tagsBox.setValue(this.state.tags.filter(tag => tag.length > 0).join(','));
		if (this.state.mapCenter && this.state.mapZoom)
			this.display.map.setView(this.state.mapCenter, this.state.mapZoom);
		if (autoFit)
			this.autoFitMapToMarkers();
		if (this.settings.debug)
			console.timeEnd('updateMapToState');
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
	 * Remove markers that have changed or been removed and add the new ones
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
				marker.initGeoLayer(this)
				markersToAdd.push(marker.geoLayer);
				newMarkersMap.set(marker.id, marker);
			}
		}
		for (let [key, value] of this.display.markers) {
			markersToRemove.push(value.geoLayer);
		}
		this.display.clusterGroup.addLayers(markersToAdd);
		this.display.clusterGroup.removeLayers(markersToRemove);

		this.display.markers = newMarkersMap;
	}

	/**
	 * Zoom the map to fit all markers on the screen
	 */
	async autoFitMapToMarkers() {
		if (this.display.markers.size > 0) {
			const locations: leaflet.LatLng[] = Array.from(this.display.markers.values()).map(fileMarker => fileMarker.location);
			console.log(`Auto fit by state:`, this.state);
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
		return this.goToFile(
			marker.file,
			useCtrlKeyBehavior,
			async (editor) => { await utils.goToEditorLocation(editor, marker.fileLocation, highlight); }
		);
	}

	/**
	 * Get a list of all tags in the archive
	 */
	getAllTagNames() : string[] {
		let tags: string[] = [];
		const allFiles = this.app.vault.getFiles();
		for (const file of allFiles) {
			const fileCache = this.app.metadataCache.getFileCache(file);
			if (fileCache && fileCache.tags) {
				const fileTagNames = getAllTags(fileCache) || [];
				tags = tags.concat(fileTagNames.filter(tagName => tags.indexOf(tagName) < 0));
			}
		}
		tags = tags.sort();
		return tags;
	}

	/**
	 * Run when a file is deleted, renamed or changed
	 * @param fileRemoved The old file path
	 * @param fileAddedOrChanged The new file data
	 * @param skipMetadata currently unused TODO: what is this for?
	 * @private
	 */
	private async onFileChange(fileRemoved: string, fileAddedOrChanged: TAbstractFile, skipMetadata: boolean): Promise<void> {
		if (!this.display.map || !this.isOpen) {
			// If the map has not been set up yet then do nothing
			return;
		}
		let newMarkers: FileMarker[] = [];
		for (let [markerId, fileMarker] of this.display.markers) {
			if (fileMarker.file.path !== fileRemoved)
				newMarkers.push(fileMarker);
		}
		if (fileAddedOrChanged && fileAddedOrChanged instanceof TFile)
			await buildAndAppendFileMarkers(newMarkers, fileAddedOrChanged, this.settings, this.app)
		this.updateMapMarkers(newMarkers);
	}
}
