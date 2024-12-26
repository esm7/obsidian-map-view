import { requestUrl, Notice } from 'obsidian';
import * as leaflet from 'leaflet';
import {
    hasTile,
    saveTile,
    getStorageInfo,
    removeTile,
    type TileLayerOffline,
    type TileInfo,
    type StoredTile,
} from 'leaflet.offline';
import type { PluginSettings } from 'src/settings';
import MapViewPlugin from 'src/main';
import { SvelteModal } from 'src/svelte';
import OfflineManagerDialog from './components/OfflineManagerDialog.svelte';
import { MapContainer } from 'src/mapContainer';

interface Job {
    id: number;
    name: string;
    tiles: TileInfo[];
    requestsPerSecond: number;
    progress: number;
    abortController: AbortController;
    onFinish: () => void;
}

let jobs: Job[] = $state([]);

export function openManagerDialog(
    plugin: MapViewPlugin,
    settings: PluginSettings,
    mapContainer: MapContainer,
) {
    const dialog = new SvelteModal(
        OfflineManagerDialog,
        plugin.app,
        plugin,
        settings,
        {
            mapContainer: mapContainer,
            tileLayer: mapContainer.display.tileLayer,
        },
    );
    dialog.open();
}

export function getJobs() {
    return jobs;
}

export function cancelJob(jobId: number) {
    const job = jobs.find((job) => job.id === jobId);
    if (job) {
        job.abortController.abort();
    }
}

export function startJob(
    tiles: TileInfo[],
    requestsPerSecond: number,
    onFinish: () => void,
) {
    const maxId = Math.max(
        0,
        ...jobs.map((job) => (typeof job.id === 'number' ? job.id : 0)),
    );
    const jobUrl = new URL(tiles[0]?.url).hostname;
    const jobName = `${tiles.length} tiles / ${jobUrl} / started ${new Date().toLocaleTimeString()}`;
    const newJob: Job = {
        id: maxId + 1,
        name: jobName,
        tiles,
        requestsPerSecond,
        progress: 0,
        abortController: new AbortController(),
        onFinish,
    };
    jobs = [...jobs, newJob];
    doDownloadJob(newJob);
}

async function downloadSingleTile(tileInfo: TileInfo) {
    const response = await requestUrl({
        url: tileInfo.url,
        contentType: 'image/png',
    });
    const buffer = response.arrayBuffer;
    const blob = new Blob([buffer], {
        type: 'image/png',
    });
    await saveTile(tileInfo, blob);
}

/**
 * This is a ugly hack that's required to cache an image after the browser (using an img element)
 * has already downloaded it.
 * We want to store the tile in the DB but it's not available to us at a binary form.
 * The straight-forward solution is to download it again programatically with 'fetch', but that's very wasteful.
 * So instead, we take the hard path, of drawing it on a canvas then converting to a blob.
 * It seems annoying and inefficient, but it's considerably better than re-downloading.
 */
async function getBlobFromImageElement(
    image: HTMLImageElement,
    helperCanvas: HTMLCanvasElement,
): Promise<Blob> {
    // We can't use the image in a buffer as we intend to do below unless we assure the CORS mechanism we're allowed
    // to do.
    image.crossOrigin = 'Anonymous';
    // Wait for the image to be fully loaded
    await image.decode();
    let bitmap = await createImageBitmap(image);
    let ctx = helperCanvas.getContext('2d');
    helperCanvas.width = bitmap.width;
    helperCanvas.height = bitmap.height;
    ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
    return new Promise<Blob>((resolve) => {
        helperCanvas.toBlob((blob) => {
            resolve(blob);
        }, 'image/png');
    });
}

export async function saveDownloadedTile(
    element: HTMLImageElement,
    layer: TileLayerOffline,
    point: leaflet.Point,
    zoom: number,
    helperCanvas: HTMLCanvasElement,
) {
    // This function saved an existing image element into a blob that the leaflet.offline library knows how to use.
    // Beware, it gets ugly, as the library wasn't really designed to do this.
    // First we need to craft a TileInfo object that can identify the tile in the DB, we do this by reversing what the
    // getTileUrls expects from the layer object that we have.
    const projectedPoint = point.multiplyBy(layer.getTileSize().x);
    const tiles = layer.getTileUrls(
        leaflet.bounds(projectedPoint, projectedPoint),
        zoom,
    );
    if (tiles?.length > 0) {
        const tile = tiles[0];
        try {
            const blob = await getBlobFromImageElement(element, helperCanvas);
            await saveTile(tile, blob);
            // Success
            return true;
        } catch (e) {}
    }
    return false;
}

async function doDownloadJob(job: Job) {
    let downloaded = 0;
    for (const tile of job.tiles) {
        try {
            const startTime = Date.now();
            await downloadSingleTile(tile);
            const endTime = Date.now();
            const elapsedMs = endTime - startTime;
            const minTimePerRequest = 1000 / job.requestsPerSecond;
            if (elapsedMs < minTimePerRequest) {
                await new Promise((resolve) =>
                    setTimeout(resolve, minTimePerRequest - elapsedMs),
                );
            }
            downloaded++;
            jobs = jobs.map((j) => {
                if (j.id === job.id) {
                    return {
                        ...j,
                        progress: (downloaded / job.tiles.length) * 100,
                    };
                }
                return j;
            });
            if (job.abortController.signal.aborted) break;
        } catch (error) {
            console.error(`Failed to download tile: ${tile.url}`, error);
            console.error(`Error details: ${error.message}`);
            new Notice(
                'Offline tiles downloaded failed, see the console for more details.',
            );
            break;
        }
    }
    jobs = jobs.filter((j) => j.id !== job.id);
    job.onFinish();
}

export async function calculateTilesToDownload(
    map: leaflet.Map,
    tileLayer: TileLayerOffline,
    fromZoom: number,
    toZoom: number,
    skipExisting: boolean,
    maxTiles: number,
    signal?: AbortSignal,
) {
    let newTiles: TileInfo[] = [];
    let existingTiles = 0;
    const MIN_ZOOM = 5;
    fromZoom = Math.max(fromZoom, MIN_ZOOM);

    const saveArea = map.getBounds();

    for (let zoom = fromZoom; zoom <= toZoom; zoom++) {
        const area = leaflet.bounds(
            map.project(saveArea.getNorthWest(), zoom),
            map.project(saveArea.getSouthEast(), zoom),
        );
        const tilesInZoomLevel = tileLayer.getTileUrls(area, zoom);
        for (let i = 0; i < tilesInZoomLevel.length; i++) {
            const tile = tilesInZoomLevel[i];

            if (signal?.aborted) {
                return [];
            }

            // Yield to UI every 100 tiles
            if (i % 1000 === 0) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }

            if (skipExisting && (await hasTile(tile.key))) existingTiles++;
            else newTiles.push(tile);

            if (newTiles.length >= maxTiles) {
                console.error('Too many tiles');
                return newTiles;
            }
        }
    }
    return newTiles;
}

// Returns the number of tiles that were purged
export async function purgeOldTiles(urlTemplate: string, maxMonths: number) {
    const now = Date.now();
    const storageInfo = await getStorageInfo(urlTemplate);
    let numPurged = 0;
    for (const tile of storageInfo) {
        const tileTime = tile.createdAt;
        const monthsAgo = (now - tileTime) / (1000 * 60 * 60 * 24 * 30);
        if (monthsAgo > maxMonths) {
            await removeTile(tile.key);
            numPurged++;
        }
    }
    return numPurged;
}

// Returns the number of tiles that were purged
export async function purgeTilesBySettings(settings: PluginSettings) {
    if (
        settings.offlineMaxTileAgeMonths === 0 &&
        settings.offlineMaxStorageGb === 0
    )
        return 0;
    let allTiles: StoredTile[] = [];
    let numPurged = 0;
    let totalSize = 0;
    const sources = settings.mapSources;
    const now = Date.now();
    for (const mapSource of sources) {
        const url = mapSource.urlLight;
        const storageInfo = await getStorageInfo(url);
        for (const tile of storageInfo) {
            const tileTime = tile.createdAt;
            const monthsAgo = (now - tileTime) / (1000 * 60 * 60 * 24 * 30);
            if (
                settings.offlineMaxTileAgeMonths > 0 &&
                monthsAgo > settings.offlineMaxTileAgeMonths
            ) {
                await removeTile(tile.key);
                numPurged++;
            } else {
                allTiles.push(tile);
                totalSize += tile.blob.size;
            }
        }
    }
    if (settings.offlineMaxStorageGb > 0) {
        allTiles.sort((a, b) => a.createdAt - b.createdAt);
        // Remove oldest tiles until we're under the storage limit
        while (
            totalSize > settings.offlineMaxStorageGb * 1024 * 1024 * 1024 &&
            allTiles.length > 0
        ) {
            const oldestTile = allTiles.shift();
            totalSize -= oldestTile.blob.size;
            await removeTile(oldestTile.key);
            numPurged++;
        }
    }
    if (numPurged > 0)
        new Notice(
            `Map View removed ${numPurged} old offline tiles according to the settings.`,
        );
}
