import { requestUrl, Notice } from 'obsidian';
import * as leaflet from 'leaflet';
import {
    hasTile,
    saveTile,
    type TileLayerOffline,
    type TileInfo,
} from 'leaflet.offline';

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

async function doDownloadJob(job: Job) {
    let downloaded = 0;
    for (const tile of job.tiles) {
        try {
            const response = await requestUrl({
                url: tile.url,
                contentType: 'image/png',
            });
            const buffer = response.arrayBuffer;
            const startTime = Date.now();
            const blob = new Blob([buffer], {
                type: 'image/png',
            });
            await saveTile(tile, blob);
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
