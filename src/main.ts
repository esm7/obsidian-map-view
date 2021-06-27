import { addIcon, ButtonComponent, MarkdownView, getAllTags, App, View, Notice, MenuItem, Menu, TFile, Plugin, TextComponent, DropdownComponent, WorkspaceLeaf, PluginSettingTab, Setting, TAbstractFile } from 'obsidian';
import * as leaflet from 'leaflet';
import * as path from 'path';
import 'leaflet-extra-markers';
import 'leaflet-extra-markers/dist/css/leaflet.extra-markers.min.css';
import '@fortawesome/fontawesome-free/js/all.min';
import 'leaflet/dist/leaflet.css';
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import 'leaflet-geosearch/dist/geosearch.css';
import * as consts from 'src/consts';

const DEBUG_PRINTS = false;

type PluginSettings = {
	darkMode: boolean;
	markerIcons: Record<string, any>;
	zoomOnGoFromNote: number;
	tilesUrl: string;
	defaultMapCenter?: leaflet.LatLng;
	defaultZoom?: number;
	defaultTags?: string[];
	autoZoom: boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
	darkMode: false,
	markerIcons: {
		"default": {"prefix": "fas", "icon": "fa-circle", "markerColor": "blue"},
		"#trip": {"prefix": "fas", "icon": "fa-hiking", "markerColor": "green"},
		"#trip-water": {"prefix": "fas", "markerColor": "blue"},
		"#dogs": {"prefix": "fas", "icon": "fa-paw"},
	},
	zoomOnGoFromNote: 15,
	tilesUrl: consts.TILES_URL_GOOGLE,
	autoZoom: true
};

function getFrontMatterLocation(file: TFile, app: App) : leaflet.LatLng {
	const fileCache = app.metadataCache.getFileCache(file);
	const frontMatter = fileCache?.frontmatter;
	if (frontMatter && frontMatter?.location && frontMatter.location.length == 2)
		return new leaflet.LatLng(frontMatter.location[0], frontMatter.location[1]);
	return null;
}

export default class MapViewPlugin extends Plugin {
	settings: PluginSettings;

	async onload() {
		addIcon('globe', consts.RIBBON_ICON);

		await this.loadSettings();

		this.addRibbonIcon('globe', 'Open map view', () => {
			const view = new MapView(this.app.workspace.activeLeaf, this.settings, this);
			this.app.workspace.activeLeaf.open(view);
		});

		// this.registerView('map', mapViewCreator);

		this.addCommand({
			id: 'open-map-view',
			name: 'Open Map View',
			callback: () => {
				const view = new MapView(this.app.workspace.activeLeaf, this.settings, this);
				this.app.workspace.activeLeaf.open(view);
			},
		});

		this.addSettingTab(new SettingsTab(this.app, this));

		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			// console.log('click', evt);
		});

		this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile, source: string, leaf?: WorkspaceLeaf) => {
			if (file instanceof TFile) {
				const location = getFrontMatterLocation(file, this.app);
				if (location)
					menu.addItem((item: MenuItem) => {
						item.setTitle('Show on map');
						item.onClick(async () => {
							const view = new MapView(this.app.workspace.activeLeaf, this.settings, this);
							await this.app.workspace.activeLeaf.open(view);
							view.onAfterOpen = () => {
								view.zoomToLocation(location);
							}
						})
					});
			}
		});
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		if (DEBUG_PRINTS)
			console.log('Loaded:', this.settings);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// TODO pass settings
// function mapViewCreator(leaf: WorkspaceLeaf) {
// 	return new MapView(leaf, DEFAULT_SETTINGS);
// }

class MapView extends View {
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

	onHeaderMenu(menu: Menu) {
		console.log('on header menu');
	}

	onMoreOptionsMenu(menu: Menu) {
		console.log('on more options');
	}

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
		this.map.addLayer(new leaflet.TileLayer(this.settings.tilesUrl, {
			maxZoom: 20,
			subdomains:['mt0','mt1','mt2','mt3'],
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
				item.onClick(ev => {
					navigator.clipboard.writeText(location);
				});
			});
			mapPopup.addItem((item: MenuItem) => {
				const location = `${event.latlng.lat},${event.latlng.lng}`;
				item.setTitle(`Copy location as front matter`);
				item.onClick(ev => {
					navigator.clipboard.writeText(`---\nlocation: [${location}]\n---\n\n`);
				});
			});
			mapPopup.addItem((item: MenuItem) => {
				const location = `${event.latlng.lat},${event.latlng.lng}`;
				item.setTitle(`Copy location as inline`);
				item.onClick(ev => {
					navigator.clipboard.writeText(`\`location: [${location}]\``);
				});
			});
			mapPopup.addItem((item: MenuItem) => {
				item.setTitle('Open in Google Maps');
				item.onClick(ev => {
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
		let newMarkers = await this.buildMarkers(this.currentTags, files);
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

	async buildMarkers(tags: string[], files: TFile[]) {
		let markers: FileMarker[] = [];
		let foundFrontmatter = false;
		for (const file of files) {
			const fileCache = this.app.metadataCache.getFileCache(file);
			const frontMatter = fileCache?.frontmatter;
			if (frontMatter) {
				foundFrontmatter = true;
				const location = getFrontMatterLocation(file, this.app);
				if (location) {
					if (DEBUG_PRINTS)
						console.log(`Note ${file.name} has a location frontmatter: ${location.lat}, ${frontMatter.lng}`);
					let leafletMarker = new FileMarker(file, location);
					leafletMarker.icon = this.getIconForMarker(leafletMarker);
					markers.push(leafletMarker);
				}
				if ('locations' in frontMatter) {
					const markersFromFile = await this.getMarkersFromFileContent(tags, file);
					markers.push(...markersFromFile);
				}
			}
		}
		if (!foundFrontmatter)
			console.log(`No frontmatter found over ${files.length} files`);
		return markers;
	}

	getIconForMarker(marker: FileMarker) : leaflet.ExtraMarkers.Icon {
		let result = this.settings.markerIcons.default;
		const fileCache = this.app.metadataCache.getFileCache(marker.file);
		if (fileCache && fileCache.tags) {
			const fileTags = fileCache.tags.map(tagCache => tagCache.tag);
			// We iterate over the rules and apply them one by one, so later rules override earlier ones
			for (const tag in this.settings.markerIcons) {
				if (fileTags.indexOf(tag) > -1) {
					result = Object.assign({}, result, this.settings.markerIcons[tag]);
				}
			}
		}
		return leaflet.ExtraMarkers.icon(result);
	}

	async getMarkersFromFileContent(tags: string[], file: TFile): Promise<FileMarker[]> {
		let markers: FileMarker[] = [];
		const content = await this.app.vault.read(file);
		const locationRegex = /\`location:\s*(.+)\s*,\s*(.+)\`/g;
		const matches = content.matchAll(locationRegex);
		for (const match of matches) {
			try {
				const location = new leaflet.LatLng(parseFloat(match[1]), parseFloat(match[2]));
				const marker = new FileMarker(file, location);
				marker.fileLocation = match.index;
				marker.icon = this.getIconForMarker(marker);
				markers.push(marker);
				if (DEBUG_PRINTS)
					console.log(`Added internal marker for file ${file.name} at ${JSON.stringify(marker.location)}`);
			}
			catch (e) {
				console.log(`Error converting location in file ${file.name}: could not parse ${match[1]} or ${match[2]}`, e);
			}
		}
		return markers;
	}

	updateMapMarkers(newMarkers: FileMarker[], zoomToMarkers: boolean = true) {
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

class FileMarker {
	file: TFile;
	fileLocation?: number;
	location: leaflet.LatLng;
	icon?: leaflet.Icon<leaflet.BaseIconOptions>;
	mapMarker?: leaflet.Marker;
	id: MarkerId;

	constructor(file: TFile, location: leaflet.LatLng) {
		this.file = file;
		this.location = location;
		this.id = new MarkerId(file.name, location);
	}
}

class MarkerId {
	public fileName: string;
	public flattenedLocation: string;

	constructor(fileName: string, location: leaflet.LatLng) {
		this.fileName = fileName;
		this.flattenedLocation = location.lat.toString() + location.lng.toString();
	}
}

type MarkersMap = Map<MarkerId, FileMarker>;

class SettingsTab extends PluginSettingTab {
	plugin: MapViewPlugin;

	constructor(app: App, plugin: MapViewPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for the map view plugin.'});

		new Setting(containerEl)
			.setName('Map source')
			.setDesc('Requires to close & reopen the map.')
			.addDropdown(component => {component
				.addOption(consts.TILES_URL_GOOGLE, 'Google Maps')
				.addOption(consts.TILES_URL_OPENSTREETMAP, 'OpenStreetMap')
				.setValue(this.plugin.settings.tilesUrl)
				.onChange(async (value) => {
					this.plugin.settings.tilesUrl = value;
					await this.plugin.saveSettings();
				})
			});

		new Setting(containerEl)
			.setName('Map follows search results')
			.setDesc('Auto focus the map to fit search results.')
			.addToggle(component => {component
				.setValue(this.plugin.settings.autoZoom)
					.onChange(async (value) => {
						this.plugin.settings.autoZoom = value;
						await this.plugin.saveSettings();
					})
			});

		new Setting(containerEl)
			.setName('Default zoom for "show on map" action')
			.setDesc('When jumping to the map from a note, what should be the display zoom?')
			.addSlider(component => {component
				.setLimits(1, 18, 1)
				.setValue(this.plugin.settings.zoomOnGoFromNote)
					.onChange(async (value) => {
						this.plugin.settings.zoomOnGoFromNote = value;
						await this.plugin.saveSettings();
					})
			});

		new Setting(containerEl)
			.setName('Edit the marker icons (advanced)')
			.setDesc("Refer to the plugin documentation for more details.")
			.addTextArea(component => component
				.setValue(JSON.stringify(this.plugin.settings.markerIcons, null, 2))
				.onChange(async value => {
					try {
						const newMarkerIcons = JSON.parse(value);
						this.plugin.settings.markerIcons = newMarkerIcons;
						await this.plugin.saveSettings();
					} catch (e) {
					}
				}));

	}
}
