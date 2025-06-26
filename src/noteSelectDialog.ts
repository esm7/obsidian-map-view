import { Editor, App, SuggestModal, TFile, type Instruction } from 'obsidian';

import MapViewPlugin from 'src/main';
import { type PluginSettings } from 'src/settings';

export class SuggestInfo {
    file: TFile;
}

export class NoteSelectDialog extends SuggestModal<SuggestInfo> {
    private plugin: MapViewPlugin;
    private settings: PluginSettings;

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
    ) {
        super(app);
        this.plugin = plugin;
        this.settings = settings;
        this.customOnSelect = action;

        this.setPlaceholder(title);
        let instructions = [
            { command: 'enter', purpose: 'to use' },
            { command: 'shift+enter', purpose: 'create a new note' },
        ];
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
                // TODO support create new note
                if (chooser && values) {
                    this.onChooseSuggestion(values[selectedItem], ev);
                    this.close();
                }
            }
        });
    }

    getSuggestions(query: string) {
        let results: SuggestInfo[] = [];
        for (const file of this.app.vault.getMarkdownFiles()) {
            if (file.basename.toLowerCase().includes(query.toLowerCase())) {
                results.push({ file });
            }
        }
        results.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
        return results;
    }

    renderSuggestion(value: SuggestInfo, el: HTMLElement) {
        el.addClass('map-search-suggestion');
        el.appendText(value.file.basename);
    }

    onChooseSuggestion(value: SuggestInfo, evt: MouseEvent | KeyboardEvent) {
        this.customOnSelect(value, evt);
    }
}
