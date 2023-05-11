import {
    setIcon,
    Editor,
    FileView,
    MarkdownView,
    Menu,
    TFile,
    Plugin,
    WorkspaceLeaf,
    TAbstractFile,
    ObsidianProtocolData,
    MarkdownPostProcessorContext,
    Notice,
} from 'obsidian';
import * as consts from 'src/consts';
import * as leaflet from 'leaflet';
import { LocationSuggest } from 'src/locationSuggest';
import { UrlConvertor } from 'src/urlConvertor';
import { mergeStates, stateFromParsedUrl, getCodeBlock } from 'src/mapState';
import * as menus from 'src/menus';

import { MainMapView } from 'src/mainMapView';
// import { MiniMapView } from 'src/miniMapView';
import { EmbeddedMap } from 'src/embeddedMap';
import { IconCache } from 'src/markerIcons';
import { RealTimeLocationSource } from 'src/realTimeLocation';

import {
    PluginSettings,
    DEFAULT_SETTINGS,
    convertLegacySettings,
    OpenBehavior,
} from 'src/settings';
import { MapState } from 'src/mapState';
import {
    getFrontMatterLocation,
    matchInlineLocation,
    verifyLocation,
} from 'src/markers';
import { SettingsTab } from 'src/settingsTab';
import { LocationSearchDialog } from 'src/locationSearchDialog';
import { TagSuggest } from 'src/tagSuggest';
import * as utils from 'src/utils';
import { MapViewAPI } from './mapViewAPI';

export default class MapViewPlugin extends Plugin {
    settings: PluginSettings;
    public highestVersionSeen: number = 0;
    public iconCache: IconCache;
    public mapViewAPI: MapViewAPI;
    private suggestor: LocationSuggest;
    private tagSuggestor: TagSuggest;
    private urlConvertor: UrlConvertor;

    async onload() {
        await this.loadSettings();

        // Add a new ribbon entry to the left bar
        this.addRibbonIcon('map-pin', 'Open map view', (ev: MouseEvent) => {
            this.openMap(
                utils.mouseEventToOpenMode(this.settings, ev, 'openMap')
            );
        });

        this.registerView(consts.MAP_VIEW_NAME, (leaf: WorkspaceLeaf) => {
            return new MainMapView(leaf, this.settings, this);
        });

        // Currently not in use; the feature is frozen until I have the time to work on its various quirks
        // this.registerView(consts.MINI_MAP_VIEW_NAME, (leaf: WorkspaceLeaf) => {
        // 	return new MiniMapView(leaf, this.settings, this);
        // });

        this.registerObsidianProtocolHandler(
            'mapview',
            async (params: ObsidianProtocolData) => {
                if (params.action === 'mapview') {
                    if (params.do === 'update-real-time-location') {
                        const location =
                            params.centerLat && params.centerLng
                                ? new leaflet.LatLng(
                                      parseFloat(params.centerLat),
                                      parseFloat(params.centerLng)
                                  )
                                : null;
                        const accuracy = params.accuracy;
                        const source = params?.source ?? 'unknown';
                        const map = await this.openMap('replaceCurrent', null);
                        if (map) {
                            map.mapContainer.setRealTimeLocation(
                                location,
                                parseFloat(accuracy),
                                source as RealTimeLocationSource
                            );
                        }
                    } else {
                        const state = stateFromParsedUrl(params);
                        // If a saved URL is opened in another device on which there aren't the same sources, use
                        // the default source instead
                        if (
                            state.chosenMapSource >=
                            this.settings.mapSources.length
                        )
                            state.chosenMapSource =
                                DEFAULT_SETTINGS.defaultState.chosenMapSource;
                        this.openMapWithState(state, 'replaceCurrent', false);
                    }
                }
            }
        );

        this.registerMarkdownCodeBlockProcessor(
            'mapview',
            async (
                source: string,
                el: HTMLElement,
                ctx: MarkdownPostProcessorContext
            ) => {
                let state = null;
                try {
                    const rawStateObj = JSON.parse(source);
                    state = stateFromParsedUrl(rawStateObj);
                } catch (e) {
                    el.setText(
                        'Map View is unable to parse this saved state: ' +
                            e.toString()
                    );
                }
                if (state) {
                    let map = new EmbeddedMap(
                        el,
                        ctx,
                        this.app,
                        this.settings,
                        this
                    );
                    await map.open(state);
                }
            }
        );

        this.suggestor = new LocationSuggest(this.app, this.settings);
        this.mapViewAPI = new MapViewAPI(this.app, this.settings);
        this.tagSuggestor = new TagSuggest(this.app, this.settings);
        this.urlConvertor = new UrlConvertor(this.app, this.settings);

        this.registerEditorSuggest(this.suggestor);
        this.registerEditorSuggest(this.tagSuggestor);

        await convertLegacySettings(this.settings, this);

        this.iconCache = new IconCache(document.body);

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
                    this,
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
                    this,
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
                    if (!checking)
                        (currentView as MainMapView).mapContainer.openSearch();
                    return true;
                } else return false;
            },
        });

        this.addCommand({
            id: 'quick-map-embed',
            name: 'Add an embedded map',
            editorCallback: (editor: Editor, ctx) => {
                this.openQuickEmbed(editor);
            },
        });

        this.addSettingTab(new SettingsTab(this.app, this));

        // Add items to the file context menu (run when the context menu is built)
        // This is the context menu in the File Explorer and clicking "More options" (three dots) from within a file.
        this.app.workspace.on('file-menu', (menu, file, source, leaf) =>
            this.onFileMenu(menu, file, source, leaf)
        );

        this.app.workspace.on('active-leaf-change', (leaf) => {
            if (utils.lastUsedLeaves.contains(leaf)) {
                utils.lastUsedLeaves.remove(leaf);
            }
            utils.lastUsedLeaves.unshift(leaf);
        });

        // Currently frozen until I have time to work on this feature's quirks
        // if (this.app.workspace.layoutReady) this.initMiniMap()
        // else this.app.workspace.onLayoutReady(() => this.initMiniMap());

        // Add items to the editor context menu (run when the context menu is built)
        // This is the context menu when right clicking within an editor view.
        this.app.workspace.on('editor-menu', (menu, editor, view) => {
            this.onEditorMenu(menu, editor, view as MarkdownView);
        });

        // Watch for pasted text and add a 'locations:' front matter where applicable if the user pastes
        // an inline geolocation
        this.app.workspace.on(
            'editor-paste',
            (evt: ClipboardEvent, editor: Editor) => {
                if (this.settings.fixFrontMatterOnPaste) {
                    const text = evt.clipboardData.getData('text');
                    if (text) {
                        const inlineMatch = matchInlineLocation(text);
                        if (inlineMatch && inlineMatch.length > 0) {
                            // The pasted text contains an inline location, so try to help the user by verifying
                            // a frontmatter exists
                            if (
                                utils.verifyOrAddFrontMatterForInline(
                                    editor,
                                    this.settings
                                )
                            ) {
                                new Notice(
                                    "The note's front matter was updated to denote locations are present"
                                );
                            }
                        }
                    }
                }
            }
        );
    }

    public findOpenMainView(): WorkspaceLeaf {
        const maps = this.app.workspace.getLeavesOfType(consts.MAP_VIEW_NAME);
        if (maps && maps.length > 0) return maps[0];
        else return null;
    }

    public async openMap(
        openBehavior: OpenBehavior,
        state?: MapState
    ): Promise<MainMapView> {
        // Find the best candidate for a leaf to open the map view on according to the required
        // behavior.
        let chosenLeaf: WorkspaceLeaf = null;
        // Prepare a few options for a candidate leaf
        const openMapView = this.findOpenMainView();
        const existingLeafToReplace = this.app.workspace.getLeaf(false);
        const emptyLeaf = this.app.workspace.getLeavesOfType('empty');
        let createPane = false;
        let createTab = false;
        switch (openBehavior) {
            case 'replaceCurrent':
                chosenLeaf = existingLeafToReplace;
                if (!chosenLeaf && emptyLeaf) chosenLeaf = emptyLeaf[0];
                break;
            case 'dedicatedPane':
                chosenLeaf = openMapView;
                if (!chosenLeaf) createPane = true;
                break;
            case 'dedicatedTab':
                chosenLeaf = openMapView;
                if (!chosenLeaf) createTab = true;
                break;
            case 'alwaysNewPane':
                createPane = true;
                break;
            case 'alwaysNewTab':
                createTab = true;
                break;
            case 'lastUsed':
                throw Error('This option is not supported here');
        }
        if (createTab) chosenLeaf = this.app.workspace.getLeaf('tab');
        if (createPane)
            chosenLeaf = this.app.workspace.getLeaf(
                'split',
                this.settings.newPaneSplitDirection
            );
        if (!chosenLeaf) {
            chosenLeaf = this.app.workspace.getLeaf(true);
        }
        this.app.workspace.setActiveLeaf(chosenLeaf);
        await chosenLeaf.setViewState({
            type: consts.MAP_VIEW_NAME,
            state: state ?? DEFAULT_SETTINGS,
        });
        if (chosenLeaf.view instanceof MainMapView) return chosenLeaf.view;
        return null;
    }

    public async openMapWithState(
        state: MapState,
        openBehavior: OpenBehavior,
        forceAutoFit?: boolean,
        highlightFile: TAbstractFile = null,
        highlightFileLine: number = null
    ) {
        const mapView = await this.openMap(openBehavior, state);
        if (mapView && mapView.mapContainer) {
            const map = mapView.mapContainer;
            if (forceAutoFit) map.autoFitMapToMarkers();
            if (highlightFile) {
                const markerToHighlight = map.findMarkerByFileLine(
                    highlightFile,
                    highlightFileLine
                );
                map.setHighlight(markerToHighlight);
            }
        }
    }

    /**
     * Open an instance of the map at the given geolocation.
     * The active query is cleared so we'll be sure that the location is actually displayed.
     * @param location The geolocation to open the map at
     * @param openBehavior the behavior to use
     * @param file the file this location belongs to
     * @param fileLine the line in the file (if it's an inline link)
     * @param keepZoom don't zoom the map
     */
    async openMapWithLocation(
        location: leaflet.LatLng,
        openBehavior: OpenBehavior,
        file: TAbstractFile,
        fileLine: number = null,
        keepZoom: boolean = false
    ) {
        let newState = {
            mapCenter: location,
            query: '',
        } as MapState;
        if (!keepZoom)
            newState = Object.assign(newState, {
                mapZoom: this.settings.zoomOnGoFromNote,
            });
        await this.openMapWithState(
            newState,
            openBehavior,
            false,
            file,
            fileLine
        );
    }

    /**
     * Get the geolocation on the current editor line
     * @param editor obsidian Editor instance
     * @param view obsidian FileView instance
     * @private
     */
    private getLocationOnEditorLine(
        editor: Editor,
        lineNumber: number,
        view: FileView,
        alsoFrontMatter: boolean
    ): leaflet.LatLng {
        const line = editor.getLine(lineNumber);
        const match = matchInlineLocation(line)[0];
        let selectedLocation = null;
        if (match)
            selectedLocation = new leaflet.LatLng(
                parseFloat(match.groups.lat),
                parseFloat(match.groups.lng)
            );
        else if (alsoFrontMatter) {
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
        if (
            this.app.workspace.getLeavesOfType(consts.MINI_MAP_VIEW_NAME).length
        )
            return;
        this.app.workspace
            .getRightLeaf(false)
            .setViewState({ type: consts.MINI_MAP_VIEW_NAME });
    }

    onFileMenu(
        menu: Menu,
        file: TAbstractFile,
        _source: string,
        leaf?: WorkspaceLeaf
    ) {
        const editor =
            leaf && leaf.view instanceof MarkdownView ? leaf.view.editor : null;
        if (file instanceof TFile) {
            const location = getFrontMatterLocation(file, this.app);
            if (location) {
                // If there is a geolocation in the front matter of the file
                // Add an option to open it in the map
                menus.addShowOnMap(
                    menu,
                    location,
                    file,
                    null,
                    this,
                    this.settings
                );
                // Add an option to open it in the default app
                menus.addOpenWith(menu, location, this.settings);
            } else {
                if (editor) {
                    // If there is no valid geolocation in the front matter, add a menu item to populate it.
                    menus.addGeolocationToNote(
                        menu,
                        this.app,
                        this,
                        editor,
                        this.settings
                    );
                }
            }
            if (utils.isMobile(this.app)) {
                // On mobile there's no editor context menu, so add it here instead
                this.onEditorMenu(menu, editor, leaf.view as MarkdownView);
            }
            menus.addFocusNoteInMapView(menu, file, this.settings, this);
            if (this.settings.debug)
                menus.addImport(menu, editor, this.app, this, this.settings);
        }
    }

    onEditorMenu(menu: Menu, editor: Editor, view: MarkdownView) {
        if (!editor) return;
        if (view instanceof FileView) {
            let multiLineMode = false;
            const [fromLine, toLine, geolocations] =
                this.geolocationsWithinSelection(editor, view);
            if (geolocations.length > 0) {
                multiLineMode = true;
                menus.addFocusLinesInMapView(
                    menu,
                    view.file,
                    fromLine,
                    toLine,
                    geolocations.length,
                    this,
                    this.settings
                );
            }
            if (!multiLineMode) {
                const editorLine = editor.getCursor().line;
                const location = this.getLocationOnEditorLine(
                    editor,
                    editorLine,
                    view,
                    true
                );
                if (location) {
                    const editorLine = editor.getCursor().line;
                    menus.addShowOnMap(
                        menu,
                        location,
                        view.file,
                        editorLine,
                        this,
                        this.settings
                    );
                    menus.addOpenWith(menu, location, this.settings);
                }
            }
            menus.addUrlConversionItems(
                menu,
                editor,
                this.suggestor,
                this.urlConvertor
            );
            menus.addEmbed(menu, this, editor);
        }
    }

    geolocationsWithinSelection(
        editor: Editor,
        view: MarkdownView
    ): [number, number, leaflet.LatLng[]] {
        let geolocations: leaflet.LatLng[] = [];
        const editorSelections = editor.listSelections();
        if (editorSelections && editorSelections.length > 0) {
            const anchorLine = editorSelections[0].anchor.line;
            const headLine = editorSelections[0].head.line;
            if (anchorLine != headLine) {
                const fromLine = Math.min(anchorLine, headLine);
                const toLine = Math.max(anchorLine, headLine);
                let geolocations: leaflet.LatLng[] = [];
                for (let line = fromLine; line <= toLine; line++) {
                    const geolocationOnLine = this.getLocationOnEditorLine(
                        editor,
                        line,
                        view,
                        false
                    );
                    if (geolocationOnLine) geolocations.push(geolocationOnLine);
                }
                return [fromLine, toLine, geolocations];
            }
        }
        return [null, null, []];
    }

    openQuickEmbed(editor: Editor) {
        const searchDialog = new LocationSearchDialog(
            this.app,
            this,
            this.settings,
            'custom',
            'Quick Map Embed',
            editor
        );
        searchDialog.customOnSelect = (selection, evt) => {
            const state = mergeStates(this.settings.defaultState, {
                mapCenter: selection.location,
            } as MapState);
            if (state.mapZoom < consts.MIN_QUICK_EMBED_ZOOM)
                state.mapZoom = consts.MIN_QUICK_EMBED_ZOOM;
            const codeBlock = getCodeBlock(state);
            const cursor = editor.getCursor();
            editor.transaction({
                changes: [{ from: cursor, text: codeBlock }],
            });
            editor.setCursor({
                line: cursor.line + codeBlock.split('\n').length,
                ch: 0,
            });
        };
        searchDialog.setPlaceholder(
            'Quick map embed: search for an address, landmark or business name to center the map on.'
        );
        searchDialog.open();
    }
}
