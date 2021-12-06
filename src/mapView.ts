import { App, TAbstractFile, Editor, ButtonComponent, MarkdownView, getAllTags, ItemView, MenuItem, Menu, TFile, TextComponent, DropdownComponent, WorkspaceLeaf } from 'obsidian';
import * as leaflet from 'leaflet';
// Ugly hack for obsidian-leaflet compatability, see https://github.com/esm7/obsidian-map-view/issues/6
// @ts-ignore
import * as leafletFullscreen from 'leaflet-fullscreen';
import '@fortawesome/fontawesome-free/js/all.min';
import 'leaflet/dist/leaflet.css';
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import 'leaflet-geosearch/dist/geosearch.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';

import * as consts from 'src/consts';
import { PluginSettings, DEFAULT_SETTINGS } from 'src/settings';
import { MarkersMap, FileMarker, buildMarkers, getIconFromOptions, buildAndAppendFileMarkers } from 'src/markers';
import { LocationSuggest } from 'src/geosearch';
import MapViewPlugin from 'src/main';
import * as utils from 'src/utils';

type MapState = {
	mapZoom: number;
	mapCenter: leaflet.LatLng;
	tags: string[];
	version: number;
} 

export class MapView extends ItemView {
	private settings: PluginSettings;
	// The private state needs to be updated solely via updateMapToState
	private state: MapState;
	private display = new class {
		map: leaflet.Map;
		clusterGroup: leaflet.MarkerClusterGroup;
		markers: MarkersMap = new Map();
		mapDiv: HTMLDivElement;
		tagsBox: TextComponent;
	};
	private plugin: MapViewPlugin;
	private defaultState: MapState;
	private newPaneLeaf: WorkspaceLeaf;
	private isOpen: boolean = false;

	public onAfterOpen: (map: leaflet.Map, markers: MarkersMap) => any = null;

	constructor(leaf: WorkspaceLeaf, settings: PluginSettings, plugin: MapViewPlugin) {
		super(leaf);
		this.navigation = true;
		this.settings = settings;
		this.plugin = plugin;
		// Create the default state by the configuration
		this.defaultState = {
			mapZoom: this.settings.defaultZoom || consts.DEFAULT_ZOOM,
			mapCenter: this.settings.defaultMapCenter || consts.DEFAULT_CENTER,
			tags: this.settings.defaultTags || consts.DEFAULT_TAGS,
			version: 0
		};
		this.setState = async (state: MapState, result) => {
			if (state) {
				if (!state.version) {
					// We give the given state priority by setting a high version
					state.version = this.plugin.highestVersionSeen + 1;
				}
				if (!state.mapCenter || !state.mapZoom) {
					state.mapCenter = this.defaultState.mapCenter;
					state.mapZoom = this.defaultState.mapZoom;
				}
				await this.updateMapToState(state, false);
			}
		}
		this.getState = (): MapState => {
			return this.state;
		}

		this.app.vault.on('delete', file => this.updateMarkersWithRelationToFile(file.path, null, true));
		this.app.vault.on('rename', (file, oldPath) => this.updateMarkersWithRelationToFile(oldPath, file, true));
		this.app.metadataCache.on('changed', file => this.updateMarkersWithRelationToFile(file.path, file, false));
	}

	getViewType() { return 'map'; }
	getDisplayText() { return 'Interactive Map View'; }

	async onOpen() {
		var that = this;
		this.isOpen = true;
		this.state = this.defaultState;
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
			that.state.tags = tagsBox.split(',').filter(t => t.length > 0);
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

	async createMap() {
		var that = this;
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
		const attribution = this.settings.tilesUrl === DEFAULT_SETTINGS.tilesUrl ?
			'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' : '';
		this.display.map.addLayer(new leaflet.TileLayer(this.settings.tilesUrl, {
			maxZoom: 20,
			subdomains:['mt0','mt1','mt2','mt3'],
			attribution: attribution,
			className: this.settings.darkMode ? "dark-mode" : ""
		}));
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

	// Updates the map to the given state and then sets the state accordingly, but only if the given state version
	// is not lower than the current state version (so concurrent async updates always keep the latest one)
	async updateMapToState(state: MapState, autoFit: boolean = false) {
		if (this.settings.debug)
			console.time('updateMapToState');
		const files = this.getFileListByQuery(state.tags);
		let newMarkers = await buildMarkers(files, this.settings, this.app);
		if (state.version < this.state.version) {
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
			newMarker.bindPopup(content, {closeButton: false, autoPan: false}).openPopup();
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

	async autoFitMapToMarkers() {
		if (this.display.markers.size > 0) {
			const locations: leaflet.LatLng[] = Array.from(this.display.markers.values()).map(fileMarker => fileMarker.location);
			console.log(`Auto fit by state:`, this.state);
			this.display.map.fitBounds(leaflet.latLngBounds(locations));
		}
	}

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
		const editor = await this.getEditor(leafToUse);
		if (editor && editorAction)
			await editorAction(editor);
	}

	async goToMarker(marker: FileMarker, useCtrlKeyBehavior: boolean, highlight: boolean) {
		return this.goToFile(marker.file, useCtrlKeyBehavior,
			async (editor) => { await utils.goToEditorLocation(editor, marker.fileLocation, highlight); });
	}

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

	async getEditor(leafToUse?: WorkspaceLeaf) : Promise<Editor> {
		let view = leafToUse && leafToUse.view instanceof MarkdownView ?
			leafToUse.view :
			this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view)
			return view.editor;
		return null;
	}

	private async updateMarkersWithRelationToFile(fileRemoved: string, fileAddedOrChanged: TAbstractFile, skipMetadata: boolean) {
		if (!this.display.map || !this.isOpen)
			return;
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

