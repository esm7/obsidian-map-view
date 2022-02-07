import { addIcon, Notice, Editor, FileView, MarkdownView, MenuItem, Menu, TFile, Plugin, WorkspaceLeaf, TAbstractFile } from 'obsidian';
import * as consts from 'src/consts';
import * as leaflet from 'leaflet';
import { LocationSuggest } from 'src/geosearch';
import { CoordinateParser } from 'src/coordinateParser';

import { MapView } from 'src/mapView';
import { PluginSettings, DEFAULT_SETTINGS, convertLegacyMarkerIcons, convertLegacyTilesUrl } from 'src/settings';
import { getFrontMatterCoordinate, matchInlineLocation, verifyLocation } from 'src/markers';
import { SettingsTab } from 'src/settingsTab';
import { NewNoteDialog } from 'src/newNoteDialog';
import * as utils from 'src/utils';

/**
 * A plugin to implement map support
 */
export default class MapViewPlugin extends Plugin {
	settings: PluginSettings;
	public highestVersionSeen: number = 0;
	private suggestor: LocationSuggest;
	private coordinateParser: CoordinateParser;

	async onload() {
		// When the plugin loads

		// Register a new icon
		addIcon('globe', consts.GLOBE_ICON);

		// Load the settings
		await this.loadSettings();

		// Add a new ribbon entry to the left bar
		this.addRibbonIcon('globe', 'Open map view', () => {
			// when clicked change the active view to the map
			this.app.workspace.getLeaf().setViewState({type: consts.MAP_VIEW_NAME});
		});

		// Register a new viewer for maps
		this.registerView(consts.MAP_VIEW_NAME, (leaf: WorkspaceLeaf) => {
			// Create a new map instance
			return new MapView(leaf, this.settings, this);
		});

		this.suggestor = new LocationSuggest(this.app, this.settings);
		this.coordinateParser = new CoordinateParser(this.app, this.settings);

		this.registerEditorSuggest(this.suggestor);

		// convert old data
		if (convertLegacyMarkerIcons(this.settings)) {
			await this.saveSettings();
			new Notice("Map View: legacy marker icons were converted to the new format");
		}
		if (convertLegacyTilesUrl(this.settings)) {
			await this.saveSettings();
			new Notice("Map View: legacy tiles URL was converted to the new format");
		}

		// Register commands to the command palette
		// command that opens the map view (same as clicking the map icon)
		this.addCommand({
			id: 'open-map-view',
			name: 'Open Map View',
			callback: () => {
				// The command to run
				this.app.workspace.getLeaf().setViewState({type: consts.MAP_VIEW_NAME});
			},
		});

		// command that looks up the selected text to find the location
		this.addCommand({
			id: 'convert-selection-to-location',
			name: 'Convert Selection to Geolocation',
			editorCheckCallback: (checking, editor, view) => {
				// This is run once when building the command list and again when it is actually run
				// In the former checking is true and in the latter it is false
				if (checking)
					return editor.getSelection().length > 0;
				this.suggestor.selectionToLink(editor);
			}
		});

		// command that adds a blank inline location at the cursor location
		this.addCommand({
			id: 'insert-geolink',
			name: 'Add inline geolocation link',
			editorCallback: (editor, view) => {
				const positionBeforeInsert = editor.getCursor();
				editor.replaceSelection('[](geo:)');
				editor.setCursor({line: positionBeforeInsert.line, ch: positionBeforeInsert.ch + 1});
			}
		});

		// command that opens the location search dialog and creates a new note from this location
		this.addCommand({
			id: 'new-geolocation-note',
			name: 'New geolocation note',
			callback: () => {
				const dialog = new NewNoteDialog(this.app, this.settings);
				dialog.open();
			}
		});

		// command that opens the location search dialog and adds the location to the current note
		this.addCommand({
			id: 'add-frontmatter-geolocation',
			name: 'Add geolocation (front matter) to current note',
			editorCallback: (editor, view) => {
				const dialog = new NewNoteDialog(this.app, this.settings, 'addToNote', editor);
				dialog.open();
			}
		});

		this.addSettingTab(new SettingsTab(this.app, this));

		// Modify the file context menu (run when the context menu is built)
		this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile, _source: string, leaf?: WorkspaceLeaf) => {
			if (file instanceof TFile) {
				const coordinate = getFrontMatterCoordinate(file, this.app);
				if (coordinate) {
					// If there is a coordinate in the front matter of the file
					// add an option to open it in the map
					menu.addItem((item: MenuItem) => {
						item.setTitle('Show on map');
						item.setIcon('globe');
						item.onClick(async (evt: MouseEvent) => await this.openMapAtCoordinate(coordinate, evt.ctrlKey));
					});
					// add an option to open it in the default app
					menu.addItem((item: MenuItem) => {
						item.setTitle('Open with default app');
						item.onClick(_ev => {
							open(`geo:${coordinate.lat},${coordinate.lng}`);
						});
					});
					// populate user defined url formats
					utils.populateOpenInItems(menu, coordinate, this.settings);
				} else if (leaf && leaf.view instanceof MarkdownView) {
					// If there is no valid location field in the file
					// and the context menu came from the leaf (three dots in the top right)
					const editor = leaf.view.editor;
					// add a menu item to create the front matter
					menu.addItem((item: MenuItem) => {
						item.setTitle('Add geolocation (front matter)');
						item.setIcon('globe');
						item.onClick(async (evt: MouseEvent) => {
							const dialog = new NewNoteDialog(this.app, this.settings, 'addToNote', editor);
							dialog.open();
						});
					});
				}
			}
		});

		// Modify the editor context menu (run when the context menu is built)
		this.app.workspace.on('editor-menu', async (menu: Menu, editor: Editor, view: MarkdownView) => {
			if (view instanceof FileView) {
				const coordinate = this.getEditorLineCoordinate(editor, view);
				if (coordinate) {
					// If there is a coordinate one the line
					// add an option to open it in the map
					menu.addItem((item: MenuItem) => {
						item.setTitle('Show on map');
						item.setIcon('globe');
						item.onClick(async (evt: MouseEvent) => await this.openMapAtCoordinate(coordinate, evt.ctrlKey));
					});
					// add an option to open it in the default app
					menu.addItem((item: MenuItem) => {
						item.setTitle('Open with default app');
						item.onClick(_ev => {
							open(`geo:${coordinate.lat},${coordinate.lng}`);
						});
					});
					// populate user defined url formats
					utils.populateOpenInItems(menu, coordinate, this.settings);
				}
				if (editor.getSelection()) {
					// If there is text selected add a menu item to convert it to coordinates
					menu.addItem((item: MenuItem) => {
						item.setTitle('Convert to geolocation (geosearch)');
						item.onClick(async () => await this.suggestor.selectionToLink(editor));
					});
				}

				if (this.coordinateParser.parseEditorLine(editor))
					// if the line contains a valid string coordinate
					menu.addItem((item: MenuItem) => {
						item.setTitle('Convert to geolocation');
						item.onClick(async () => {
							this.coordinateParser.editorLineToGeolocation(editor);
						});
					})

				const clipboard = await navigator.clipboard.readText();
				const clipboardLocation = this.coordinateParser.parseString(clipboard)?.location;
				if (clipboardLocation) {
					// if the clipboard contains a valid string coordinate
					menu.addItem((item: MenuItem) => {
						item.setTitle('Paste as geolocation');
						item.onClick(async () => {
							this.coordinateParser.editorInsertGeolocation(editor, clipboardLocation);
						});
					})
				}
			}
		});
	}

	/**
	 * Open an instance of the map at the given coordinate
	 * @param coordinate The coordinate to open the map at
	 * @param ctrlKey Was the control key pressed. If true will open a map in the current leaf rather than using an open map.
	 * @private
	 */
	private async openMapAtCoordinate(coordinate: leaflet.LatLng, ctrlKey: boolean) {
		// Find the best candidate for a leaf to open the map view on.
		// If there's an open map view, use that, otherwise use the current leaf.
		// If Ctrl is pressed, override that behavior and always use the current leaf.
		const maps = this.app.workspace.getLeavesOfType(consts.MAP_VIEW_NAME);
		let chosenLeaf: WorkspaceLeaf = null;
		if (maps && !ctrlKey)
			chosenLeaf = maps[0];
		else
			chosenLeaf = this.app.workspace.getLeaf();
		if (!chosenLeaf)
			chosenLeaf = this.app.workspace.activeLeaf;
		await chosenLeaf.setViewState({
			type: consts.MAP_VIEW_NAME,
			state: {
				version: this.highestVersionSeen + 1,	// Make sure this overrides any existing state
				mapCenter: coordinate,
				mapZoom: this.settings.zoomOnGoFromNote
			} as any
		});
	}

	/**
	 * Get the coordinate on the current editor line
	 * @param editor obsidian Editor instance
	 * @param view obsidian FileView instance
	 * @private
	 */
	private getEditorLineCoordinate(editor: Editor, view: FileView): leaflet.LatLng {
		const line = editor.getLine(editor.getCursor().line);
		const match = matchInlineLocation(line)[0];
		let selectedLocation = null;
		if (match)
			selectedLocation = new leaflet.LatLng(parseFloat(match[2]), parseFloat(match[3]));
		else
		{
			const fmLocation = getFrontMatterCoordinate(view.file, this.app);
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

	/**
	 * Load the settings from disk
	 */
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	/**
	 * Save the settings to disk
	 */
	async saveSettings() {
		await this.saveData(this.settings);
	}
}


