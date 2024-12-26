<script lang="ts">
	import { untrack } from 'svelte';
	import { type TileLayerOffline } from 'leaflet.offline';
	import * as leaflet from 'leaflet';
	import { calculateTilesToDownload } from '../offlineTiles.svelte';
	import type { TileInfo } from 'leaflet.offline';

    let { 
    	onStart, 
    	close,
    	map,
    	tileLayer
    } = $props<{
    	onStart: (tiles: TileInfo[], requestsPerSecond: number) => void;
    	close: () => void;
    	map: leaflet.Map;
    	tileLayer: TileLayerOffline;
	}>();

	const MAX_TILES_TO_DOWNLOAD = 1000000;
	let displayedZoom = $state(map.getZoom());
	const MIN_ALLOWED_ZOOM = Math.min(6, displayedZoom);
	const MAX_ALLOWED_ZOOM = Math.max(20, displayedZoom);
	let minZoom = $state(displayedZoom - 1);
    let maxZoom = $state(displayedZoom + 1);
    let maxRequestsPerSecond = $state(10);
	let numTilesToDownload = $state(0);
	let skipExisting = $state(false);
	let estimationRunning = $state(0);
	let tileList: TileInfo[] = [];

    function handleSubmit() {
		onStart(tileList, maxRequestsPerSecond);
		close();
	}

	let tileCountCalculation: AbortController | null = null;

	$effect(() => {
		async function updateTileCount() {
			try {
				// Abort previous calculation if it is running
				tileCountCalculation?.abort();
				tileCountCalculation = new AbortController();
				// untrack is used here and below to avoid a recursive effect update
				estimationRunning = untrack(() => estimationRunning) + 1;
				tileList = await calculateTilesToDownload(
					map,
					tileLayer,
					minZoom,
					maxZoom,
					skipExisting,
					MAX_TILES_TO_DOWNLOAD,
					tileCountCalculation.signal
				);
				numTilesToDownload = tileList.length;
			}
			finally {
				estimationRunning = untrack(() => estimationRunning) - 1;
			}
		}
		updateTileCount();
	});


</script>

<div class="offline-new-job">
	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name"><b>Download Tiles for Offline Usage</b></div>
			<div class="setting-item-description">
				<p>
					Add a download job for the map tiles based on the current view, with a zoom range of your choice.
				</p>
				<p>
					Use responsibly and make sure you are not violating the terms of your tiles provider.
				</p>
			</div>
		</div>
	</div>
    <div class="setting-item">
        <div class="setting-item-info">
            <div class="setting-item-name">Minimum Zoom Level</div>
            <div class="setting-item-description">The closest zoom level to download</div>
        </div>
        <div class="setting-item-control">
            <div class="slider-container">
                <input 
                    type="range" 
                    bind:value={minZoom}
                    min="{MIN_ALLOWED_ZOOM}"
                    max="{displayedZoom}"
                    class="slider"
                />
                <div class="slider-value">{minZoom}</div>
            </div>
        </div>
    </div>

    <div class="setting-item">
        <div class="setting-item-info">
            <div class="setting-item-name">Current Zoom Level</div>
            <div class="setting-item-description">The zoom level currently displayed in the map.</div>
        </div>
		<div class="setting-item-control">
			<div class="slider-value"><b>{displayedZoom}</b></div>
		</div>
    </div>

    <div class="setting-item">
        <div class="setting-item-info">
            <div class="setting-item-name">Maximum Zoom Level</div>
            <div class="setting-item-description">The furthest zoom level to download</div>
        </div>
        <div class="setting-item-control">
            <div class="slider-container">
                <input 
                    type="range" 
                    bind:value={maxZoom}
                    min="{displayedZoom}"
                    max="{MAX_ALLOWED_ZOOM}"
                    class="slider"
                />
                <div class="slider-value">{maxZoom}</div>
            </div>
        </div>
    </div>

    <div class="setting-item mod-toggle">
        <div class="setting-item-info">
            <div class="setting-item-name">Skip Existing Tiles</div>
			<div class="setting-item-description">
				Only download tiles that aren't already in the cache.<br>
				Use this to continue previous downloads or turn it off to refresh old tiles.<br>
				(When this is on, calculating the tiles to download takes longer due to DB lookups.)
			</div>
        </div>
		<div class="setting-item-control">
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div class="checkbox-container" class:is-enabled={skipExisting} onclick={() => skipExisting = !skipExisting}>
                <input 
                    type="checkbox" 
                    checked={skipExisting}
                />
            </div>
        </div>
    </div>

    <div class="setting-item">
        <div class="setting-item-info">
            <div class="setting-item-name">Max Requests per Second</div>
            <div class="setting-item-description">Limit the rate of tile downloads</div>
        </div>
        <div class="setting-item-control">
            <input 
                type="number" 
                bind:value={maxRequestsPerSecond}
                min="1"
                max="50"
                class="text-input-inline"
            />
        </div>
    </div>

<div class="setting-item tiles-info-container">
    <div class="setting-item-info">
        <div class="setting-item-name"><b>Tiles to download in this job: {numTilesToDownload}</b></div>
        <div class="setting-item-description">
			{#if numTilesToDownload === MAX_TILES_TO_DOWNLOAD}
				<p><b>This is the maximal number of tiles to download at one job.</b> To download more, complete this job and start a new one with "Skip Existing Tiles" turned on.</p>
			{/if}
            <p>Before starting the download, make sure this is within the account quota of the tiles provider.</p>
            <p>Estimated time: {(numTilesToDownload / maxRequestsPerSecond / 60).toFixed(1)} minutes.</p>
        </div>
    </div>
	{#if estimationRunning > 0}
        <div class="loading-overlay">
            <div class="loading-container">
                <div class="loading-spinner"></div>
				<span>
					<b>Calculating tiles to download...</b>
					{#if skipExisting}
						<br>("Skip Existing Tiles" takes longer to calculate)
					{/if}
				</span>
            </div>
        </div>
    {/if}
</div>

    <div class="setting-item modal-button-container">
        <button class="mod-cta" onclick={handleSubmit} disabled={numTilesToDownload <= 0 || estimationRunning > 0}>
			Start Download
        </button>
        <button class="mod-warning" onclick={close}>
            Cancel
        </button>
    </div>
</div>

<style>
    .slider-container {
        display: flex;
        align-items: center;
        gap: var(--size-4-2);
    }

    .loading-container {
        display: flex;
        align-items: center;
        gap: var(--size-4-2);
    }

    .loading-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid var(--background-modifier-border);
        border-top-color: var(--interactive-accent);
        border-radius: 50%;
        animation: loading-spinner 0.8s linear infinite;
    }

    @keyframes loading-spinner {
        to {
            transform: rotate(360deg);
        }
    }

    .tiles-info-container {
        position: relative;
        min-height: 100px;
    }

    .loading-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(--background-primary);
        display: flex;
        align-items: center;
        justify-content: center;
    }
</style>

