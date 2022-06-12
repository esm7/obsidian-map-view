import {
    addIcon,
    Notice,
    Editor,
    FileView,
    MarkdownView,
    MenuItem,
    Menu,
    TFile,
    Plugin,
    WorkspaceLeaf,
    TAbstractFile,
    ObsidianProtocolData,
	MarkdownPostProcessorContext
} from 'obsidian';
import * as consts from 'src/consts';
import * as leaflet from 'leaflet';
import { LocationSuggest } from 'src/locationSuggest';
import { UrlConvertor } from 'src/urlConvertor';
import { stateFromParsedUrl } from 'src/mapState';

import { MainMapView } from 'src/mainMapView';
import { MiniMapView } from 'src/miniMapView';
import { EmbeddedMap } from 'src/embeddedMap';

import {
    PluginSettings,
    DEFAULT_SETTINGS,
    convertLegacyMarkerIcons,
    convertLegacyTilesUrl,
    convertLegacyDefaultState,
    removeLegacyPresets1,
    convertTagsToQueries,
    convertUrlParsingRules1,
} from 'src/settings';
import { MapState } from 'src/mapState';
import {
    getMarkersFromFileContent,
    getFrontMatterLocation,
    matchInlineLocation,
    verifyLocation,
} from 'src/markers';
import { SettingsTab } from 'src/settingsTab';
import { LocationSearchDialog } from 'src/locationSearchDialog';
import { TagSuggest } from 'src/tagSuggest';
import * as utils from 'src/utils';

export default class MapViewPlugin extends Plugin {
    settings: PluginSettings;
    public highestVersionSeen: number = 0;
    private suggestor: LocationSuggest;
    private tagSuggestor: TagSuggest;
    private urlConvertor: UrlConvertor;

    async onload() {
        addIcon('globe', consts.RIBBON_ICON);

        await this.loadSettings();

        // Add a new ribbon entry to the left bar
        this.addRibbonIcon('globe', 'Open map view', () => {
            // When clicked change the active view to the map
            this.app.workspace
                .getLeaf()
                .setViewState({ type: consts.MAP_VIEW_NAME });
        });

        this.registerView(consts.MAP_VIEW_NAME, (leaf: WorkspaceLeaf) => {
            return new MainMapView(leaf, this.settings, this);
        });
		this.registerView(consts.MINI_MAP_VIEW_NAME, (leaf: WorkspaceLeaf) => {
			return new MiniMapView(leaf, this.settings, this);
		});

        this.registerObsidianProtocolHandler(
            'mapview',
            (params: ObsidianProtocolData) => {
                if (params.action == 'mapview') {
                    const state = stateFromParsedUrl(params);
                    // If a saved URL is opened in another device on which there aren't the same sources, use
                    // the default source instead
                    if (
                        state.chosenMapSource >= this.settings.mapSources.length
                    )
                        state.chosenMapSource =
                            DEFAULT_SETTINGS.defaultState.chosenMapSource;
                    this.openMapWithState(state, false, false);
                }
            }
        );

        this.suggestor = new LocationSuggest(this.app, this.settings);
        this.tagSuggestor = new TagSuggest(this.app, this.settings);
        this.urlConvertor = new UrlConvertor(this.app, this.settings);

        this.registerEditorSuggest(this.suggestor);
        this.registerEditorSuggest(this.tagSuggestor);

        // Convert old settings formats that are no longer supported
        if (convertLegacyMarkerIcons(this.settings)) {
            await this.saveSettings();
            new Notice(
                'Map View: legacy marker icons were converted to the new format'
            );
        }
        if (convertLegacyTilesUrl(this.settings)) {
            await this.saveSettings();
            new Notice(
                'Map View: legacy tiles URL was converted to the new format'
            );
        }
        if (convertLegacyDefaultState(this.settings)) {
            await this.saveSettings();
            new Notice(
                'Map View: legacy default state was converted to the new format'
            );
        }
        if (removeLegacyPresets1(this.settings)) {
            await this.saveSettings();
            new Notice(
                'Map View: legacy URL parsing rules and/or map sources were converted. See the release notes'
            );
        }
        if (convertTagsToQueries(this.settings)) {
            await this.saveSettings();
            new Notice(
                'Map View: legacy tag queries were converted to the new query format'
            );
        }
        if (convertUrlParsingRules1(this.settings)) {
            await this.saveSettings();
            new Notice(
                'Map View: URL parsing rules were converted to the new format'
            );
        }

        // Register commands to the command palette
        // Command that opens the map view (same as clicking the map icon)
        this.addCommand({
            id: 'open-map-view',
            name: 'Open Map View',
            callback: () => {
                this.app.workspace
                    .getLeaf()
                    .setViewState({ type: consts.MAP_VIEW_NAME });
            },
        });

        // Command that looks up the selected text to find the location
        this.addCommand({
            id: 'convert-selection-to-location',
            name: 'Convert Selection to Geolocation',
            editorCheckCallback: (checking, editor, view) => {
                if (checking) return editor.getSelection().length > 0;
                this.suggestor.selectionToLink(editor);
            },
        });

        // Command that adds a blank inline location at the cursor location
        this.addCommand({
            id: 'insert-geolink',
            name: 'Add inline geolocation link',
            editorCallback: (editor, view) => {
                const positionBeforeInsert = editor.getCursor();
                editor.replaceSelection('[](geo:)');
                editor.setCursor({
                    line: positionBeforeInsert.line,
                    ch: positionBeforeInsert.ch + 1,
                });
            },
        });

        // Command that opens the location search dialog and creates a new note from this location
        this.addCommand({
            id: 'new-geolocation-note',
            name: 'New geolocation note',
            callback: () => {
                const dialog = new LocationSearchDialog(
                    this.app,
                    this.settings,
                    'newNote',
                    'New geolocation note'
                );
                dialog.open();
            },
        });

        // Command that opens the location search dialog and adds the location to the current note
        this.addCommand({
            id: 'add-frontmatter-geolocation',
            name: 'Add geolocation (front matter) to current note',
            editorCallback: (editor, view) => {
                const dialog = new LocationSearchDialog(
                    this.app,
                    this.settings,
                    'addToNote',
                    'Add geolocation to note',
                    editor
                );
                dialog.open();
            },
        });

        this.addCommand({
            id: 'open-map-search',
            name: 'Search active map view',
            checkCallback: (checking) => {
                const currentView = this.app.workspace.activeLeaf.view;
                if (
                    currentView &&
                    currentView.getViewType() == consts.MAP_VIEW_NAME
                ) {
                    if (!checking) (currentView as MainMapView).mapContainer.openSearch();
                    return true;
                } else return false;
            },
        });

        this.addSettingTab(new SettingsTab(this.app, this));

        // Add items to the file context menu (run when the context menu is built)
        // This is the context menu in the File Explorer and clicking "More options" (three dots) from within a file.
        this.app.workspace.on(
            'file-menu',
            async (
                menu: Menu,
                file: TAbstractFile,
                _source: string,
                leaf?: WorkspaceLeaf
            ) => {
                if (file instanceof TFile) {
                    let hasAnyLocation = false;
                    const location = getFrontMatterLocation(file, this.app);
                    if (location) {
                        // If there is a geolocation in the front matter of the file
                        // Add an option to open it in the map
                        menu.addItem((item: MenuItem) => {
                            item.setTitle('Show on map');
                            item.setIcon('globe');
                            item.onClick(
                                async (evt: MouseEvent) =>
                                    await this.openMapWithLocation(
                                        location,
                                        evt.ctrlKey
                                    )
                            );
                        });
                        // Add an option to open it in the default app
                        menu.addItem((item: MenuItem) => {
                            item.setTitle('Open with default app');
                            item.onClick((_ev) => {
                                open(`geo:${location.lat},${location.lng}`);
                            });
                        });
                        // Populate menu items from user defined "Open In" strings
                        utils.populateOpenInItems(
                            menu,
                            location,
                            this.settings
                        );
                        hasAnyLocation = true;
                    } else {
                        if (leaf && leaf.view instanceof MarkdownView) {
                            // If there is no valid geolocation in the front matter, add a menu item to populate it.
                            const editor = leaf.view.editor;
                            menu.addItem((item: MenuItem) => {
                                item.setTitle('Add geolocation (front matter)');
                                item.setIcon('globe');
                                item.onClick(async (evt: MouseEvent) => {
                                    const dialog = new LocationSearchDialog(
                                        this.app,
                                        this.settings,
                                        'addToNote',
                                        'Add geolocation to note',
                                        editor
                                    );
                                    dialog.open();
                                });
                            });
                        }
                    }
                    const contentMarkers = await getMarkersFromFileContent(
                        file,
                        this.settings,
                        this.app
                    );
                    if (contentMarkers.length > 0) {
                        hasAnyLocation = true;
                    }
                    if (hasAnyLocation) {
                        menu.addItem((item: MenuItem) => {
                            item.setTitle('Focus note in Map View');
                            item.setIcon('globe');
                            item.onClick(
                                async (evt: MouseEvent) =>
                                    await this.openMapWithState(
                                        {
                                            query: utils.replaceFollowActiveNoteQuery(file, this.settings),
                                        } as MapState,
                                        evt.ctrlKey,
                                        true
                                    )
                            );
                        });
                    }
                }
            }
        );

		if (this.app.workspace.layoutReady) this.initMiniMap()
		else this.app.workspace.onLayoutReady(() => this.initMiniMap());

        // Add items to the editor context menu (run when the context menu is built)
        // This is the context menu when right clicking within an editor view.
        this.app.workspace.on(
            'editor-menu',
            async (menu: Menu, editor: Editor, view: MarkdownView) => {
                if (view instanceof FileView) {
                    const location = this.getLocationOnEditorLine(editor, view);
                    if (location) {
                        // If there is a geolocation on the line
                        // Add an option to open it in the map
                        menu.addItem((item: MenuItem) => {
                            item.setTitle('Show on map');
                            item.setIcon('globe');
                            item.onClick(
                                async (evt: MouseEvent) =>
                                    await this.openMapWithLocation(
                                        location,
                                        evt.ctrlKey
                                    )
                            );
                        });
                        // Add an option to open it in the default app
                        menu.addItem((item: MenuItem) => {
                            item.setTitle('Open with default app');
                            item.onClick((_ev) => {
                                open(`geo:${location.lat},${location.lng}`);
                            });
                        });
                        // Populate menu items from user defined "Open In" strings
                        utils.populateOpenInItems(
                            menu,
                            location,
                            this.settings
                        );
                    }
                    if (editor.getSelection()) {
                        // If there is text selected, add a menu item to convert it to coordinates using geosearch
                        menu.addItem((item: MenuItem) => {
                            item.setTitle('Convert to geolocation (geosearch)');
                            item.onClick(
                                async () =>
                                    await this.suggestor.selectionToLink(editor)
                            );
                        });
                    }

                    if (this.urlConvertor.hasMatchInLine(editor))
                        // If the line contains a recognized geolocation that can be converted from a URL parsing rule
                        menu.addItem(async (item: MenuItem) => {
                            item.setTitle('Convert to geolocation');
                            item.onClick(async () => {
                                this.urlConvertor.convertUrlAtCursorToGeolocation(
                                    editor
                                );
                            });
                        });

                    const clipboard = await navigator.clipboard.readText();
                    let clipboardLocation =
                        this.urlConvertor.parseLocationFromUrl(clipboard);
                    if (clipboardLocation) {
                        // If the clipboard contains a recognized geolocation that can be converted from a URL parsing rule
                        menu.addItem((item: MenuItem) => {
                            item.setTitle('Paste as geolocation');
                            item.onClick(async () => {
                                if (clipboardLocation instanceof Promise)
                                    clipboardLocation = await clipboardLocation;
                                if (clipboardLocation)
                                    this.urlConvertor.insertLocationToEditor(
                                        clipboardLocation.location,
                                        editor
                                    );
                            });
                        });
                    }
                }
            }
        );

		this.registerMarkdownCodeBlockProcessor('mapview', (source, el, ctx) => this.markdownCodeBlockProcessor(source, el, ctx));
    }

    /**
     * Open an instance of the map at the given geolocation.
     * The active query is cleared so we'll be sure that the location is actually displayed.
     * @param location The geolocation to open the map at
     * @param ctrlKey Was the control key pressed
     */
    private async openMapWithLocation(
        location: leaflet.LatLng,
        ctrlKey: boolean
    ) {
        await this.openMapWithState(
            {
                mapCenter: location,
                mapZoom: this.settings.zoomOnGoFromNote,
                query: '',
            } as MapState,
            ctrlKey
        );
    }

    public async openMapWithState(
        state: MapState,
        ctrlKey: boolean,
        forceAutoFit?: boolean
    ) {
        // Find the best candidate for a leaf to open the map view on.
        // If there's an open map view, use that, otherwise use the current leaf.
        // If Ctrl is pressed, override that behavior and always use the current leaf.
        const maps = this.app.workspace.getLeavesOfType(consts.MAP_VIEW_NAME);
        let chosenLeaf: WorkspaceLeaf = null;
        if (maps && !ctrlKey) chosenLeaf = maps[0];
        else chosenLeaf = this.app.workspace.getLeaf();
        if (!chosenLeaf) chosenLeaf = this.app.workspace.activeLeaf;
        await chosenLeaf.setViewState({
            type: consts.MAP_VIEW_NAME,
            state: state,
        });
        if (forceAutoFit) {
            if (chosenLeaf.view instanceof MainMapView)
                chosenLeaf.view.mapContainer.autoFitMapToMarkers();
        }
    }

    /**
     * Get the geolocation on the current editor line
     * @param editor obsidian Editor instance
     * @param view obsidian FileView instance
     * @private
     */
    private getLocationOnEditorLine(
        editor: Editor,
        view: FileView
    ): leaflet.LatLng {
        const line = editor.getLine(editor.getCursor().line);
        const match = matchInlineLocation(line)[0];
        let selectedLocation = null;
        if (match)
            selectedLocation = new leaflet.LatLng(
                parseFloat(match.groups.lat),
                parseFloat(match.groups.lng)
            );
        else {
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

    onunload() {}

    /** Initialise the plugin settings from Obsidian's cache */
    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData()
        );
    }

    /** Save the plugin settings to Obsidian's cache so it can be reused later. */
    async saveSettings() {
        await this.saveData(this.settings);
    }

	initMiniMap() {
		if (this.app.workspace.getLeavesOfType(consts.MINI_MAP_VIEW_NAME).length)
			return;
		this.app.workspace.getRightLeaf(false).setViewState({type: consts.MINI_MAP_VIEW_NAME});
	}

	markdownCodeBlockProcessor(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		el.appendText('TODO HELLO!');
	}
}
