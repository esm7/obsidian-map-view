import * as leaflet from 'leaflet';
import { App, TFile } from 'obsidian';
import * as path from 'path';

import { type FileMarker } from 'src/fileMarker';
import { type PluginSettings } from 'src/settings';
import type MapViewPlugin from 'src/main';
import { SvelteModal } from 'src/svelte';
import { appendGeolocationToNote } from 'src/utils';
import * as utils from 'src/utils';
import TextBoxDialog from './components/TextBoxDialog.svelte';

export async function renameMarker(
    marker: FileMarker,
    settings: PluginSettings,
    app: App,
    plugin: MapViewPlugin,
) {
    const dialog = new SvelteModal(TextBoxDialog, app, plugin, settings, {
        label: 'Select a name for the new marker:',
        description: marker.isFrontmatterMarker
            ? 'This will rename the file the marker is stored at.'
            : undefined,
        existingText: marker.name,
        onOk: (text: string) => {
            if (marker.isFrontmatterMarker) {
                const newPath = path.join(
                    marker.file.parent.name,
                    text + '.' + marker.file.extension,
                );
                app.vault.rename(marker.file, newPath);
            } else if (marker.geolocationMatch?.groups) {
                utils.updateInlineGeolocation(
                    app,
                    marker.file,
                    marker.fileLocation,
                    marker.geolocationMatch,
                    marker.location,
                    text,
                );
            }
        },
    });
    dialog.open();
}

export async function createMarkerInFile(
    location: leaflet.LatLng,
    file: TFile,
    heading: string | null,
    tags: string[],
    app: App,
    settings: PluginSettings,
    plugin: MapViewPlugin,
) {
    const dialog = new SvelteModal(TextBoxDialog, app, plugin, settings, {
        label: 'Select a name for the new marker:',
        existingText: 'New Marker',
        onOk: (text: string) => {
            appendGeolocationToNote(
                file,
                heading,
                text,
                location,
                tags,
                app,
                settings,
            );
        },
    });
    dialog.open();
}
