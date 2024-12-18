import * as leaflet from 'leaflet';
import type { TileInfo, TileLayerOffline } from 'leaflet.offline';
import { hasTile } from 'leaflet.offline';

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
