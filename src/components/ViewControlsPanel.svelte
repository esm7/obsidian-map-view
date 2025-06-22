<script lang="ts">
    import { untrack, onMount } from 'svelte';
    import { Notice, App, getIcon, TFile, type HeadingCache } from 'obsidian';
    import { type PluginSettings } from '../settings';
    import { type ViewSettings, MapContainer } from '../mapContainer';
    import MapViewPlugin from '../main';
    import ViewCollapsibleSection from './ViewCollapsibleSection.svelte';
    import QueryTextField from './QueryTextField.svelte';
    import { SvelteModal } from 'src/svelte';
    import TextBoxDialog from './TextBoxDialog.svelte';
    import { SimpleInputSuggest } from '../simpleInputSuggest';
    import {
        type MapState,
        areStatesEqual,
        mergeStates,
        copyState,
    } from 'src/mapState';
    import { NewPresetDialog } from 'src/newPresetDialog';
    import * as utils from 'src/utils';
    import { NoteSelectDialog } from 'src/noteSelectDialog';
    import { type EditModeTools } from 'src/viewControls';
    import ChipsList from './ChipsList.svelte';

    let {
        plugin,
        app,
        settings,
        viewSettings,
        view,
        editModeTools = $bindable(),
    } = $props<{
        plugin: MapViewPlugin;
        app: App;
        settings: PluginSettings;
        viewSettings: ViewSettings;
        view: MapContainer;
        editModeTools: EditModeTools;
    }>();

    let mapState: MapState = $state();

    let presets: MapState[] = $state([
        view.defaultState,
        ...(settings.savedStates || []),
    ]);
    let selectedPreset = $state('-1');
    let lastSavedState: MapState = $state();
    let minimized = $state(settings.mapControls.minimized);
    let previousState: MapState = null;
    let noteToEdit: TFile = $state(null);
    let noteHeading: string | null = $state(null);
    let allNoteHeadings: string[] = $state([]);
    let editTags: string[] = $state([]);
    let allTags: string[] = $state(utils.getAllTagNames(app, plugin));
    let addTagInputElement: HTMLInputElement = $state();

    $effect(() => {
        const considerAutoFit = statesDifferOnlyInQuery(
            mapState,
            previousState,
        );
        if (!areStatesEqual(mapState, view.getState(), view.display?.map)) {
            view.internalSetViewState(mapState, false, considerAutoFit);
        }
        // If the new state matches an existing preset, select that preset.
        const preset = findPresetIndexForCurrentState().toString();
        // We don't want this $effect to be called with selectedPreset changes; when the user selects a new
        // reset, the onChangePreset method does the job. Therefore we read selectedPreset using untrack.
        const untrackedSelectedPreset = untrack(() => selectedPreset);
        if (preset !== untrackedSelectedPreset)
            selectedPreset = preset.toString();
        previousState = copyState(mapState);
    });

    $effect(() => {
        editModeTools.noteHeading = noteHeading;
    });

    export function updateControlsToState() {
        mapState = view.getState();
    }

    export function openEditSection() {
        setMapControl('editDisplayed', true);
        setMapControl('minimized', false);
        minimized = false;
        // Trigger reactivity
        settings = { ...settings };
    }

    export function openChooseNote() {
        const dialog = new NoteSelectDialog(
            app,
            plugin,
            settings,
            (selection: any, evt: MouseEvent | KeyboardEvent) => {
                if (selection.file) {
                    noteToEdit = selection.file;
                    editModeTools.noteToEdit = noteToEdit;
                    mapState.editMode = true;
                    const headings = app.metadataCache.getFileCache(
                        selection.file,
                    )?.headings as HeadingCache[];
                    // TODO bug here, heading positions change as note changes
                    allNoteHeadings = headings
                        ? headings.map((heading) => heading.heading)
                        : [];
                }
            },
            'Choose a note to edit or press Shift+Enter to create new',
        );
        dialog.open();
    }

    // Update settings.mapControls.<path> about whether a collapsible section of the accordion is open or not
    function setMapControl(
        path: keyof typeof settings.mapControls,
        value: boolean,
    ) {
        settings.mapControls[path] = value;
        plugin.saveSettings();
    }

    function toggleFollowActiveNote() {
        mapState.followActiveNote = !mapState.followActiveNote;
        // To prevent user confusion, clearing "follow active note" resets the query
        if (!mapState.followActiveNote) mapState.query = '';
    }

    // We save the current state in previousState before calling updateControlsToState because we don't want this initial
    // call to trigger an auto fit
    previousState = view.getState();
    updateControlsToState();
    // Initialize lastSavedState to the initial map state (this is not a reactive assignment, i.e. it does not update every time mapState changes).
    // svelte-ignore state_referenced_locally
    lastSavedState = mapState;

    onMount(() => {
        const suggestor = new SimpleInputSuggest(
            app,
            addTagInputElement,
            allTags,
            (selection: string) => {
                if (editTags.findIndex((tag) => tag === selection) === -1)
                    editTags.push(selection);
                suggestor.close();
                addTagInputElement.value = '';
                addTagInputElement.blur();
            },
        );
    });

    // Finds in the presets array a preset that matches the current map state and returns its index, or -1 if none was found
    function findPresetIndexForCurrentState() {
        for (const [index, preset] of presets.entries())
            if (areStatesEqual(preset, mapState, view.display?.map)) {
                return index;
            }
        return -1;
    }

    async function onChangePreset() {
        const presetIndex = parseInt(selectedPreset);
        if (presetIndex > -1) {
            const chosenPreset: MapState = presets[presetIndex];
            const mergedState = mergeStates(mapState, chosenPreset);
            mapState = { ...mergedState };
        }
    }

    async function presetSaveAs() {
        const dialog = new NewPresetDialog(
            app,
            mapState,
            plugin,
            settings,
            (index: string) => {
                // If a new preset was added, this small function makes sure it's selected afterwards
                presets = [view.defaultState, ...(settings.savedStates || [])];
                selectedPreset = index.toString();
                onChangePreset();
            },
        );
        dialog.open();
    }

    async function deletePreset() {
        const presetIndex = parseInt(selectedPreset);
        if (presetIndex > 0) {
            settings.savedStates.splice(presetIndex - 1, 1);
            presets = [view.defaultState, ...(settings.savedStates || [])];
            await plugin.saveSettings();
        }
    }

    async function saveAsDefault() {
        settings.defaultState = {
            ...mapState,
            name: 'Default',
        };
        view.defaultState = settings.defaultState;
        presets = [view.defaultState, ...(settings.savedStates || [])];
        onChangePreset();
        await plugin.saveSettings();
        new Notice('Default preset updated');
    }

    async function copyUrl() {
        view.copyStateUrl();
    }

    async function copyBlock() {
        view.copyCodeBlock();
    }

    async function openButtonClick(ev: MouseEvent) {
        const state = mapState;
        state.followActiveNote = false;
        state.autoFit = false;
        plugin.openMapWithState(
            state,
            utils.mouseEventToOpenMode(settings, ev, 'openMap'),
            false,
        );
    }

    async function saveButton() {
        view.updateCodeBlockCallback();
        lastSavedState = mapState;
    }

    // Return true if the two states are identical except their query field
    function statesDifferOnlyInQuery(state1: MapState, state2: MapState) {
        if (state1.query == state2.query) return false;
        const state2WithQuery1 = { ...state2, query: state1.query };
        return areStatesEqual(state1, state2WithQuery1);
    }
</script>

<div class="map-view-graph-controls" class:minimized>
    {#if viewSettings.showMinimizeButton || viewSettings.showFilters}
        <div class="top-right-controls">
            {#if viewSettings.showFilters}
                {#if mapState.query.length > 0}
                    <span class="mv-filters-on" title="Filters are active"
                        >🟠</span
                    >
                {/if}
            {/if}
            {#if viewSettings.showMinimizeButton}
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <div
                    class="minimize-button"
                    title={settings.mapControls.minimized
                        ? 'Expand controls'
                        : 'Minimize controls'}
                    onclick={() => {
                        setMapControl(
                            'minimized',
                            !settings.mapControls.minimized,
                        );
                        minimized = !minimized;
                    }}
                >
                    {@html getIcon(minimized ? 'maximize-2' : 'minimize-2')
                        .outerHTML}
                </div>
            {/if}
        </div>
    {/if}
    {#if !minimized || !viewSettings.showMinimizeButton}
        <!-- If the view doesn't include the minimize button (e.g. in EmbeddedMapView), we ignore minimization -->
        <div class="graph-control-div">
            {#if viewSettings.showOpenButton}
                <button
                    class="button"
                    title="Open a full Map View with the current state."
                    onclick={openButtonClick}
                >
                    Open
                </button>
            {/if}
            {#if viewSettings.showEmbeddedControls && !areStatesEqual(mapState, lastSavedState, view.display?.map)}
                <button
                    class="button"
                    title="Update the source code block with the updated view state."
                    onclick={() => saveButton()}
                >
                    Save
                </button>
            {/if}
            {#if viewSettings.showFilters}
                <ViewCollapsibleSection
                    headerText="Filters"
                    expanded={settings.mapControls.filtersDisplayed}
                    afterToggle={(expanded) =>
                        setMapControl('filtersDisplayed', expanded)}
                >
                    <QueryTextField
                        {plugin}
                        {app}
                        bind:query={mapState.query}
                        bind:queryError={mapState.queryError}
                    />
                </ViewCollapsibleSection>
            {/if}
            {#if viewSettings.showView}
                <ViewCollapsibleSection
                    headerText="View"
                    expanded={settings.mapControls.viewDisplayed}
                    afterToggle={(expanded) =>
                        setMapControl('viewDisplayed', expanded)}
                >
                    <select
                        class="dropdown mv-map-control"
                        bind:value={mapState.chosenMapSource}
                    >
                        {#each settings.mapSources as source, i}
                            <option value={i}>{source.name}</option>
                        {/each}
                    </select>
                    <select
                        class="dropdown mv-map-control"
                        bind:value={settings.chosenMapMode}
                    >
                        <option value="auto">Auto</option>
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                    </select>
                    <button
                        class="button"
                        title="Reset the view to the defined default."
                        onclick={() => {
                            selectedPreset = '0';
                            onChangePreset();
                        }}
                    >
                        Reset
                    </button>
                    {#if viewSettings.viewTabType === 'regular'}
                        <button
                            class="button"
                            title="Set the map view to fit all currently-displayed markers."
                            onclick={() => {
                                view.autoFitMapToMarkers();
                            }}
                        >
                            Fit
                        </button>
                        <div class="graph-control-follow-div">
                            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                            <div
                                class="checkbox-container"
                                class:is-enabled={mapState.followActiveNote}
                                onclick={() => toggleFollowActiveNote()}
                            >
                                <input
                                    type="checkbox"
                                    checked={mapState.followActiveNote}
                                    id="follow-active"
                                />
                            </div>
                            <label class="follow-label" for="follow-active"
                                >Follow active note</label
                            >
                        </div>

                        <select
                            class="dropdown mv-map-control"
                            bind:value={mapState.markerLabels}
                        >
                            <option value="off">No labels</option>
                            <option value="left">Left labels</option>
                            <option value="right">Right labels</option>
                        </select>
                    {/if}
                </ViewCollapsibleSection>
            {/if}
            {#if viewSettings.showLinks}
                <ViewCollapsibleSection
                    headerText="Links"
                    expanded={settings.mapControls.linksDisplayed}
                    afterToggle={(expanded) =>
                        setMapControl('linksDisplayed', expanded)}
                >
                    <select
                        class="dropdown mv-map-control"
                        value={mapState.showLinks ? 'true' : 'false'}
                        onchange={(e) =>
                            (mapState.showLinks =
                                e.currentTarget.value === 'true')}
                    >
                        <option value="false">Off</option>
                        <option value="true">Show links</option>
                    </select>
                    <input
                        type="text"
                        class="mv-map-control"
                        placeholder="color"
                        bind:value={mapState.linkColor}
                        contenteditable="true"
                        title="Color used for lines (edges). Can be any valid HTML color, e.g. 'red' or '#bc11ff'."
                        style="width: 6em;"
                    />
                </ViewCollapsibleSection>
            {/if}
            {#if viewSettings.showPresets}
                <ViewCollapsibleSection
                    headerText="Presets"
                    expanded={settings.mapControls.presetsDisplayed}
                    afterToggle={(expanded) =>
                        setMapControl('presetsDisplayed', expanded)}
                >
                    <select
                        class="dropdown mv-map-control"
                        bind:value={selectedPreset}
                        onchange={() => onChangePreset()}
                    >
                        <option value="-1">(no preset)</option>
                        {#each presets as preset, i}
                            <option value={i.toString()}>{preset.name}</option>
                        {/each}
                    </select>
                    <button
                        class="button mv-map-control"
                        title="Save the current view as a preset."
                        onclick={() => {
                            presetSaveAs();
                        }}
                    >
                        Save as...
                    </button>
                    <button
                        class="button mv-map-control"
                        title="Delete the currently-selected preset."
                        onclick={() => {
                            deletePreset();
                        }}
                    >
                        Delete
                    </button>
                    <button
                        class="button mv-map-control"
                        title="Save the current view as the default one."
                        onclick={() => {
                            saveAsDefault();
                        }}
                    >
                        Save as Default
                    </button>
                    <button
                        class="button mv-map-control"
                        title="Copy the current view as a URL."
                        onclick={() => {
                            copyUrl();
                        }}
                    >
                        Copy URL
                    </button>
                    <button
                        class="button mv-map-control"
                        title="Copy the current view as a code block you can paste in notes for an inline map."
                        onclick={() => {
                            copyBlock();
                        }}
                    >
                        Copy Block
                    </button>
                </ViewCollapsibleSection>
            {/if}

            {#if viewSettings.showEdit}
                <ViewCollapsibleSection
                    headerText="Edit"
                    expanded={settings.mapControls.editDisplayed}
                    afterToggle={(expanded) =>
                        setMapControl('editDisplayed', expanded)}
                >
                    <div class="graph-control-edit">
                        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                        <div
                            class="checkbox-container"
                            class:is-enabled={mapState.editMode}
                            onclick={() => {
                                mapState.editMode = !mapState.editMode;
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={mapState.editMode}
                                id="edit-active"
                            />
                        </div>
                        <label class="edit-label" for="edit-active"
                            >Edit Mode</label
                        >
                    </div>

                    <button
                        class="button"
                        class:mod-warning={mapState.editMode &&
                            noteToEdit === null}
                        title="Choose the note to use for adding markers and paths"
                        onclick={() => {
                            openChooseNote();
                        }}
                    >
                        Choose Note...
                    </button>
                    {#if noteToEdit !== null}
                        <span title={noteToEdit.basename}>
                            {@html getIcon('check').outerHTML}
                        </span>
                    {/if}
                    <select
                        class="dropdown mv-map-control"
                        bind:value={noteHeading}
                        title="Choose where in the selected note you wish markers and paths to be added."
                        disabled={noteToEdit === null}
                    >
                        <option value={null}>Append to end</option>
                        {#each allNoteHeadings as heading}
                            <option value={heading}>{heading}</option>
                        {/each}
                    </select>
                    <div class="mv-edit-tags">
                        {@html getIcon('tag').outerHTML}
                        <div class="mv-tag-chips">
                            <ChipsList bind:chips={editTags}></ChipsList>
                        </div>
                        <input
                            type="text"
                            bind:this={addTagInputElement}
                            class="text-input-inline"
                            placeholder="#tag"
                            style="width: 4em;"
                        />
                    </div>
                </ViewCollapsibleSection>
            {/if}
        </div>
    {/if}
</div>

<style>
    .top-right-controls {
        position: absolute;
        padding: 4px;
        top: 4px;
        right: 4px;
        display: flex;
        align-items: center;
    }

    .mv-filters-on {
        position: absolute;
        font-size: 0.3em;
        top: 4px;
        left: 4px;
        z-index: 1;
    }

    .minimize-button {
        background: transparent;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        padding: 0;
        display: flex;
    }

    .map-view-graph-controls.minimized {
        padding: 4px;
        display: flex;
        justify-content: flex-end;
    }

    .map-view-graph-controls.minimized .top-right-controls {
        position: relative;
        top: 0;
        left: 0;
    }

    .map-view-graph-controls:not(.minimized):has(.top-right-controls) {
        padding-right: 25px;
    }

    .minimize-button:hover {
        color: var(--text-normal);
    }

    .graph-control-follow-div {
        display: flex;
        align-items: center;
        gap: 4px;
        margin: 5px;
    }

    .follow-label {
        margin-left: 2px;
        line-height: 1;
    }
</style>
