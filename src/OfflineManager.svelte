<script lang="ts">
	import { App, request, Notice } from 'obsidian';
	import { type PluginSettings } from 'src/settings';
	import MapViewPlugin from 'src/main';
	import { SvelteModal } from 'src/svelte.ts';
	import OfflineNewJob from './OfflineNewJob.svelte';
	import { removeTile, saveTile, getStorageInfo, type TileLayerOffline, type TileInfo } from 'leaflet.offline';
	import { MapContainer } from 'src/mapContainer.ts';

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

	interface Job {
		id: number;
		name: string;
		tiles: TileInfo[];
		requestsPerSecond: number;
		progress: number;
		abortController: AbortController;
	}

	interface DownloadedLayerInfo {
		url: string;
		urlTemplate: string;
		tiles: number;
		totalSize: number;
	}

	let jobs: Job[] = $state([]);
	let downloadedTiles: DownloadedLayerInfo[] = $state([]);

	function cancelJob(jobId: number) {
		const job = jobs.find(job => job.id === jobId);
		if (job) {
			job.abortController.abort();
		}
	}

	function startJob(tiles: TileInfo[], requestsPerSecond: number) {
		const maxId = Math.max(0, ...jobs.map(job => typeof job.id === 'number' ? job.id : 0));
		const jobUrl = new URL(tiles[0]?.url).hostname;
		const jobName = `${tiles.length} tiles / ${jobUrl} / started ${new Date().toLocaleTimeString()}`;
		const newJob: Job = {
			id: maxId + 1,
			name: jobName,
			tiles: tiles,
			requestsPerSecond: requestsPerSecond,
			progress: 0,
			abortController: new AbortController
		};
		jobs = [...jobs, newJob];
		doDownloadJob(newJob);
	}

	async function doDownloadJob(job: Job) {
		let downloaded = 0;
		for (const tile of job.tiles) {
			try {
				const response = await requestUrl({ url: tile.url, contentType: 'image/png' });
				const buffer = await response.arrayBuffer;
				const startTime = Date.now();
				const blob = new Blob([buffer], { 
					type: 'image/png'
				});
				await saveTile(tile, blob);
				const endTime = Date.now();
				const elapsedMs = endTime - startTime;
				const minTimePerRequest = 1000 / job.requestsPerSecond;
				if (elapsedMs < minTimePerRequest) {
					await new Promise(resolve => setTimeout(resolve, minTimePerRequest - elapsedMs));
				}
				downloaded++;
				jobs = jobs.map(j => {
					if (j.id === job.id) {
						return { ...j, progress: (downloaded / job.tiles.length) * 100 };
					}
					return j;
				});
				if (job.abortController.signal.aborted) 
					break;
			} catch (error) {
				console.error(`Failed to download tile: ${tile.url}`, error);
				console.error(`Error details: ${error.message}`);
				new Notice(
					'Offline tiles downloaded failed, see the console for more details.',
				);
				break;
			}
		}
		jobs = jobs.filter(j => j.id !== job.id);
		await getDownloadedTiles();
		mapContainer.refreshMap();
	}

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
					totalSize: storageInfo.reduce((sum, item) => sum + item.blob.size, 0)
				}];
			}
		}
	}

	getDownloadedTiles();


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

	function startNewDownload() {
		const dialog = new SvelteModal(
			OfflineNewJob,
			app,
			plugin,
			settings,
			{ map: mapContainer.display.map, tileLayer, onStart: (tiles, requestsPerSecond) => startJob(tiles, requestsPerSecond) }
		);
		dialog.open();
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
{layer.tiles} tiles, total {(layer.totalSize / (1024 * 1024)).toFixed(1)}MB.
						</div>
					</div>
					<div class="setting-item-control">
						<button class="mod-warning" on:click={() => deleteDownload(layer)}>
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
						{#if jobs.length > 0}
							Once the ongoing job(s) finish, you will see them here.
						{:else}
							You can make the current view available offline using the button below.
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>
	{#if jobs.length > 0}
		<div class="setting-item">
			<div class="setting-item-name"><b>Ongoing Downloads</b></div>
		</div>
		<div class="jobs-container">
			{#each jobs as job}
				<div class="setting-item">
					<div class="setting-item-info">
						<div class="setting-item-name">{job.name}</div>
						<div class="setting-item-description">
							<span>Progress: {Math.round(job.progress)}%</span>
						</div>
					</div>
					<div class="setting-item-control">
						<button on:click={() => cancelJob(job.id)}>
							Cancel
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<div class="setting-item">
		<div class="setting-item-control">
			<button class="mod-cta" on:click={startNewDownload}>
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

</style>
