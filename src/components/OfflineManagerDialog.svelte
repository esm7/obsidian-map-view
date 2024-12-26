<script lang="ts">
	import { Notice, App, getIcon } from 'obsidian';
	import { type PluginSettings } from '../settings';
	import MapViewPlugin from '../main';
	import { SvelteModal } from '../svelte';
	import OfflineNewJobDialog from './OfflineNewJobDialog.svelte';
	import OfflinePurgeDialog from './OfflinePurgeDialog.svelte';
	import { removeTile, getStorageInfo, type TileLayerOffline, type TileInfo } from 'leaflet.offline';
	import { MapContainer } from '../mapContainer';
	import * as offlineTiles from '../offlineTiles.svelte';

	let {
		plugin, app, close, settings, mapContainer, tileLayer
	} = $props<{
		plugin: MapViewPlugin;
		app: App;
		close: () => void;
		settings: PluginSettings;
		mapContainer: MapContainer;
		tileLayer: TileLayerOffline;
	}>();

	interface DownloadedLayerInfo {
		url: string;
		urlTemplate: string;
		tiles: number;
		totalSize: number;
		oldestTile: number;
	}

	let downloadedTiles: DownloadedLayerInfo[] = $state([]);

	async function getDownloadedTiles() {
		downloadedTiles = [];
		const sources = settings.mapSources;
		for (const mapSource of sources) {
					const url = mapSource.urlLight;
					const storageInfo = await getStorageInfo(url);
					if (storageInfo.length > 0) {
						downloadedTiles = [...downloadedTiles, {
							url: new URL(url).hostname,
							urlTemplate: url,
							tiles: storageInfo.length,
							totalSize: storageInfo.reduce((sum, item) => sum + item.blob.size, 0),
							oldestTile: Math.min(...storageInfo.map(item => item.createdAt))
						}];
					}
		}
	}

	getDownloadedTiles();

	async function openPurgeDialog(layer: DownloadedLayerInfo) {
		const dialog = new SvelteModal(
			OfflinePurgeDialog,
			app,
			plugin,
			settings,
			{ urlTemplate: layer.urlTemplate, beforeClose: () => { getDownloadedTiles(); } }
		);
		dialog.open();
	}

	async function deleteDownload(layer: DownloadedLayerInfo) {
		if (!confirm('This will delete all the tiles for the selected URL, are you sure?'))
			return;
		const storageInfo = await getStorageInfo(layer.urlTemplate);
		for (const tile of storageInfo) {
			await removeTile(tile.key);
			// Change the downloadedTiles list in the strange way that will trigger
			// Svelte's reactivity and update the numbers on the go
			downloadedTiles = downloadedTiles.map(l => {
				if (l.urlTemplate === layer.urlTemplate) {
					return {
						...l,
						tiles: l.tiles - 1,
						totalSize: l.totalSize - tile.blob.size
					};
				}
				return l;
			});
		}
		await getDownloadedTiles();
		mapContainer.refreshMap();
	}

	function openNewDownloadDialog() {
		const dialog = new SvelteModal(
			OfflineNewJobDialog,
			app,
			plugin,
			settings,
			{ map: mapContainer.display.map, tileLayer, onStart: (tiles, requestsPerSecond) => startJob(tiles, requestsPerSecond) }
		);
		dialog.open();
	}

	async function startJob(tiles: TileInfo[], requestsPerSecond: number) {
			offlineTiles.startJob(tiles, requestsPerSecond, async () => {
				await getDownloadedTiles();
				mapContainer.refreshMap();
				// The job goes to do its thing in offlineTiles.svelte.ts regardless of whether this dialog is open.
				// If by the time it is done the dialog isn't around anymore, notify the user by a notice.
				if (!document.body.contains(document.querySelector('.offline-manager')))
					new Notice(
						'Map View: an offline background download has finished.'
					);
			});
		}
</script>

<div class="offline-manager">
	<div class="setting-item-container">
		<div class="setting-item-heading">Downloaded Tiles</div>
		{#if downloadedTiles.length > 0}
			{#each downloadedTiles as layer}
				<div class="setting-item">
					<div class="setting-item-info">
						<div class="setting-item-name">{layer.url}</div>
						<div class="setting-item-description">
{layer.tiles} tiles, total <b>{(layer.totalSize / (1024 * 1024)).toFixed(1)}MB</b>.<br>
Oldest tile is from {new Date(layer.oldestTile).toISOString().split('T')[0]}.
						</div>
					</div>
					<div class="setting-item-control">
						<button onclick={() => openPurgeDialog(layer)}>
							Purge old...
						</button>
						<button class="mod-warning" onclick={() => deleteDownload(layer)}>
							Delete
						</button>
					</div>
				</div>
			{/each}
		{:else}
			<div class="setting-item">
				<div class="setting-item-info">
					<div class="setting-item-name">
						No tiles were downloaded yet.
					</div>
					<div class="setting-item-description">
						{#if offlineTiles.getJobs().length > 0}
							Once the ongoing job(s) finish, you will see them here.
						{:else}
							You can make the current view available offline using the button below.
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>

	<div class="info-container">
		<div class="info-icon">
			{@html getIcon('info').outerHTML}
		</div>
		<p>You can see a visualization of your offline tiles using the "Highlight Offline Tiles" option in the Map View context menu.</p>
	</div>
	{#if offlineTiles.getJobs().length > 0}
		<div class="setting-item">
			<div class="setting-item-name"><b>Ongoing Downloads</b></div>
		</div>
		<div class="jobs-container">
			{#each offlineTiles.getJobs() as job}
				<div class="setting-item">
					<div class="setting-item-info">
						<div class="setting-item-name">{job.name}</div>
						<div class="setting-item-description">
							<span>Progress: {Math.round(job.progress)}%</span>
						</div>
					</div>
					<div class="setting-item-control">
						<button onclick={() => offlineTiles.cancelJob(job.id)}>
							Cancel
						</button>
					</div>
				</div>
			{/each}
			<div class="info-container">
				<div class="info-icon">
					{@html getIcon('info').outerHTML}
				</div>
				<p>Downloads will continue in the background whether or not this dialog is open.</p>
			</div>
		</div>
	{/if}

	<div class="setting-item">
		<div class="setting-item-control">
			<button class="mod-cta" onclick={openNewDownloadDialog}>
				Download Tiles...
			</button>
		</div>
	</div>

</div>

<style>
	.offline-manager {
		padding: var(--size-4-2);
	}

	.jobs-container {
		margin-bottom: var(--size-4-2);
	}

	.info-container {
		display: flex;
		align-items: center;
		gap: var(--size-4-2);
		color: var(--text-muted);
	}

	.info-icon {
		width: 16px;
		height: 16px;
	}

</style>
