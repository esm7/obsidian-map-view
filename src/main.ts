import { addIcon, App, MenuItem, Menu, TFile, Plugin, WorkspaceLeaf, PluginSettingTab, Setting, TAbstractFile } from 'obsidian';
import * as consts from 'src/consts';

import { MapView } from 'src/mapView';
import { PluginSettings, DEFAULT_SETTINGS } from 'src/settings';
import { getFrontMatterLocation } from 'src/markers';

export default class MapViewPlugin extends Plugin {
	settings: PluginSettings;

	async onload() {
		addIcon('globe', consts.RIBBON_ICON);

		await this.loadSettings();

		this.addRibbonIcon('globe', 'Open map view', () => {
			const view = new MapView(this.app.workspace.activeLeaf, this.settings, this);
			this.app.workspace.activeLeaf.open(view);
		});

		this.registerView('map', (leaf: WorkspaceLeaf) => {
			return new MapView(leaf, this.settings, this);
		});

		this.addCommand({
			id: 'open-map-view',
			name: 'Open Map View',
			callback: () => {
				const view = new MapView(this.app.workspace.activeLeaf, this.settings, this);
				this.app.workspace.activeLeaf.open(view);
			},
		});

		this.addSettingTab(new SettingsTab(this.app, this));

		this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile, _source: string, leaf?: WorkspaceLeaf) => {
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
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}


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
			.setName('Map source (advanced)')
			.setDesc('Source for the map tiles, see the documentation for more details. Requires to close & reopen the map.')
			.addText(component => {component
				.setValue(this.plugin.settings.tilesUrl)
				.onChange(async (value) => {
					this.plugin.settings.tilesUrl = value;
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
