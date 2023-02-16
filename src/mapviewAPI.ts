import { App } from 'obsidian';
import { GeoSearcher, GeoSearcherProvider } from './geosearch';
import { PluginSettings } from 'src/settings';

export class MapViewAPI {
    public searchProvider: GeoSearcherProvider;
    public searcher: GeoSearcher;

    constructor(app: App, settings: PluginSettings) {
        this.searcher = new GeoSearcher(app, settings);
        this.searchProvider = this.searcher.searchProvider;
    }
}
