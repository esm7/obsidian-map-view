import {
    App,
    ButtonComponent,
    TextComponent,
    DropdownComponent,
    ToggleComponent,
    Notice,
    getIcon,
    setTooltip,
} from 'obsidian';
import { askForLocation } from 'src/realTimeLocation';

// A global ID to differentiate instances of the controls for the purpose of label creation
let lastGlobalId = 0;

import { type PluginSettings, type MapLightDark } from 'src/settings';

import { type MapState, areStatesEqual, mergeStates } from 'src/mapState';
import { MapContainer, type ViewSettings } from 'src/mapContainer';
import { NewPresetDialog } from 'src/newPresetDialog';
import MapViewPlugin from 'src/main';
import { QuerySuggest } from 'src/query';
import { LocationSearchDialog, SuggestInfo } from 'src/locationSearchDialog';
import { FileMarker, type MarkersMap } from 'src/markers';
import * as utils from 'src/utils';
import * as consts from 'src/consts';

import * as leaflet from 'leaflet';
import { mount, type SvelteComponent } from 'svelte';
import ViewControlsPanel from './components/ViewControlsPanel.svelte';

export class ViewControls {
    private parentElement: HTMLElement;
    private settings: PluginSettings;
    private viewSettings: ViewSettings;
    private app: App;
    private view: MapContainer;
    private plugin: MapViewPlugin;

    public controlsDiv: HTMLDivElement;
    private queryBox: TextComponent;
    private mapSourceBox: DropdownComponent;
    private sourceMode: DropdownComponent;
    private saveButton: ButtonComponent;
    private updateFromActiveMapView: ButtonComponent;
    private embeddedHeight: TextComponent;
    private followActiveNoteToggle: ToggleComponent;
    private linkBox: DropdownComponent;
    private linkColorBox: TextComponent;
    private markerLabelBox: DropdownComponent;

    private presetsDiv: HTMLDivElement;
    private presetsDivContent: HTMLDivElement = null;
    private presetsBox: DropdownComponent;
    private lastSelectedPresetIndex: number = null;
    private lastSelectedPreset: MapState = null;
    private queryDelayMs = 250;
    private lastQueryTime: number;
    private updateOngoing = false;
    private lastSavedState: MapState;

    private controlPanel: ReturnType<typeof mount<ViewControlsPanel>>;

    constructor(
        parentElement: HTMLElement,
        settings: PluginSettings,
        viewSettings: ViewSettings,
        app: App,
        view: MapContainer,
        plugin: MapViewPlugin,
    ) {
        this.parentElement = parentElement;
        this.settings = settings;
        this.viewSettings = viewSettings;
        this.app = app;
        this.view = view;
        this.plugin = plugin;
    }

    getCurrentState(): MapState {
        return this.view.getState();
    }

    async setNewState(newState: MapState, considerAutoFit: boolean) {
        if (!this.updateOngoing)
            this.view.internalSetViewState(newState, false, considerAutoFit);
    }

    async setStateByNewMapSource(newSource: number) {
        // Update the state assuming the controls are updated
        const state = this.getCurrentState();
        await this.setNewState({ ...state, chosenMapSource: newSource }, false);
        this.invalidateActivePreset();
    }

    async setStateByFollowActiveNote(follow: boolean) {
        const state = this.getCurrentState();
        await this.setNewState({ ...state, followActiveNote: follow }, false);
    }

    public tryToGuessPreset() {}

    public updateControlsToState() {
        this.controlPanel.updateControlsToState();
    }

    private setMapSourceBoxByState() {
        if (this.mapSourceBox)
            this.mapSourceBox.setValue(
                this.getCurrentState().chosenMapSource.toString(),
            );
    }

    async setStateByQueryString(newQuery: string) {
        // Start a timer and update the actual query only if no newer query came in
        const timestamp = Date.now();
        this.lastQueryTime = timestamp;
        const Sleep = (ms: number) =>
            new Promise((resolve) => setTimeout(resolve, ms));
        await Sleep(this.queryDelayMs);
        if (this.lastQueryTime != timestamp) {
            // Query is canceled by a newer query
            return;
        }
        // Update the state assuming the UI is updated
        const state = this.getCurrentState();
        this.invalidateActivePreset();
        this.updateSaveButtonVisibility();
        await this.setNewState(
            { ...state, query: newQuery },
            newQuery.length > 0,
        );
        this.showHideFiltersOn(newQuery);
    }

    private setQueryBoxByState() {
        if (!this.queryBox) return;
        // Update the UI based on the state
        const state = this.getCurrentState();
        this.queryBox.setValue(state.query);
        this.setQueryBoxErrorByState();
        this.showHideFiltersOn(state.query);
    }

    setQueryBoxErrorByState() {
        if (!this.queryBox) return;
        const state = this.getCurrentState();
        if (state.queryError)
            this.queryBox.inputEl.addClass('graph-control-error');
        else this.queryBox.inputEl.removeClass('graph-control-error');
    }

    private setLinksByState() {
        if (!this.linkColorBox || !this.linkBox) return;
        const state = this.getCurrentState();
        this.linkColorBox.setValue(state.linkColor);
        this.linkBox.setValue(state.showLinks.toString());
    }

    private async setStateByLinks() {
        // Update the state assuming the controls are updated
        const state = this.getCurrentState();
        const showLinks = this.linkBox.getValue() === 'true';
        const linkColor = this.linkColorBox.getValue();
        await this.setNewState(
            { ...state, showLinks: showLinks, linkColor: linkColor },
            false,
        );
        this.invalidateActivePreset();
    }

    public reload() {
        if (this.controlsDiv) this.controlsDiv.remove();
        this.createControls();
    }

    showHideFiltersOn(query: string) {
        // Get the filters 'on' span and show/hide it based on whether we have a query.
        // This is really just one proof too much that this whole file needs to be rewritten with Svelte...
        const label = this.controlsDiv.getElementsByClassName(
            'mv-filters-on',
        )[0] as HTMLSpanElement;
        label.style.display = query?.length > 0 ? 'inline' : 'none';
    }

    createControls() {
        this.controlPanel = mount(ViewControlsPanel, {
            target: this.parentElement,
            props: {
                app: this.app,
                plugin: this.plugin,
                settings: this.settings,
                view: this.view,
                viewSettings: this.viewSettings,
            },
        });
        return;
        lastGlobalId += 1;
        this.controlsDiv = createDiv({
            cls: 'map-view-graph-controls',
        });
        if (this.viewSettings.showOpenButton) {
            let openMapView = new ButtonComponent(this.controlsDiv);
            openMapView.buttonEl.addClass(
                'mv-map-control',
                'mv-control-button',
            );
            openMapView
                .setButtonText('Open')
                .setTooltip('Open a full Map View with the current state.')
                .onClick(async (ev: MouseEvent) => {
                    const state = this.view.getState();
                    state.followActiveNote = false;
                    this.plugin.openMapWithState(
                        state,
                        utils.mouseEventToOpenMode(
                            this.settings,
                            ev,
                            'openMap',
                        ),
                        false,
                    );
                });
        }
        if (this.viewSettings.showEmbeddedControls) {
            this.saveButton = new ButtonComponent(this.controlsDiv);
            this.saveButton.buttonEl.addClass(
                'mv-map-control',
                'mv-control-button',
            );
            this.saveButton
                .setButtonText('Save')
                .setTooltip(
                    'Update the source code block with the updated view state',
                )
                .onClick(async () => {
                    this.view.updateCodeBlockCallback();
                    this.markStateAsSaved();
                    this.updateSaveButtonVisibility();
                });
        }
        if (this.viewSettings.showFilters) {
            let filtersDiv = this.controlsDiv.createDiv({
                cls: 'graph-control-div',
            });
            filtersDiv.innerHTML = `
				<input id="filtersCollapsible${lastGlobalId}" class="controls-toggle" type="checkbox">
				<label for="filtersCollapsible${lastGlobalId}" class="lbl-triangle">▸</label>
				<label for="filtersCollapsible${lastGlobalId}" class="lbl-toggle">
					Filters
					<span class="mv-filters-on">🟠</span>
				</label>
				
				`;
            const filtersButton = filtersDiv.getElementsByClassName(
                'controls-toggle',
            )[0] as HTMLInputElement;
            filtersButton.checked = this.settings.mapControls.filtersDisplayed;
            filtersButton.onclick = async () => {
                this.settings.mapControls.filtersDisplayed =
                    filtersButton.checked;
                this.plugin.saveSettings();
            };
            let filtersContent = filtersDiv.createDiv({
                cls: 'graph-control-content',
            });
            // Wrapping the query box in a div so we can place a button in the right-middle of it
            const queryDiv = filtersContent.createDiv('search-input-container');
            queryDiv.addClass('mv-map-control');
            queryDiv.style.margin = '0';
            this.queryBox = new TextComponent(queryDiv);
            this.queryBox.inputEl.style.width = '100%';
            this.queryBox.setPlaceholder('Query');
            this.queryBox.onChange((query: string) => {
                this.setStateByQueryString(query);
            });
            let suggestor: QuerySuggest = null;
            this.queryBox.inputEl.addEventListener(
                'focus',
                (ev: FocusEvent) => {
                    if (!suggestor) {
                        suggestor = new QuerySuggest(
                            this.app,
                            this.plugin,
                            this.queryBox,
                        );
                        suggestor.open();
                    }
                },
            );
            this.queryBox.inputEl.addEventListener(
                'focusout',
                (ev: FocusEvent) => {
                    if (suggestor) {
                        suggestor.close();
                        suggestor = null;
                    }
                },
            );
            let clearButton = queryDiv.createDiv('search-input-clear-button');
            clearButton.onClickEvent((ev) => {
                this.queryBox.setValue('');
                this.setStateByQueryString('');
            });
        }

        if (this.viewSettings.showView) {
            let viewDiv = this.controlsDiv.createDiv({
                cls: 'graph-control-div',
            });
            viewDiv.innerHTML = `
				<input id="viewCollapsible${lastGlobalId}" class="controls-toggle" type="checkbox">
				<label for="viewCollapsible${lastGlobalId}" class="lbl-triangle">▸</label>
				<label for="viewCollapsible${lastGlobalId}" class="lbl-toggle">View</label>
				`;
            const viewButton = viewDiv.getElementsByClassName(
                'controls-toggle',
            )[0] as HTMLInputElement;
            viewButton.checked = this.settings.mapControls.viewDisplayed;
            viewButton.onclick = async () => {
                this.settings.mapControls.viewDisplayed = viewButton.checked;
                this.plugin.saveSettings();
            };
            let viewDivContent = viewDiv.createDiv({
                cls: 'graph-control-content',
            });
            this.mapSourceBox = new DropdownComponent(viewDivContent);
            this.mapSourceBox.selectEl.addClass('mv-map-control');
            for (const [index, source] of this.settings.mapSources.entries()) {
                this.mapSourceBox.addOption(index.toString(), source.name);
            }
            this.mapSourceBox.onChange(async (value: string) => {
                this.setStateByNewMapSource(parseInt(value));
            });
            this.setMapSourceBoxByState();
            this.sourceMode = new DropdownComponent(viewDivContent);
            this.sourceMode.selectEl.addClass('mv-map-control');
            this.sourceMode
                .addOptions({ auto: 'Auto', light: 'Light', dark: 'Dark' })
                .setValue(this.settings.chosenMapMode ?? 'auto')
                .onChange(async (value) => {
                    this.settings.chosenMapMode = value as MapLightDark;
                    await this.plugin.saveSettings();
                    this.view.refreshMap();
                });
            let goDefault = new ButtonComponent(viewDivContent);
            goDefault
                .setButtonText('Reset')
                .setTooltip('Reset the view to the defined default.')
                .onClick(async () => {
                    await this.choosePresetAndUpdateState(0);
                    this.updateControlsToState();
                });
            goDefault.buttonEl.addClass('mv-map-control');
            if (this.viewSettings.showEmbeddedControls) {
                this.updateFromActiveMapView = new ButtonComponent(
                    viewDivContent,
                );
                this.updateFromActiveMapView.buttonEl.addClass(
                    'mv-map-control',
                );
                this.updateFromActiveMapView
                    .setButtonText('Update from open Map View')
                    .setTooltip(
                        'Update the view and its source code block from an open Map View',
                    )
                    .onClick(async () => {
                        this.view.updateCodeBlockFromMapViewCallback();
                    });
                this.embeddedHeight = new TextComponent(viewDivContent);
                this.embeddedHeight
                    .setValue(
                        (
                            this.getCurrentState()?.embeddedHeight ??
                            consts.DEFAULT_EMBEDDED_HEIGHT
                        ).toString(),
                    )
                    .onChange(async (value) => {
                        const state = this.getCurrentState();
                        await this.setNewState(
                            { ...state, embeddedHeight: parseInt(value) },
                            false,
                        );
                        this.updateSaveButtonVisibility();
                    });
                this.embeddedHeight.inputEl.style.width = '4em';
                this.embeddedHeight.inputEl.addClass('mv-map-control');
            }
            if (this.viewSettings.viewTabType === 'regular') {
                let fitButton = new ButtonComponent(viewDivContent);
                fitButton
                    .setButtonText('Fit')
                    .setTooltip(
                        'Set the map view to fit all currently-displayed markers.',
                    )
                    .onClick(() => this.view.autoFitMapToMarkers());
                fitButton.buttonEl.addClass('mv-map-control');
                const followDiv = viewDivContent.createDiv({
                    cls: 'graph-control-follow-div',
                });
                this.followActiveNoteToggle = new ToggleComponent(followDiv);
                this.followActiveNoteToggle.toggleEl.addClass('mv-map-control');
                const followLabel = followDiv.createEl('label');
                followLabel.className = 'graph-control-follow-label';
                const resetQueryOnFollowOff = (followValue: boolean) => {
                    if (!followValue) {
                        // To prevent user confusion, clearing "follow active note" resets the query
                        this.queryBox.setValue('');
                        this.setStateByQueryString('');
                    }
                };
                followLabel.addEventListener('click', () => {
                    this.followActiveNoteToggle.onClick();
                    resetQueryOnFollowOff(
                        this.followActiveNoteToggle.getValue(),
                    );
                });
                followLabel.innerHTML = 'Follow active note';
                this.followActiveNoteToggle.onChange((value) => {
                    this.setStateByFollowActiveNote(value);
                });
                this.followActiveNoteToggle.toggleEl.onClickEvent(() => {
                    resetQueryOnFollowOff(
                        this.followActiveNoteToggle.getValue(),
                    );
                });

                this.markerLabelBox = new DropdownComponent(viewDivContent)
                    .addOptions({
                        off: 'No labels',
                        left: 'Left labels',
                        right: 'Right labels',
                    })
                    .onChange(async (value: string) => {
                        const state = this.getCurrentState();
                        const markerLabels = value as 'off' | 'left' | 'right';
                        await this.setNewState(
                            { ...state, markerLabels: markerLabels },
                            false,
                        );
                        this.invalidateActivePreset();
                    })
                    .setValue(this.getCurrentState().markerLabels ?? 'off');
                this.markerLabelBox.selectEl.addClass('mv-map-control');
            }
            this.markStateAsSaved();
            this.updateSaveButtonVisibility();
        }

        if (this.viewSettings.showLinks) {
            let linksDiv = this.controlsDiv.createDiv({
                cls: 'graph-control-div',
            });
            linksDiv.innerHTML = `
				<input id="linksCollapsible${lastGlobalId}" class="controls-toggle" type="checkbox">
				<label for="linksCollapsible${lastGlobalId}" class="lbl-triangle">▸</label>
				<label for="linksCollapsible${lastGlobalId}" class="lbl-toggle">Links</label>
				`;
            const linksButton = linksDiv.getElementsByClassName(
                'controls-toggle',
            )[0] as HTMLInputElement;
            linksButton.checked = this.settings.mapControls.linksDisplayed;
            linksButton.onclick = async () => {
                this.settings.mapControls.linksDisplayed = linksButton.checked;
                this.plugin.saveSettings();
            };
            let linksContent = linksDiv.createDiv({
                cls: 'graph-control-content',
            });

            this.linkBox = new DropdownComponent(linksContent)
                .addOptions({
                    false: 'Off',
                    true: 'Show links',
                })
                .onChange(async (value: string) => {
                    this.setStateByLinks();
                });
            this.linkBox.selectEl.addClass('mv-map-control');
            this.linkColorBox = new TextComponent(linksContent)
                .setPlaceholder('color')
                .onChange(async (value: string) => {
                    this.setStateByLinks();
                });
            this.linkColorBox.inputEl.style.width = '6em';
            this.linkColorBox.inputEl.addClass('mv-map-control');
            setTooltip(
                this.linkColorBox.inputEl,
                "Color used for link lines (edges). Can be any valid HTML color, e.g. 'red' or '#bc11ff'.",
                { delay: 0 },
            );

            this.setLinksByState();
        }

        if (this.viewSettings.showPresets) {
            this.presetsDiv = this.controlsDiv.createDiv({
                cls: 'graph-control-div',
            });
            this.presetsDiv.innerHTML = `
				<input id="presetsCollapsible${lastGlobalId}" class="controls-toggle" type="checkbox">
				<label for="presetsCollapsible${lastGlobalId}" class="lbl-triangle">▸</label>
				<label for="presetsCollapsible${lastGlobalId}" class="lbl-toggle">Presets</label>
				`;
            const presetsButton = this.presetsDiv.getElementsByClassName(
                'controls-toggle',
            )[0] as HTMLInputElement;
            presetsButton.checked = this.settings.mapControls.presetsDisplayed;
            presetsButton.onclick = async () => {
                this.settings.mapControls.presetsDisplayed =
                    presetsButton.checked;
                this.plugin.saveSettings();
            };
            this.refreshPresets();
        }

        this.parentElement.append(this.controlsDiv);
    }

    async choosePresetAndUpdateState(chosenPresetNumber: number) {}

    refreshPresets() {
        if (this.presetsDivContent) this.presetsDivContent.remove();
        this.presetsDivContent = this.presetsDiv.createDiv({
            cls: 'graph-control-content',
        });
        this.presetsBox = new DropdownComponent(this.presetsDivContent);
        const states = [
            this.view.defaultState,
            ...(this.settings.savedStates || []),
        ];
        this.presetsBox.selectEl.addClass('mv-map-control');
        this.presetsBox.addOption('-1', '');
        for (const [index, preset] of states.entries()) {
            this.presetsBox.addOption(index.toString(), preset.name);
        }
        if (
            this.lastSelectedPresetIndex &&
            this.lastSelectedPresetIndex < states.length
            // areStatesEqual(this.getCurrentState(), this.lastSelectedPreset, null)
        )
            this.presetsBox.setValue(this.lastSelectedPreset.toString());
        this.presetsBox.onChange(async (value: string) => {
            const chosenPresetNumber = parseInt(value);
            if (chosenPresetNumber == -1) return;
            await this.choosePresetAndUpdateState(chosenPresetNumber);
        });
        let savePreset = new ButtonComponent(this.presetsDivContent);
        savePreset.buttonEl.addClass('mv-map-control');
        savePreset
            .setButtonText('Save as...')
            .setTooltip('Save the current view as a preset.')
            .onClick(() => {
                const dialog = new NewPresetDialog(
                    this.app,
                    this.getCurrentState(),
                    this.plugin,
                    this.settings,
                    (index: string) => {
                        // If a new preset was added, this small function makes sure it's selected afterwards
                        this.refreshPresets();
                        if (index) this.presetsBox.setValue(index);
                    },
                );
                dialog.open();
            });
        let deletePreset = new ButtonComponent(this.presetsDivContent);
        deletePreset.buttonEl.addClass('mv-map-control');
        deletePreset
            .setButtonText('Delete')
            .setTooltip('Delete the currently-selected preset.')
            .onClick(async () => {
                const selectionIndex = parseInt(this.presetsBox.getValue());
                if (selectionIndex > 0) {
                    this.settings.savedStates.splice(selectionIndex - 1, 1);
                    await this.plugin.saveSettings();
                    this.refreshPresets();
                }
            });
        let saveAsDefault = new ButtonComponent(this.presetsDivContent);
        saveAsDefault.buttonEl.addClass('mv-map-control');
        saveAsDefault
            .setButtonText('Save as Default')
            .setTooltip('Save the current view as the default one.')
            .onClick(async () => {
                this.settings.defaultState = {
                    ...this.getCurrentState(),
                    name: 'Default',
                };
                await this.plugin.saveSettings();
                this.presetsBox.setValue('0');
                new Notice('Default preset updated');
            });
        const copyAsUrl = new ButtonComponent(this.presetsDivContent)
            .setButtonText('Copy URL')
            .setTooltip('Copy the current view as a URL.')
            .onClick(async () => {
                this.view.copyStateUrl();
            });
        copyAsUrl.buttonEl.addClass('mv-map-control');
        const copyBlock = new ButtonComponent(this.presetsDivContent)
            .setButtonText('Copy block')
            .setTooltip(
                'Copy the current view as a block code you can paste in notes for an inline map.',
            )
            .onClick(async () => {
                this.view.copyCodeBlock();
            });
        copyBlock.buttonEl.addClass('mv-map-control');
    }

    invalidateActivePreset() {
        // if (!this.presetsBox) return;
        // if (!areStatesEqual(this.getCurrentState(), this.lastSelectedPreset), null) {
        //     this.presetsBox.setValue('-1');
        // }
    }

    updateSaveButtonVisibility() {
        // if (!this.saveButton) return;
        // if (areStatesEqual(this.getCurrentState(), this.lastSavedState), null)
        //     this.saveButton.buttonEl.style.display = 'none';
        // else this.saveButton.buttonEl.style.display = 'inline';
    }

    markStateAsSaved(state: MapState = null) {
        if (state) this.lastSavedState = state;
        else this.lastSavedState = this.getCurrentState();
    }
}

export class SearchControl extends leaflet.Control {
    view: MapContainer;
    app: App;
    plugin: MapViewPlugin;
    settings: PluginSettings;
    searchButton: HTMLAnchorElement;
    clearButton: HTMLAnchorElement;

    constructor(
        options: any,
        view: MapContainer,
        app: App,
        plugin: MapViewPlugin,
        settings: PluginSettings,
    ) {
        super(options);
        this.view = view;
        this.app = app;
        this.plugin = plugin;
        this.settings = settings;
    }

    onAdd(map: leaflet.Map) {
        const div = leaflet.DomUtil.create(
            'div',
            'leaflet-bar leaflet-control',
        );
        this.searchButton = div.createEl('a');
        this.searchButton.innerHTML = '🔍';
        this.searchButton.addEventListener('click', (ev: MouseEvent) => {
            this.openSearch(this.view.getMarkers());
        });
        this.clearButton = div.createEl('a');
        this.clearButton.innerHTML = 'X';
        this.clearButton.style.display = 'none';
        this.clearButton.addEventListener('click', (ev: MouseEvent) => {
            this.view.removeSearchResultMarker();
            this.clearButton.style.display = 'none';
        });

        return div;
    }

    openSearch(existingMarkers: MarkersMap) {
        let markerSearchResults: SuggestInfo[] = [];
        for (const marker of existingMarkers.values()) {
            if (marker instanceof FileMarker) {
                markerSearchResults.push({
                    name: marker.extraName
                        ? `${marker.extraName} (${marker.file.basename})`
                        : marker.file.basename,
                    location: marker.location,
                    resultType: 'existingMarker',
                    existingMarker: marker,
                    icon: marker.icon.options,
                });
            }
        }
        const markersByDistanceToCenter = markerSearchResults.sort(
            (item1: SuggestInfo, item2: SuggestInfo) => {
                const center = this.view.state.mapCenter;
                const d1 = item1.location.distanceTo(center);
                const d2 = item2.location.distanceTo(center);
                if (d1 < d2) return -1;
                else return 1;
            },
        );

        const searchDialog = new LocationSearchDialog(
            this.app,
            this.plugin,
            this.settings,
            'custom',
            'Find in map',
            null,
            null,
            markersByDistanceToCenter,
            true,
            [{ command: 'shift+enter', purpose: 'go without zoom & pan' }],
        );
        searchDialog.customOnSelect = (
            selection: SuggestInfo,
            evt: MouseEvent | KeyboardEvent,
        ) => {
            this.view.removeSearchResultMarker();
            const keepZoom = evt.shiftKey;
            if (selection && selection.resultType == 'existingMarker') {
                this.view.goToSearchResult(
                    selection.location,
                    selection.existingMarker,
                    keepZoom,
                );
            } else if (selection && selection.location) {
                this.view.addSearchResultMarker(selection, keepZoom);
                this.clearButton.style.display = 'block';
            }
        };
        searchDialog.searchArea = this.view.display.map.getBounds();
        searchDialog.open();
    }
}

export class RealTimeControl extends leaflet.Control {
    view: MapContainer;
    app: App;
    settings: PluginSettings;
    locateButton: HTMLAnchorElement;
    clearButton: HTMLAnchorElement;

    constructor(
        options: any,
        view: MapContainer,
        app: App,
        settings: PluginSettings,
    ) {
        super(options);
        this.view = view;
        this.app = app;
        this.settings = settings;
    }

    onAdd(map: leaflet.Map) {
        const div = leaflet.DomUtil.create(
            'div',
            'leaflet-bar leaflet-control',
        );
        this.locateButton = div.createEl('a');
        this.locateButton.innerHTML = '⌖';
        this.locateButton.style.fontSize = '25px';
        this.locateButton.addEventListener('click', (ev: MouseEvent) => {
            askForLocation(this.app, this.settings, 'locate', 'showonmap');
        });
        this.clearButton = div.createEl('a');
        this.clearButton.innerHTML = 'X';
        this.clearButton.style.display = 'none';
        this.clearButton.addEventListener('click', (ev: MouseEvent) => {
            this.view.setRealTimeLocation(null, 0, 'clear');
            this.clearButton.style.display = 'none';
        });

        return div;
    }

    onLocationFound() {
        // Show the 'clear' button
        this.clearButton.style.display = 'block';
    }
}

export class LockControl extends leaflet.Control {
    view: MapContainer;
    app: App;
    settings: PluginSettings;
    lockButton: HTMLAnchorElement;
    locked: boolean = false;

    constructor(
        options: any,
        view: MapContainer,
        app: App,
        settings: PluginSettings,
    ) {
        super(options);
        this.view = view;
        this.app = app;
        this.settings = settings;
    }

    onAdd(map: leaflet.Map) {
        const div = leaflet.DomUtil.create(
            'div',
            'leaflet-bar leaflet-control',
        );
        this.lockButton = div.createEl('a', 'mv-icon-button');
        const icon = getIcon('lock');
        this.lockButton.appendChild(icon);
        this.lockButton.addEventListener('click', (ev: MouseEvent) => {
            this.locked = !this.locked;
            this.updateIcon();
            this.view.setLock(this.locked);
        });

        return div;
    }

    updateFromState(locked: boolean) {
        this.locked = locked;
        this.updateIcon();
    }

    updateIcon() {
        if (this.locked) this.lockButton.addClass('on');
        else this.lockButton.removeClass('on');
    }
}
