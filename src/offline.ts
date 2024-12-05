import { Modal, App, TextComponent, ButtonComponent } from 'obsidian';

import { type PluginSettings } from 'src/settings';
import MapViewPlugin from 'src/main';
import OfflineManager from './OfflineManager.svelte';
import { mount, unmount } from 'svelte';

export class OfflineManagerModal extends Modal {
    private plugin: MapViewPlugin;
    private settings: PluginSettings;
    private unmountComponent: () => void;

    constructor(app: App, plugin: MapViewPlugin, settings: PluginSettings) {
        super(app);
        this.plugin = plugin;
        this.settings = settings;
    }

    onOpen() {
        const component = mount(OfflineManager, { target: this.contentEl });
        this.unmountComponent = () => {
            unmount(component);
        };
    }

    onClose() {
        this.unmountComponent();
    }
}
