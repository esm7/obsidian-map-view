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
    import { getAllTagNames } from 'src/pluginHelpers';
    import { NoteSelectDialog } from 'src/noteSelectDialog';
    import { type EditModeTools } from 'src/viewControls';
    import ChipsList from './ChipsList.svelte';

    let {
        plugin,
        app,
        settings,
        viewSettings,
        view,
        // For whatever sad reason, the fields of editModeTools duplicate the states of noteToEdit, noteHeading etc, and these
        // are synced manually
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
    let minimized = $state(settings.mapControlsMinimized);
    let previousState: MapState = null;

    // For whatever sad reason, the fields of editModeTools duplicate the states of noteToEdit, noteHeading etc, and these
    // are synced manually
    let noteToEdit: TFile = $state(null);
    let noteHeading: string | null = $state(null);
    let editTags: string[] = $state([]);

    let allNoteHeadings: string[] = $state([]);
    let allTags: string[] = $state(getAllTagNames(app, plugin));
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
        editModeTools.tags = editTags;
    });

    $effect(() => {
        if (noteToEdit) {
            const headings = app.metadataCache.getFileCache(noteToEdit)
                ?.headings as HeadingCache[];
            allNoteHeadings = headings
                ? headings.map((heading) => heading.heading)
                : [];
        }
    });

    export function updateControlsToState() {
        mapState = view.getState();
    }

    export function openEditSection(file?: TFile) {
        settings.mapControlsMinimized = false;
        minimized = false;
        setMapControl('editDisplayed', true);
        if (file) {
            noteToEdit = file;
            editModeTools.noteToEdit = noteToEdit;
        }
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
                }
            },
            'Choose a note to edit or press Shift+Enter to create new',
        );
        dialog.open();
    }

    // Update settings.mapControlsSections.<path> about whether a collapsible section of the accordion is open or not.
    function setMapControl(
        path: keyof typeof settings.mapControlsSections,
        value: boolean,
    ) {
        if (value && settings.onlyOneExpanded) {
            // Close all sections
            for (const key in settings.mapControlsSections) {
                settings.mapControlsSections[key] = false;
            }
        }
        settings.mapControlsSections[path] = value;
        plugin.saveSettings();
    }

    function toggleFollowActiveNote() {
        mapState.followActiveNote = !mapState.followActiveNote;
        // To prevent user confusion, clearing "follow active note" resets the query
        if (!mapState.followActiveNote) mapState.query = '';
    }

    function toggleFollowMyLocation() {
        mapState.followMyLocation = !mapState.followMyLocation;
    }

    // We save the current state in previousState before calling updateControlsToState because we don't want this initial
    // call to trigger an auto fit
    previousState = view.getState();
    updateControlsToState();
    // Initialize lastSavedState to the initial map state (this is not a reactive assignment, i.e. it does not update every time mapState changes).
    // svelte-ignore state_referenced_locally
    lastSavedState = mapState;

    $effect(() => {
        if (addTagInputElement) {
            const suggestor = new SimpleInputSuggest(
                app,
                addTagInputElement,
                allTags,
                (selection: string) => {
                    if (editTags.findIndex((tag) => tag === selection) === -1)
                        // Pushing while reassigning the array helps reactivity here
                        editTags = [...editTags, selection];
                    suggestor.close();
                    addTagInputElement.value = '';
                    addTagInputElement.blur();
                },
            );
        }
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
        const newDefault = { ...mapState, name: 'Default' };
        settings.defaultState = newDefault;
        view.defaultState = newDefault;
        presets = [view.defaultState, ...(settings.savedStates || [])];
        await plugin.saveSettings();
        new Notice('默认预设已更新');
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
        return areStatesEqual(state1, state2WithQuery1, view.display?.map);
    }
</script>

<div class="map-view-graph-controls" class:minimized>
    {#if viewSettings.showMinimizeButton || viewSettings.showFilters}
        <div class="top-right-controls">
            {#if viewSettings.showFilters}
                {#if mapState.query.length > 0}
                    <span class="mv-filters-on" title="过滤器已激活">🟠</span>
                {/if}
            {/if}
            {#if viewSettings.showMinimizeButton}
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <div
                    class="minimize-button"
                    title={settings.mapControlsMinimized
                        ? '展开控制'
                        : '最小化控制'}
                    onclick={() => {
                        minimized = !minimized;
                        settings.mapControlsMinimized = minimized;
                        plugin.saveSettings();
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
                    title="使用当前状态打开完整的地图视图。"
                    onclick={openButtonClick}
                >
                    打开
                </button>
            {/if}
            {#if viewSettings.showEmbeddedControls && !areStatesEqual(mapState, lastSavedState, view.display?.map)}
                <button
                    class="button"
                    title="用更新的视图状态更新源代码块。"
                    onclick={() => saveButton()}
                >
                    保存
                </button>
            {/if}
            {#if viewSettings.showFilters}
                <ViewCollapsibleSection
                    headerText="Filters"
                    expanded={settings.mapControlsSections.filtersDisplayed}
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
                    expanded={settings.mapControlsSections.viewDisplayed}
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
                        <option value="auto">自动</option>
                        <option value="light">浅色</option>
                        <option value="dark">深色</option>
                    </select>
                    <button
                        class="button"
                        title="重置视图为定义的默认值。"
                        onclick={() => {
                            selectedPreset = '0';
                            onChangePreset();
                        }}
                    >
                        重置
                    </button>
                    {#if viewSettings.viewTabType === 'regular'}
                        <button
                            class="button"
                            title="调整地图视图以适应所有当前显示的标记。"
                            onclick={() => {
                                view.autoFitMapToMarkers();
                            }}
                        >
                            适应
                        </button>
                        <div class="graph-control-toggle-div">
                            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                            <div
                                class="checkbox-container"
                                class:is-enabled={mapState.followMyLocation}
                                onclick={() => toggleFollowMyLocation()}
                            >
                                <input
                                    type="checkbox"
                                    checked={mapState.followMyLocation}
                                    id="follow-location-active"
                                />
                            </div>
                            <label
                                class="follow-location-label"
                                for="follow-location-active">跟随我的位置</label
                            >
                        </div>
                        <div class="graph-control-toggle-div">
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
                                >跟随活跃笔记</label
                            >
                        </div>

                        <select
                            class="dropdown mv-map-control"
                            bind:value={mapState.markerLabels}
                        >
                            <option value="off">无标签</option>
                            <option value="left">左侧标签</option>
                            <option value="right">右侧标签</option>
                        </select>
                    {/if}
                </ViewCollapsibleSection>
            {/if}
            {#if viewSettings.showLinks}
                <ViewCollapsibleSection
                    headerText="链接"
                    expanded={settings.mapControlsSections.linksDisplayed}
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
                        <option value="false">关闭</option>
                        <option value="true">显示链接</option>
                    </select>
                    <input
                        type="text"
                        class="mv-map-control"
                        placeholder="颜色"
                        bind:value={mapState.linkColor}
                        contenteditable="true"
                        title="线条（边）使用的颜色。可以是任何有效的 HTML 颜色，例如 'red' 或 '#bc11ff'。"
                        style="width: 6em;"
                    />
                </ViewCollapsibleSection>
            {/if}
            {#if viewSettings.showPresets}
                <ViewCollapsibleSection
                    headerText="预设"
                    expanded={settings.mapControlsSections.presetsDisplayed}
                    afterToggle={(expanded) =>
                        setMapControl('presetsDisplayed', expanded)}
                >
                    <select
                        class="dropdown mv-map-control"
                        bind:value={selectedPreset}
                        onchange={() => onChangePreset()}
                    >
                        <option value="-1">（无预设）</option>
                        {#each presets as preset, i}
                            <option value={i.toString()}>{preset.name}</option>
                        {/each}
                    </select>
                    <button
                        class="button mv-map-control"
                        title="将当前视图保存为预设。"
                        onclick={() => {
                            presetSaveAs();
                        }}
                    >
                        另存为...
                    </button>
                    <button
                        class="button mv-map-control"
                        title="删除当前选中的预设。"
                        onclick={() => {
                            deletePreset();
                        }}
                    >
                        删除
                    </button>
                    <button
                        class="button mv-map-control"
                        title="将当前视图保存为默认视图。"
                        onclick={() => {
                            saveAsDefault();
                        }}
                    >
                        保存为默认
                    </button>
                    <button
                        class="button mv-map-control"
                        title="复制当前视图为 URL。"
                        onclick={() => {
                            copyUrl();
                        }}
                    >
                        复制 URL
                    </button>
                    <button
                        class="button mv-map-control"
                        title="复制当前视图为代码块，可粘贴到笔记中嵌入地图。"
                        onclick={() => {
                            copyBlock();
                        }}
                    >
                        复制代码块
                    </button>
                </ViewCollapsibleSection>
            {/if}

            {#if viewSettings.showEdit}
                <ViewCollapsibleSection
                    headerText="编辑"
                    expanded={settings.mapControlsSections.editDisplayed}
                    afterToggle={(expanded) =>
                        setMapControl('editDisplayed', expanded)}
                >
                    <div class="graph-control-edit-section">
                        <div class="graph-control-edit-button">
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
                                >编辑模式</label
                            >
                        </div>

                        <div class="note-chooser">
                            <button
                                class="button"
                                class:mod-warning={mapState.editMode &&
                                    noteToEdit === null}
                                title={noteToEdit
                                    ? noteToEdit.basename
                                    : '选择用于添加标记和路径的笔记'}
                                onclick={() => {
                                    openChooseNote();
                                }}
                            >
                                {noteToEdit
                                    ? "添加到 '" +
                                      (noteToEdit.basename.length > 10
                                          ? noteToEdit.basename.substring(
                                                0,
                                                10,
                                            ) + '...'
                                          : noteToEdit.basename) +
                                      "'"
                                    : '选择笔记...'}
                            </button>
                            {#if noteToEdit !== null}
                                <span
                                    title={noteToEdit.basename}
                                    style="display: flex;"
                                >
                                    {@html getIcon('check').outerHTML}
                                </span>
                            {/if}
                        </div>

                        <select
                            class="dropdown mv-map-control edit-section-dropdown"
                            bind:value={noteHeading}
                            title="选择要将标记和路径添加到所选笔记的哪个位置。"
                            disabled={noteToEdit === null}
                        >
                            <option value={null}>追加到末尾</option>
                            {#each allNoteHeadings as heading}
                                <option value={heading}>{heading}</option>
                            {/each}
                        </select>
                        <div class="mv-edit-tags">
                            {@html getIcon('tag').outerHTML}
                            <ChipsList bind:chips={editTags}></ChipsList>
                            <input
                                type="text"
                                bind:this={addTagInputElement}
                                class="text-input-inline mv-tag-input"
                                placeholder="#tag"
                            />
                        </div>
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

    .edit-section-dropdown {
        width: 100%;
        box-sizing: border-box;
    }

    .graph-control-div {
        width: 100%;
        box-sizing: border-box;
    }

    .minimize-button:hover {
        color: var(--text-normal);
    }

    .graph-control-toggle-div {
        display: flex;
        align-items: center;
        gap: 4px;
        margin: 5px;
    }

    .follow-label {
        margin-left: 2px;
        line-height: 1;
    }

    .mv-edit-tags {
        padding: 2px;
        padding-top: 4px;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px;
        width: 100%;
        box-sizing: border-box;
    }

    .mv-tag-input {
        width: 4em;
        min-width: 4em;
        font-size: var(--font-ui-small);
        height: auto;
        padding: 2px 4px 2px 8px;
    }

    .graph-control-edit-section {
        display: flex;
        flex-direction: column;
        gap: 4px;
        width: 100%;
        box-sizing: border-box;
    }
    .graph-control-edit-button {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 2px 0;
        width: 100%;
    }
    .note-chooser {
        display: flex;
        align-items: center;
        gap: 5px;
        width: 100%;
    }
    .note-chooser button {
        flex: 1;
        min-width: 0;
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
    }
</style>
