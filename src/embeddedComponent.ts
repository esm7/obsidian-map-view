import { Component, TFile, App } from 'obsidian';
import { type PluginSettings } from 'src/settings';
import MapViewPlugin from 'src/main';
import { EmbeddedMap } from 'src/embeddedMap';
import { mergeStates } from 'src/mapState';

export class EmbeddedComponent extends Component {
    private plugin: MapViewPlugin;
    private contentEl: HTMLElement;
    private app: App;
    private file: TFile;
    private settings: PluginSettings;

    public constructor(
        contentEl: HTMLElement,
        plugin: MapViewPlugin,
        app: App,
        settings: PluginSettings,
        file: TFile,
        linkText: string | null,
    ) {
        super();
        this.contentEl = contentEl;
        this.plugin = plugin;
        this.app = app;
        this.file = file;
        this.settings = settings;
    }

    loadFile() {}
    unload() {}

    onload() {
        const query = `path:"${this.file.path}"`;
        let map = new EmbeddedMap(
            this.contentEl,
            null,
            this.app,
            this.settings,
            this.plugin,
            // The 'Save' button is extremely unwelcome here
            { showEmbeddedControls: false },
        );
        const fullState = mergeStates(this.settings.defaultState, {
            query,
            lock: true,
            autoFit: true,
        });
        map.open(fullState);
    }

    onunload() {}
}
