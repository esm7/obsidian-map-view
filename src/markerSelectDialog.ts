import { Editor, App, SuggestModal, type Instruction } from 'obsidian';

import MapViewPlugin from 'src/main';
import { type PluginSettings } from 'src/settings';
import { FileMarker } from 'src/fileMarker';
import * as consts from 'src/consts';
import * as leaflet from 'leaflet';
import { BaseGeoLayer } from 'src/baseGeoLayer';

export async function getMarkerFromUser(
    center: leaflet.LatLng | null,
    title: string,
    app: App,
    plugin: MapViewPlugin,
    settings: PluginSettings,
): Promise<BaseGeoLayer | null> {
    return new Promise((resolve) => {
        const dialog = new MarkerSelectDialog(
            app,
            plugin,
            settings,
            (selection: any, evt: MouseEvent | KeyboardEvent) => {
                if (selection && selection.layer) {
                    resolve(selection.layer);
                } else {
                    resolve(null);
                }
            },
            title,
            center,
        );
        dialog.open();
    });
}

export class SuggestInfo {
    layer: FileMarker;
}

export class MarkerSelectDialog extends SuggestModal<SuggestInfo> {
    private plugin: MapViewPlugin;
    private settings: PluginSettings;
    private sortByCenter: leaflet.LatLng | null;

    // If dialogAction is 'custom', this will launch upon selection
    public customOnSelect: (
        selection: SuggestInfo,
        evt: MouseEvent | KeyboardEvent,
    ) => void;

    constructor(
        app: App,
        plugin: MapViewPlugin,
        settings: PluginSettings,
        action: (
            selection: SuggestInfo,
            evt: MouseEvent | KeyboardEvent,
        ) => void,
        title: string,
        sortByCenter: leaflet.LatLng | null = null,
    ) {
        super(app);
        this.plugin = plugin;
        this.settings = settings;
        this.customOnSelect = action;
        this.sortByCenter = sortByCenter;

        this.setPlaceholder(title);
        let instructions = [{ command: 'enter', purpose: 'to use' }];
        this.setInstructions(instructions);
        this.inputEl.addEventListener('keypress', (ev: KeyboardEvent) => {
            // In the case of a custom select function, trigger it also for Shift+Enter.
            // Obsidian doesn't have an API for that, so we find the selected item in a rather patchy way,
            // and manually close the dialog
            if (
                ev.key == 'Enter' &&
                ev.shiftKey &&
                this.customOnSelect != null
            ) {
                const chooser = (this as any).chooser;
                const selectedItem = chooser?.selectedItem;
                const values = chooser?.values;
                if (chooser && values) {
                    this.onChooseSuggestion(values[selectedItem], ev);
                    this.close();
                }
            }
        });
    }

    getSuggestions(query: string) {
        let results: SuggestInfo[] = [];
        for (const layer of this.plugin.layerCache.layers) {
            if (
                layer.name.toLowerCase().includes(query.toLowerCase()) &&
                layer instanceof FileMarker
            ) {
                results.push({ layer });
            }
        }
        if (this.sortByCenter) {
            results.sort(
                (a: SuggestInfo, b: SuggestInfo) =>
                    a.layer.location.distanceTo(this.sortByCenter) -
                    b.layer.location.distanceTo(this.sortByCenter),
            );
        }
        return results.slice(0, consts.MAX_QUERY_SUGGESTIONS);
    }

    renderSuggestion(value: SuggestInfo, el: HTMLElement) {
        el.addClass('map-search-suggestion');
        el.appendText(value.layer.name);
    }

    onChooseSuggestion(value: SuggestInfo, evt: MouseEvent | KeyboardEvent) {
        this.customOnSelect(value, evt);
    }
}
