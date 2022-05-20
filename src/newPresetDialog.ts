import { Modal, App, TextComponent, ButtonComponent } from 'obsidian';

import { PluginSettings } from 'src/settings';
import { MapState } from 'src/mapState';
import MapViewPlugin from 'src/main';

export class NewPresetDialog extends Modal {
    private plugin: MapViewPlugin;
    private settings: PluginSettings;
    private stateToSave: MapState;
    private callback: (index: string) => void;

    constructor(
        app: App,
        stateToSave: MapState,
        plugin: MapViewPlugin,
        settings: PluginSettings,
        callback: (index: string) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.settings = settings;
        this.stateToSave = stateToSave;
        this.callback = callback;
    }

    onOpen() {
        let statusLabel: HTMLDivElement = null;
        const grid = this.contentEl.createDiv({ cls: 'newPresetDialogGrid' });
        const row1 = grid.createDiv({ cls: 'newPresetDialogLine' });
        const row2 = grid.createDiv({ cls: 'newPresetDialogLine' });
        const row3 = grid.createDiv({ cls: 'newPresetDialogLine' });
        let name = new TextComponent(row1).onChange((value) => {
            if (value == 'Default' || value.length === 0)
                saveButton.disabled = true;
            else saveButton.disabled = false;
            if (this.findPresetByName(value))
                statusLabel.setText(
                    "Clicking 'Save' will overwrite an existing preset."
                );
            else statusLabel.setText('');
        });
        name.inputEl.style.width = '100%';
        name.inputEl.addEventListener('keypress', (ev: KeyboardEvent) => {
            if (ev.key == 'Enter') saveButton.buttonEl.click();
        });
        const includeMapSource = row2.createEl('input', { type: 'checkbox' });
        includeMapSource.id = 'includeMapSource';
        const includeMapSourceLabel = row2.createEl('label');
        includeMapSourceLabel.setAttribute('for', 'includeMapSource');
        includeMapSourceLabel.textContent = 'Include chosen map source';
        let saveButton = new ButtonComponent(row3)
            .setButtonText('Save')
            .onClick(async () => {
                let existingPreset = this.findPresetByName(name.getValue());
                let newState = { ...this.stateToSave, name: name.getValue() };
                if (!(includeMapSource as HTMLInputElement).checked)
                    newState.chosenMapSource = undefined;
                if (existingPreset) {
                    Object.assign(existingPreset, newState);
                    newState = existingPreset;
                } else {
                    this.settings.savedStates.push(newState);
                }
                await this.plugin.saveSettings();
                // Update the presets list
                const presetIndex = this.settings.savedStates.indexOf(newState);
                // Select the new preset in the view's controls
                this.callback((presetIndex + 1).toString());
                this.close();
            });
        new ButtonComponent(row3).setButtonText('Cancel').onClick(() => {
            this.close();
        });
        statusLabel = row3.createDiv();
        name.onChanged();
        name.inputEl.focus();
    }

    findPresetByName(name: string) {
        return this.settings.savedStates?.find(
            (preset) => preset.name === name
        );
    }
}
