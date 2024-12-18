import { Modal, App } from 'obsidian';

import { type PluginSettings } from 'src/settings';
import MapViewPlugin from 'src/main';
import { mount, unmount, type SvelteComponent } from 'svelte';

export class SvelteModal extends Modal {
    private plugin: MapViewPlugin;
    private settings: PluginSettings;
    private unmountComponent: () => void;
    private component: typeof SvelteComponent<any>;
    private extraProps: Record<string, any>;

    constructor(
        component: typeof SvelteComponent<any>,
        app: App,
        plugin: MapViewPlugin,
        settings: PluginSettings,
        extraProps: Record<string, any> = {},
    ) {
        super(app);
        this.plugin = plugin;
        this.settings = settings;
        this.component = component;
        this.extraProps = extraProps;
    }

    onOpen() {
        const component = mount(this.component, {
            target: this.contentEl,
            props: {
                app: this.app,
                plugin: this.plugin,
                settings: this.settings,
                close: () => this.close(),
                ...this.extraProps,
            },
        });
        this.unmountComponent = () => {
            unmount(component);
        };
    }

    onClose() {
        this.unmountComponent();
    }
}
