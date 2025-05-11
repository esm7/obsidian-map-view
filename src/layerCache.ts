import { BaseGeoLayer, type MarkersMap } from 'src/baseGeoLayer';

export class LayerCache {
    private layersMap: MarkersMap = new Map();
    private layersByFilePath: Record<string, BaseGeoLayer[]> = {};

    /*
     * By default, create a new structure.
     * If an existing structure is given, copy it.
     */
    constructor(other?: LayerCache) {
        if (other) {
            this.layersMap = new Map(other.layersMap);
            // Deep copy the layersByFilePath object
            this.layersByFilePath = {};
            for (const filePath in other.layersByFilePath) {
                this.layersByFilePath[filePath] = [
                    ...other.layersByFilePath[filePath],
                ];
            }
        }
    }

    get layers(): MapIterator<BaseGeoLayer> {
        return this.layersMap.values();
    }

    get map(): MarkersMap {
        return this.layersMap;
    }

    get size() {
        return this.layersMap.size;
    }

    public get(layerId: string) {
        return this.layersMap.get(layerId);
    }

    // Assumes the layer doesn't exist yet
    public add(layer: BaseGeoLayer) {
        if (this.layersMap.get(layer.id))
            console.error(
                `Layer with ID ${layer.id} already in LayersCache! details:`,
                this.layersMap.get(layer.id),
            );
        this.layersMap.set(layer.id, layer);
        const filePath = layer.file.path;
        if (!this.layersByFilePath[filePath]) {
            this.layersByFilePath[filePath] = [];
        }
        this.layersByFilePath[filePath].push(layer);
    }

    public delete(layerId: string) {
        const filePath = this.layersMap.get(layerId).file.path;
        this.layersMap.delete(layerId);
        this.layersByFilePath[filePath] = this.layersByFilePath[
            filePath
        ].filter((l) => l.id !== layerId);
    }

    public deleteAllFromFile(filePath: string) {
        const layersOfFile = this.layersByFilePath[filePath];
        if (layersOfFile) {
            for (const layer of layersOfFile) this.layersMap.delete(layer.id);
            this.layersByFilePath[filePath] = [];
        }
    }

    public hasLayersFromFile(filePath: string) {
        return this.layersByFilePath[filePath]?.length > 0;
    }

    public clear() {
        this.layersMap.clear();
        this.layersByFilePath = {};
    }
}
