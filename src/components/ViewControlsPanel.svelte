<script lang="ts">
	import { untrack } from 'svelte';
	import { Notice, App, getIcon } from 'obsidian';
	import { type PluginSettings } from '../settings';
	import { type ViewSettings, MapContainer } from '../mapContainer';
	import MapViewPlugin from '../main';
	import ViewCollapsibleSection from './ViewCollapsibleSection.svelte';
	import { type MapState, areStatesEqual, mergeStates, copyState } from 'src/mapState';
	import { NewPresetDialog } from 'src/newPresetDialog';
	import { QuerySuggest } from 'src/query';
	import * as utils from 'src/utils';

	let {
		plugin, app, settings, viewSettings, view 
	} = $props<{
		plugin: MapViewPlugin;
		app: App;
		settings: PluginSettings;
		viewSettings: ViewSettings;
		view: MapContainer
	}>();

	let mapState: MapState = $state();

	let presets: MapState[] = $state([
		view.defaultState,
		...(settings.savedStates || []),
	]);
	let selectedPreset = $state('-1');
	let lastSavedState: MapState = $state();
	let minimized = $state(settings.mapControls.minimized);
	let suggestor: QuerySuggest = null;
	let queryInputElement: HTMLInputElement = $state();
	let previousState: MapState = null;

	$effect(() => {
		const considerAutoFit = statesDifferOnlyInQuery(mapState, previousState);
		if (!areStatesEqual(mapState, view.getState(), view.display?.map))
			view.internalSetViewState(mapState, false, considerAutoFit);
		// If the new state matches an existing preset, select that preset.
		const preset = findPresetIndexForCurrentState().toString();
		// We don't want this $effect to be called with selectedPreset changes; when the user selects a new
		// reset, the onChangePreset method does the job. Therefore we read selectedPreset using untrack.
		const untrackedSelectedPreset = untrack(() => selectedPreset);
		if (preset !== untrackedSelectedPreset)
			selectedPreset = preset.toString();
		previousState = copyState(mapState);
	});

	export function updateControlsToState() {
		mapState = view.getState();
	}

	// Update settings.mapControls.<path> about whether a collapsible section of the accordion is open or not
	function setMapControl(path: keyof typeof settings.mapControls, value: boolean) {
		settings.mapControls[path] = value;
		plugin.saveSettings();
	}

	function toggleFollowActiveNote() {
		mapState.followActiveNote = !mapState.followActiveNote;
		// To prevent user confusion, clearing "follow active note" resets the query
		if (!mapState.followActiveNote)
			mapState.query = '';
	}

	// We save the current state in previousState before calling updateControlsToState because we don't want this initial
	// call to trigger an auto fit
	previousState = view.getState()
	updateControlsToState();
	// Initialize lastSavedState to the initial map state (this is not a reactive assignment, i.e. it does not update every time mapState changes).
	// svelte-ignore state_referenced_locally
	lastSavedState = mapState;

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
			mapState = {...mergedState};
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
		plugin.openMapWithState(
			state,
			utils.mouseEventToOpenMode(
				settings,
				ev,
				'openMap',
			),
			false,
		);
	}

	// An inline block might contain just part of a map state, but we don't want this to necessarily cause the 'save' button
	// to appear just because fields are missing.
	function enrichState(partialState: Partial<MapState>) {
		return mergeStates(settings.defaultState, partialState);
	}

	async function saveButton() {
		view.updateCodeBlockCallback();
		lastSavedState = mapState;
	}

	function openQuerySuggest() {
		if (!suggestor) {
			suggestor = new QuerySuggest(
				app,
				plugin,
				queryInputElement,
			);
			suggestor.open();
		}
	}

	// Return true if the two states are identical except their query field
	function statesDifferOnlyInQuery(state1: MapState, state2: MapState) {
		if (state1.query == state2.query) return false;
		const state2WithQuery1 = {...state2, query: state1.query};
		return areStatesEqual(state1, state2WithQuery1);
	}

</script>

<div class="map-view-graph-controls" class:minimized={minimized}>
	{#if viewSettings.showMinimizeButton || viewSettings.showFilters}
		<div class="top-right-controls">
			{#if viewSettings.showFilters}
				{#if mapState.query.length > 0}
					<span class="mv-filters-on" title="Filters are active">🟠</span>
				{/if}
			{/if}
			{#if viewSettings.showMinimizeButton}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<div 
					class="minimize-button" 
					title={settings.mapControls.minimized ? "Expand controls" : "Minimize controls"}
					onclick={() => {setMapControl('minimized', !settings.mapControls.minimized); minimized = !minimized; }}
				>
					{@html getIcon(minimized ? 'maximize-2' : 'minimize-2').outerHTML}
				</div>
			{/if}
		</div>
	{/if}
	{#if !minimized}
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
					headerText='Filters' 
					expanded={settings.mapControls.filtersDisplayed} 
					afterToggle={(expanded) => setMapControl('filtersDisplayed', expanded)} 
				>
					<!-- The classes here utilize Obsidian styling -->
					<div class="search-input-container mv-map-control">
						<input 
							type="text" 
							placeholder="Query" 
							bind:value={mapState.query} 
							contenteditable="true" 
							class:graph-control-error={mapState.queryError}
							bind:this={queryInputElement}
							onfocus={() => openQuerySuggest()}
							onfocusout={() => { if (suggestor) { suggestor.close(); suggestor = null; }}}
						/>
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
						<div class="search-input-clear-button" onclick={() => mapState.query = ''}></div>
					</div>
				</ViewCollapsibleSection>
			{/if}
			{#if viewSettings.showView}
				<ViewCollapsibleSection 
					headerText='View' 
					expanded={settings.mapControls.viewDisplayed} 
					afterToggle={(expanded) => setMapControl('viewDisplayed', expanded)} 
				>
					<select class="dropdown mv-map-control" bind:value={mapState.chosenMapSource}>
						{#each settings.mapSources as source, i}
							<option value={i}>{source.name}</option>
						{/each}
					</select>
					<select class="dropdown mv-map-control" bind:value={settings.chosenMapMode}>
						<option value='auto'>Auto</option>
						<option value='light'>Light</option>
						<option value='dark'>Dark</option>
					</select>
					<button 
						class="button" 
						title="Reset the view to the defined default."
						onclick={() => { selectedPreset = "0"; onChangePreset(); }}
					>
						Reset
					</button>
					{#if viewSettings.viewTabType === 'regular'}
						<button
							class="button"
							title="Set the map view to fit all currently-displayed markers."
							onclick={view.autoFitMapToMarkers()}
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
								<input type="checkbox" checked={mapState.followActiveNote} id="follow-active"/>
							</div>
							<label class="follow-label" for="follow-active">Follow active note</label>
						</div>

						<select class="dropdown mv-map-control" bind:value={mapState.markerLabels}>
							<option value='off'>No labels</option>
							<option value='left'>Left labels</option>
							<option value='right'>Right labels</option>
						</select>
					{/if}
				</ViewCollapsibleSection>
			{/if}
			{#if viewSettings.showLinks}
				<ViewCollapsibleSection 
					headerText='Links' 
					expanded={settings.mapControls.linksDisplayed} 
					afterToggle={(expanded) => setMapControl('linksDisplayed', expanded)} 
				>
					<select 
						class="dropdown mv-map-control" 
						value={mapState.showLinks ? "true" : "false"}
						onchange={(e) => mapState.showLinks = e.currentTarget.value === 'true'}
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
					headerText='Presets' 
					expanded={settings.mapControls.presetsDisplayed} 
					afterToggle={(expanded) => setMapControl('presetsDisplayed', expanded)} 
				>
					<select
						class="dropdown mv-map-control"
						bind:value={selectedPreset}
						onchange={() => onChangePreset()}
					>
						<option value='-1'>(no preset)</option>
						{#each presets as preset, i}
							<option value={i.toString()}>{preset.name}</option>
						{/each}
					</select>
					<button 
						class="button mv-map-control" 
						title="Save the current view as a preset."
						onclick={() => { presetSaveAs(); }}
					>
						Save as...
					</button>
					<button 
						class="button mv-map-control" 
						title="Delete the currently-selected preset."
						onclick={() => { deletePreset(); }}
					>
						Delete
					</button>
					<button 
						class="button mv-map-control" 
						title="Save the current view as the default one."
						onclick={() => { saveAsDefault(); }}
					>
						Save as Default
					</button>
					<button 
						class="button mv-map-control" 
						title="Copy the current view as a URL."
						onclick={() => { copyUrl(); }}
					>
						Copy URL
					</button>
					<button 
						class="button mv-map-control" 
						title="Copy the current view as a code block you can paste in notes for an inline map."
						onclick={() => { copyBlock(); }}
					>
						Copy Block
					</button>
					
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
