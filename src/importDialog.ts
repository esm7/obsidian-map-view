import {
    Modal,
    App,
    Editor,
    TextAreaComponent,
    ButtonComponent,
} from 'obsidian';

import { XMLParser } from 'fast-xml-parser';

import { PluginSettings } from 'src/settings';
import MapViewPlugin from 'src/main';
import * as utils from 'src/utils';
import * as regex from 'src/regex';

/**
 * TODO! This is an unfinished feature of an Import dialog, currently only from KML (that can be exported
 * from Google Maps).
 * It's written very roughly as a POC and needs lots of cleaning up before enabling for all users.
 */

export class ImportDialog extends Modal {
    private editor: Editor;
    private plugin: MapViewPlugin;
    private settings: PluginSettings;

    constructor(
        editor: Editor,
        app: App,
        plugin: MapViewPlugin,
        settings: PluginSettings
    ) {
        super(app);
        this.editor = editor;
        this.plugin = plugin;
        this.settings = settings;
    }

    onOpen() {
        const grid = this.contentEl.createDiv({ cls: 'importDialogGrid' });
        const row1 = grid.createDiv({ cls: 'importDialogLine' });
        const row2 = grid.createDiv({ cls: 'importDialogLine' });
        const row3 = grid.createDiv({ cls: 'importDialogLine' });
        const row4 = grid.createDiv({ cls: 'importDialogLine' });
        row1.innerHTML = `
			<p>This <b>experimental</b> tool can import geolocations from a KML file into the current note.</p>
			<input type="file" accept=".kml" id="file-input"/>
		`;
        // TODO make collapsible
        const templateBox = new TextAreaComponent(row2).setValue(
            `- [{{name}}](geo:{{location}})`
        );
        const fileInput = document.getElementById(
            'file-input'
        ) as HTMLInputElement;
        let imported: ImportedFile | null = null;
        fileInput.addEventListener('change', (ev) => {
            const fileReader = new FileReader();
            fileReader.readAsText(fileInput.files[0]);
            fileReader.addEventListener('load', async () => {
                if (typeof fileReader.result === 'string') {
                    imported = await tryKmlImport(fileReader.result);
                    if (imported && imported.items.length > 0) {
                        row3.innerHTML = `${imported.items.length} items ready for import`;
                    } else {
                        row3.innerHTML = 'Unable to import from this file';
                    }
                }
            });
        });
        const importButton = new ButtonComponent(row4)
            .setButtonText('Import')
            .onClick(async () => {
                if (!imported || imported.items.length === 0) return;
                const text = styleImportedList(
                    imported,
                    templateBox.getValue()
                );
                if (text) {
                    this.editor.replaceSelection(text);
                    utils.verifyOrAddFrontMatterForInline(
                        this.editor,
                        this.settings
                    );
                }
                this.close();
            });
    }
}

type ImportedFile = {
    title?: string;
    items: ImportedItem[];
};

type ImportedItem = {
    name?: string;
    lat: number;
    lng: number;
};

async function tryKmlImport(fileContent: string): Promise<ImportedFile | null> {
    const result: ImportedFile = {
        title: null,
        items: [],
    };
    try {
        const parser = new XMLParser();
        const parsedContent = parser.parse(fileContent);
        let mainDocument = parsedContent?.kml?.Document;
        if (mainDocument) {
            const name = mainDocument.name;
            const places = mainDocument.Placemark;
            if (places && places.length > 0) {
                if (name && name.length > 0) result.title = name;
                for (const place of places) {
                    const placeName = place.name;
                    const placeCoords = place.Point?.coordinates;
                    if (
                        placeCoords &&
                        placeCoords.length > 0 &&
                        typeof placeCoords === 'string'
                    ) {
                        const coordinates = placeCoords.match(
                            regex.COORDINATES
                        );
                        if (coordinates && coordinates.length > 3) {
                            result.items.push({
                                name: placeName,
                                lat: parseFloat(coordinates[3]),
                                lng: parseFloat(coordinates[1]),
                            });
                        }
                    }
                }
                return result;
            }
        }
    } catch (e) {
        // TODO have a proper error here
        console.log('Import error', e);
    }
    return null;
}

function styleImportedList(imported: ImportedFile, template: string): string {
    let result = '';

    if (imported.title) result += `## ${imported.title}\n`;
    for (const item of imported.items) {
        const formattedItem = template
            .replace(/\{\{name}}/g, item.name)
            .replace(/\{\{location}}/g, `${item.lat},${item.lng}`);
        result += formattedItem + '\n';
    }
    return result;
}
