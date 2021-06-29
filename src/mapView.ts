import { App, ButtonComponent, MarkdownView, getAllTags, View, MenuItem, Menu, TFile, TextComponent, DropdownComponent, WorkspaceLeaf } from 'obsidian';
import * as leaflet from 'leaflet';
import 'leaflet-extra-markers';
import 'leaflet-extra-markers/dist/css/leaflet.extra-markers.min.css';
import '@fortawesome/fontawesome-free/js/all.min';
import 'leaflet/dist/leaflet.css';
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import 'leaflet-geosearch/dist/geosearch.css';

import * as consts from 'src/consts';
import { PluginSettings, DEFAULT_SETTINGS } from 'src/settings';
import { MarkersMap, FileMarker, buildMarkers } from 'src/markers';
import MapViewPlugin  from 'src/main';

// TODO pass settings
// function mapViewCreator(leaf: WorkspaceLeaf) {
// 	return new MapView(leaf, DEFAULT_SETTINGS);
// }

export class MapView extends View {
	private settings: PluginSettings;
	private map: leaflet.Map;
	private markers: MarkersMap = new Map();
	private currentTags: string[] = [];
	public onAfterOpen: (map: leaflet.Map, markers: MarkersMap) => any = null;
	private mapDiv: HTMLDivElement;
	private plugin: MapViewPlugin;
	private tagsBox: TextComponent;

	constructor(leaf: WorkspaceLeaf, settings: PluginSettings, plugin: MapViewPlugin) {
		super(leaf);
		this.settings = settings;
		this.plugin = plugin;
	}

	public zoomToLocation(location: leaflet.LatLng) {
		this.map.setView(location, this.settings.zoomOnGoFromNote);
	}

	getViewType() { return 'map'; }
	getDisplayText() { return 'Interactive Map View'; }

	onOpen() {
		var that = this;
		let controlsDiv = createDiv({
			'cls': 'graph-controls',
			'text': 'Filters'
		}, (el: HTMLDivElement) => {
			el.style.position = 'fixed';
			el.style.zIndex = '2';
		});
		this.tagsBox = new TextComponent(controlsDiv);
		this.tagsBox.setPlaceholder('Tags, e.g. "#one,#two"');
		this.tagsBox.onChange(async (tagsBox: string) => {
			that.currentTags = tagsBox.split(',').filter(t => t.length > 0);
			await this.updateMap();
			if (this.settings.autoZoom)
				await this.autoFitMapToMarkers();
		});
		let tagSuggestions = new DropdownComponent(controlsDiv);
		tagSuggestions.setValue('Quick add tag');
		tagSuggestions.addOption('', 'Quick add tag');
		for (const tagName of this.getAllTagNames())
			tagSuggestions.addOption(tagName, tagName);
		tagSuggestions.onChange(value => {
			let currentTags = this.tagsBox.getValue();
			if (currentTags.indexOf(value) < 0) {
				this.tagsBox.setValue(currentTags.split(',').filter(tag => tag.length > 0).concat([value]).join(','));
			}
			tagSuggestions.setValue('Quick add tag');
			this.tagsBox.inputEl.focus();
			this.tagsBox.onChanged();
		});
		let fitButton = new ButtonComponent(controlsDiv);
		fitButton
			.setButtonText('Fit')
			.setTooltip('Set the map view to fit all currently-displayed markers.')
			.onClick(() => this.autoFitMapToMarkers());
		let setDefault = new ButtonComponent(controlsDiv);
		setDefault
			.setButtonText('Set as Default')
			.setTooltip('Set this view (map state & filters) as default.')
			.onClick(async () => {
				this.settings.defaultZoom = this.map.getZoom();
				this.settings.defaultMapCenter = this.map.getCenter();
				this.settings.defaultTags = this.currentTags;
				await this.plugin.saveSettings();
			});
		this.containerEl.append(controlsDiv);
		this.mapDiv = createDiv({cls: 'map'}, (el: HTMLDivElement) => {
			el.style.zIndex = '1';
			el.style.width = '100%';
			el.style.height = '100%';
		});
		this.containerEl.append(this.mapDiv);

		this.createMap();

		window.addEventListener('load', async () => {
			await this.updateMap();
			this.autoFitMapToMarkers();
		});
		return super.onOpen();
	}

	onResize() {
		this.map.invalidateSize();
	}

	async createMap() {
		var that = this;
		this.map = new leaflet.Map(this.mapDiv, {
			center: new leaflet.LatLng(40.731253, -73.996139),
			zoom: 13,
			zoomControl: false});
		leaflet.control.zoom({
			position: 'topright'
		}).addTo(this.map);
		const attribution = this.settings.tilesUrl === DEFAULT_SETTINGS.tilesUrl ?
			'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' : '';
		this.map.addLayer(new leaflet.TileLayer(this.settings.tilesUrl, {
			maxZoom: 20,
			subdomains:['mt0','mt1','mt2','mt3'],
			attribution: attribution,
			className: this.settings.darkMode ? "dark-mode" : ""
		}));
		const searchControl = GeoSearchControl({
			provider: new OpenStreetMapProvider(),
			position: 'topright',
			marker: {
				icon: consts.SEARCH_RESULT_MARKER
			},
			style: 'button'});
		this.map.addControl(searchControl);
		this.map.on('contextmenu', async (event: leaflet.LeafletMouseEvent) => {
			let mapPopup = new Menu(this.app);
			mapPopup.setNoIcon();
			mapPopup.addItem((item: MenuItem) => {
				const location = `${event.latlng.lat},${event.latlng.lng}`;
				item.setTitle(`Copy location as coordinates`);
				item.onClick(_ev => {
					navigator.clipboard.writeText(location);
				});
			});
			mapPopup.addItem((item: MenuItem) => {
				const location = `${event.latlng.lat},${event.latlng.lng}`;
				item.setTitle(`Copy location as front matter`);
				item.onClick(_ev => {
					navigator.clipboard.writeText(`---\nlocation: [${location}]\n---\n\n`);
				});
			});
			mapPopup.addItem((item: MenuItem) => {
				const location = `${event.latlng.lat},${event.latlng.lng}`;
				item.setTitle(`Copy location as inline`);
				item.onClick(_ev => {
					navigator.clipboard.writeText(`\`location: [${location}]\``);
				});
			});
			mapPopup.addItem((item: MenuItem) => {
				item.setTitle('Open in Google Maps');
				item.onClick(_ev => {
					open(`https://maps.google.com/?q=${event.latlng.lat},${event.latlng.lng}`);
				});
			});
			mapPopup.showAtPosition(event.originalEvent);
		});
		this.map.whenReady(async () => {
			if (this.settings.defaultTags) {
				this.currentTags = this.settings.defaultTags;
				this.tagsBox.setValue(this.currentTags.filter(tag => tag.length > 0).join(','));
			}
			await that.updateMap();
			if (this.settings.defaultZoom && this.settings.defaultMapCenter)
				this.map.setView(this.settings.defaultMapCenter, this.settings.defaultZoom);
			else
				this.autoFitMapToMarkers();
			if (this.onAfterOpen != null)
				this.onAfterOpen(this.map, this.markers);
		})

	}

	async updateMap() {
		const files = this.getFileListByQuery(this.currentTags);
		let newMarkers = await buildMarkers(files, this.settings, this.app);
		this.updateMapMarkers(newMarkers);
	}

	getFileListByQuery(tags: string[]): TFile[] {
		let results: TFile[] = [];
		const allFiles = this.app.vault.getFiles();
		for (const file of allFiles) {
			var match = true;
			if (tags.length > 0) {
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
		for (let marker of newMarkers) {
			if (this.markers.has(marker.id)) {
				// This marker exists, so just keep it
				// TODO: check if its string or marker has changed
				newMarkersMap.set(marker.id, this.markers.get(marker.id));
				this.markers.delete(marker.id);
			} else {
				// New marker - create it
				marker.mapMarker = leaflet.marker(marker.location, { icon: marker.icon || new leaflet.Icon.Default() })
					.addTo(this.map)
					.bindTooltip(marker.file.name);
				marker.mapMarker.on('click', (event: leaflet.LeafletEvent) => {
					this.goToMarker(marker);
				});
				marker.mapMarker.getElement().addEventListener('contextmenu', (ev: MouseEvent) => {
					let mapPopup = new Menu(this.app);
					mapPopup.setNoIcon();
					mapPopup.addItem((item: MenuItem) => {
						item.setTitle('Open note');
						item.onClick(async ev => { this.goToMarker(marker); });
					});
					mapPopup.addItem((item: MenuItem) => {
						item.setTitle('Open in Google Maps');
						item.onClick(ev => {
							open(`https://maps.google.com/?q=${marker.location.lat},${marker.location.lng}`);
						});
					});
					mapPopup.showAtPosition(ev);
					ev.stopPropagation();
				})
				newMarkersMap.set(marker.id, marker);
			}
		}
		for (let [key, value] of this.markers) {
			value.mapMarker.removeFrom(this.map);
		}
		this.markers = newMarkersMap;
	}

	async autoFitMapToMarkers() {
		if (this.markers.size > 0) {
			const locations: leaflet.LatLng[] = Array.from(this.markers.values()).map(fileMarker => fileMarker.location);
			this.map.fitBounds(leaflet.latLngBounds(locations));
		}
	}

	async goToMarker(marker: FileMarker) {
		await this.app.workspace.activeLeaf.openFile(marker.file);
		const editor = this.getEditor();
		if (editor) {
			if (marker.fileLocation)
				editor.setCursor(editor.posFromIndex(marker.fileLocation));
			editor.focus();
		}
	}

	getAllTagNames() : string[] {
		let tags: string[] = [];
		const allFiles = this.app.vault.getFiles();
		for (const file of allFiles) {
			const fileCache = this.app.metadataCache.getFileCache(file);
			if (fileCache && fileCache.tags) {
				const fileTagNames = getAllTags(fileCache);
				tags = tags.concat(fileTagNames.filter(tagName => tags.indexOf(tagName) < 0));
			}
		}
		tags = tags.sort();
		return tags;
	}

	getEditor() {
		var view = this.app.workspace.activeLeaf.view;
		if (view.getViewType() == 'markdown') {
			var markdownView = view as MarkdownView;
			var cmEditor = markdownView.sourceMode.cmEditor;
			return cmEditor;
		}
		return null;
	}
}

