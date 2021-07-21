import { addIcon, App, Editor, FileView, MarkdownView, MenuItem, Menu, TFile, Plugin, WorkspaceLeaf, PluginSettingTab, Setting, TAbstractFile } from 'obsidian';
import * as consts from 'src/consts';
import * as leaflet from 'leaflet';

import { MapView } from 'src/mapView';
import { PluginSettings, DEFAULT_SETTINGS } from 'src/settings';
import { getFrontMatterLocation, matchInlineLocation, verifyLocation } from 'src/markers';

export default class MapViewPlugin extends Plugin {
	settings: PluginSettings;

	async onload() {
		addIcon('globe', consts.RIBBON_ICON);

		await this.loadSettings();

		this.addRibbonIcon('globe', 'Open map view', () => {
			this.app.workspace.getLeaf().setViewState({type: consts.MAP_VIEW_NAME});
		});

		this.registerView(consts.MAP_VIEW_NAME, (leaf: WorkspaceLeaf) => {
			return new MapView(leaf, this.settings, this);
		});

		this.addCommand({
			id: 'open-map-view',
			name: 'Open Map View',
			callback: () => {
				this.app.workspace.getLeaf().setViewState({type: consts.MAP_VIEW_NAME});
			},
		});

		this.addSettingTab(new SettingsTab(this.app, this));

		this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile, _source: string, leaf?: WorkspaceLeaf) => {
			if (file instanceof TFile) {
				const location = getFrontMatterLocation(file, this.app);
				if (location) {
					menu.addItem((item: MenuItem) => {
						item.setTitle('Show on map');
						item.setIcon('globe');
						item.onClick(async () => await this.openMapWithLocation(location));
					});
					menu.addItem((item: MenuItem) => {
						item.setTitle('Open in Google Maps');
						item.onClick(_ev => {
							open(`https://maps.google.com/?q=${location.lat},${location.lng}`);
						});
					});
				}
			}
		});

		// TODO function signature is a guess, revise when API is released
		// @ts-ignore
		this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: FileView) => {
			if (view instanceof FileView) {
				const location = this.getLocationOnEditorLine(editor, view);
				if (location) {
					menu.addItem((item: MenuItem) => {
						item.setTitle('Show on map');
						item.setIcon('globe');
						item.onClick(async () => await this.openMapWithLocation(location));
					});
					menu.addItem((item: MenuItem) => {
						item.setTitle('Open in Google Maps');
						item.onClick(_ev => {
							open(`https://maps.google.com/?q=${location.lat},${location.lng}`);
						});
					});
				}
			}
		});

	}

	private async openMapWithLocation(location: leaflet.LatLng) {
		await this.app.workspace.getLeaf().setViewState({
			type: consts.MAP_VIEW_NAME,
			state: {
				mapCenter: location,
				mapZoom: this.settings.zoomOnGoFromNote
			} as any});
	}

	private getLocationOnEditorLine(editor: Editor, view: FileView): leaflet.LatLng {
		const line = editor.getLine(editor.getCursor().line);
		const match = matchInlineLocation(line)?.next()?.value;
		let selectedLocation = null;
		if (match)
			selectedLocation = new leaflet.LatLng(parseFloat(match[1]), parseFloat(match[2]));
		else
		{
			const fmLocation = getFrontMatterLocation(view.file, this.app);
			if (line.indexOf('location') > -1 && fmLocation)
				selectedLocation = fmLocation;
		}
		if (selectedLocation) {
			verifyLocation(selectedLocation);
			return selectedLocation;
		}
		return null;
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
			.setName('Default action for map marker click')
			.setDesc('How should the corresponding note be opened when clicking a map marker? Either way, CTRL reverses the behavior.')
			.addDropdown(component => { component
				.addOption('samePane', 'Open in same pane (replace map view)')
				.addOption('secondPane', 'Open in a 2nd pane and keep reusing it')
				.addOption('alwaysNew', 'Always open a new pane')
				.setValue(this.plugin.settings.markerClickBehavior || 'samePane')
				.onChange(async (value: any) => {
					this.plugin.settings.markerClickBehavior = value;
					this.plugin.saveSettings();
				})
			});

		new Setting(containerEl)
			.setName('New pane split direction')
			.setDesc('Which way should the pane be split when opening in a new pane.')
			.addDropdown(component => { component
				.addOption('horizontal', 'Horizontal')
				.addOption('vertical', 'Vertical')
				.setValue(this.plugin.settings.newPaneSplitDirection || 'horizontal')
					.onChange(async (value: any) => {
						this.plugin.settings.newPaneSplitDirection = value;
						this.plugin.saveSettings();
					})
			});

		new Setting(containerEl)
			.setName('New note name format')
			.setDesc('Date/times in the format can be wrapped in {{date:...}}, e.g. "note-{{date:YYYY-MM-DD}}".')
			.addText(component => { component
				.setValue(this.plugin.settings.newNoteNameFormat || DEFAULT_SETTINGS.newNoteNameFormat)
				.onChange(async (value: string) => {
					this.plugin.settings.newNoteNameFormat = value;
					this.plugin.saveSettings();
				})
			});
		new Setting(containerEl)
			.setName('New note location')
			.setDesc('Location for notes created from the map.')
			.addText(component => { component
				.setValue(this.plugin.settings.newNotePath || '')
				.onChange(async (value: string) => {
					this.plugin.settings.newNotePath = value;
					this.plugin.saveSettings();
				})
			});
		new Setting(containerEl)
			.setName('Template file location')
			.setDesc('Choose the file to use as a template, e.g. "templates/map-log.md".')
			.addText(component => { component
				.setValue(this.plugin.settings.newNoteTemplate || '')
				.onChange(async (value: string) => {
					this.plugin.settings.newNoteTemplate = value;
					this.plugin.saveSettings();
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
