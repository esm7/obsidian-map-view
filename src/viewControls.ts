import {
  App,
  ButtonComponent,
  getAllTags,
  TextComponent,
  DropdownComponent,
} from "obsidian";

import {
  PluginSettings,
  MapLightDark,
  MapState,
  areStatesEqual,
  mergeStates,
} from "src/settings";
import { MapView } from "src/mapView";
import { NewPresetDialog } from "src/newPresetDialog";
import MapViewPlugin from "src/main";

export class ViewControls {
  private parentElement: HTMLElement;
  private settings: PluginSettings;
  private app: App;
  private view: MapView;
  private plugin: MapViewPlugin;

  public controlsDiv: HTMLDivElement;
  private tagsBox: TextComponent;
  private mapSourceBox: DropdownComponent;
  private sourceMode: DropdownComponent;

  private presetsDiv: HTMLDivElement;
  private presetsDivContent: HTMLDivElement = null;
  private presetsBox: DropdownComponent;
  private lastSelectedPresetIndex: number = null;
  private lastSelectedPreset: MapState = null;

  constructor(
    parentElement: HTMLElement,
    settings: PluginSettings,
    app: App,
    view: MapView,
    plugin: MapViewPlugin
  ) {
    this.parentElement = parentElement;
    this.settings = settings;
    this.app = app;
    this.view = view;
    this.plugin = plugin;
  }

  getCurrentState(): MapState {
    return this.view.getState() as MapState;
  }

  async setNewState(newState: MapState, considerAutoFit: boolean) {
    await this.view.setViewState(newState, false, considerAutoFit);
  }

  async setStateByNewMapSource(newSource: number) {
    // Update the state assuming the controls are updated
    const state = this.getCurrentState();
    await this.setNewState({ ...state, chosenMapSource: newSource }, false);
  }

  public tryToGuessPreset() {
    // Try to guess the preset based on the current state, and choose it in the dropdown
    // (e.g. for when the plugin loads with a state)
    const currentState = this.getCurrentState();
    const states = [
      this.settings.defaultState,
      ...(this.settings.savedStates || []),
    ];
    for (const [index, state] of states.entries())
      if (areStatesEqual(state, currentState)) {
        this.presetsBox.setValue(index.toString());
        this.lastSelectedPresetIndex = index;
        this.lastSelectedPreset = currentState;
        break;
      }
  }

  public updateControlsToState() {
    this.setMapSourceBoxByState();
    this.setTagsBoxByState();
  }

  setMapSourceBoxByState() {
    this.mapSourceBox.setValue(
      this.getCurrentState().chosenMapSource.toString()
    );
  }

  async setStateByNewTags(newTags: string[]) {
    // Update the state assuming the controls are updated
    const state = this.getCurrentState();
    await this.setNewState({ ...state, tags: newTags }, newTags.length > 0);
  }

  async setStateByTagString(tagListAsString: string) {
    // Update the state assuming the UI is updated
    await this.setStateByNewTags(
      tagListAsString.split(",").filter((t) => t.length > 0)
    );
  }

  setTagsBoxByState() {
    // Update the UI based on the state
    const state = this.getCurrentState();
    this.tagsBox.setValue(state.tags.join(","));
  }

  public reload() {
    if (this.controlsDiv) this.controlsDiv.remove();
    this.createControls();
  }

  createControls() {
    this.controlsDiv = createDiv({
      cls: "graph-controls",
    });
    let filtersDiv = this.controlsDiv.createDiv({ cls: "graph-control-div" });
    filtersDiv.innerHTML = `
			<input id="filtersCollapsible" class="toggle" type="checkbox">
			<label for="filtersCollapsible" class="lbl-toggle">Filters</label>
			`;
    const filtersButton = filtersDiv.getElementsByClassName(
      "toggle"
    )[0] as HTMLInputElement;
    filtersButton.checked = this.settings.mapControls.filtersDisplayed;
    filtersButton.onclick = async () => {
      this.settings.mapControls.filtersDisplayed = filtersButton.checked;
      this.plugin.saveSettings();
    };
    let filtersContent = filtersDiv.createDiv({ cls: "graph-control-content" });
    this.tagsBox = new TextComponent(filtersContent);
    this.tagsBox.setPlaceholder('Tags, e.g. "#one,#two"');
    this.tagsBox.onChange((tagsBox: string) => {
      this.setStateByTagString(tagsBox);
    });
    let tagSuggestions = new DropdownComponent(filtersContent);
    tagSuggestions.setValue("Quick add tag");
    tagSuggestions.addOption("", "Quick add tag");
    for (const tagName of this.getAllTagNames())
      tagSuggestions.addOption(tagName, tagName);
    tagSuggestions.onChange(async (value) => {
      let currentTags = this.getCurrentState().tags;
      if (currentTags.indexOf(value) < 0) {
        const newTags = currentTags.concat(value);
        await this.setStateByNewTags(newTags);
        this.setTagsBoxByState();
      }
      tagSuggestions.setValue("Quick add tag");
      this.tagsBox.inputEl.focus();
      this.tagsBox.onChanged();
    });

    let viewDiv = this.controlsDiv.createDiv({ cls: "graph-control-div" });
    viewDiv.innerHTML = `
			<input id="viewCollapsible" class="toggle" type="checkbox">
			<label for="viewCollapsible" class="lbl-toggle">View</label>
			`;
    const viewButton = viewDiv.getElementsByClassName(
      "toggle"
    )[0] as HTMLInputElement;
    viewButton.checked = this.settings.mapControls.viewDisplayed;
    viewButton.onclick = async () => {
      this.settings.mapControls.viewDisplayed = viewButton.checked;
      this.plugin.saveSettings();
    };
    let viewDivContent = viewDiv.createDiv({ cls: "graph-control-content" });
    this.mapSourceBox = new DropdownComponent(viewDivContent);
    for (const [index, source] of this.settings.mapSources.entries()) {
      this.mapSourceBox.addOption(index.toString(), source.name);
    }
    this.mapSourceBox.onChange(async (value: string) => {
      this.setStateByNewMapSource(parseInt(value));
    });
    this.setMapSourceBoxByState();
    this.sourceMode = new DropdownComponent(viewDivContent);
    this.sourceMode
      .addOptions({ auto: "Auto", light: "Light", dark: "Dark" })
      .setValue(this.settings.chosenMapMode ?? "auto")
      .onChange(async (value) => {
        this.settings.chosenMapMode = value as MapLightDark;
        await this.plugin.saveSettings();
        this.view.refreshMap();
      });
    let goDefault = new ButtonComponent(viewDivContent);
    goDefault
      .setButtonText("Reset")
      .setTooltip("Reset the view to the defined default.")
      .onClick(async () => {
        this.presetsBox.setValue("0");
        await this.choosePresetAndUpdateState(0);
        this.updateControlsToState();
      });
    let fitButton = new ButtonComponent(viewDivContent);
    fitButton
      .setButtonText("Fit")
      .setTooltip("Set the map view to fit all currently-displayed markers.")
      .onClick(() => this.view.autoFitMapToMarkers());

    this.presetsDiv = this.controlsDiv.createDiv({ cls: "graph-control-div" });
    this.presetsDiv.innerHTML = `
			<input id="presetsCollapsible" class="toggle" type="checkbox">
			<label for="presetsCollapsible" class="lbl-toggle">Presets</label>
			`;
    const presetsButton = this.presetsDiv.getElementsByClassName(
      "toggle"
    )[0] as HTMLInputElement;
    presetsButton.checked = this.settings.mapControls.presetsDisplayed;
    presetsButton.onclick = async () => {
      this.settings.mapControls.presetsDisplayed = presetsButton.checked;
      this.plugin.saveSettings();
    };
    this.refreshPresets();

    this.parentElement.append(this.controlsDiv);
  }

  getAllTagNames(): string[] {
    let tags: string[] = [];
    const allFiles = this.app.vault.getFiles();
    for (const file of allFiles) {
      const fileCache = this.app.metadataCache.getFileCache(file);
      if (fileCache && fileCache.tags) {
        const fileTagNames = getAllTags(fileCache) || [];
        tags = tags.concat(
          fileTagNames.filter((tagName) => tags.indexOf(tagName) < 0)
        );
      }
    }
    tags = tags.sort();
    return tags;
  }

  async choosePresetAndUpdateState(chosenPresetNumber: number) {
    // Hacky code, not very happy with it... Entry 0 is the default, then 1 is assumed to be the first saved state
    const chosenPreset =
      chosenPresetNumber == 0
        ? this.settings.defaultState
        : this.settings.savedStates[chosenPresetNumber - 1];
    this.lastSelectedPresetIndex = chosenPresetNumber;
    this.lastSelectedPreset = mergeStates(this.getCurrentState(), chosenPreset);
    await this.setNewState({ ...chosenPreset }, false);
    this.updateControlsToState();
  }

  refreshPresets() {
    if (this.presetsDivContent) this.presetsDivContent.remove();
    this.presetsDivContent = this.presetsDiv.createDiv({
      cls: "graph-control-content",
    });
    this.presetsBox = new DropdownComponent(this.presetsDivContent);
    const states = [
      this.settings.defaultState,
      ...(this.settings.savedStates || []),
    ];
    this.presetsBox.addOption("-1", "");
    for (const [index, preset] of states.entries()) {
      this.presetsBox.addOption(index.toString(), preset.name);
    }
    if (
      this.lastSelectedPresetIndex &&
      this.lastSelectedPresetIndex < states.length &&
      areStatesEqual(this.getCurrentState(), this.lastSelectedPreset)
    )
      this.presetsBox.setValue(this.lastSelectedPreset.toString());
    this.presetsBox.onChange(async (value: string) => {
      const chosenPresetNumber = parseInt(value);
      if (chosenPresetNumber == -1) return;
      await this.choosePresetAndUpdateState(chosenPresetNumber);
    });
    let savePreset = new ButtonComponent(this.presetsDivContent);
    savePreset
      .setButtonText("Save as...")
      .setTooltip("Save the current view as a preset.")
      .onClick(() => {
        const dialog = new NewPresetDialog(
          this.app,
          this.getCurrentState(),
          this.plugin,
          this.settings,
          (index: string) => {
            // If a new preset was added, this small function makes sure it's selected afterwards
            this.refreshPresets();
            if (index) this.presetsBox.setValue(index);
          }
        );
        dialog.open();
      });
    let deletePreset = new ButtonComponent(this.presetsDivContent);
    deletePreset
      .setButtonText("Delete")
      .setTooltip("Delete the currently-selected preset.")
      .onClick(async () => {
        const selectionIndex = parseInt(this.presetsBox.getValue());
        if (selectionIndex > 0) {
          this.settings.savedStates.splice(selectionIndex - 1, 1);
          await this.plugin.saveSettings();
          this.refreshPresets();
        }
      });
    let saveAsDefault = new ButtonComponent(this.presetsDivContent);
    saveAsDefault
      .setButtonText("Save as Default")
      .setTooltip("Save the current view as the default one.")
      .onClick(async () => {
        this.settings.defaultState = {
          ...this.getCurrentState(),
          name: "Default",
        };
        await this.plugin.saveSettings();
        this.presetsBox.setValue("0");
      });
  }

  invalidateActivePreset() {
    if (!areStatesEqual(this.getCurrentState(), this.lastSelectedPreset)) {
      this.presetsBox.setValue("-1");
    }
  }
}
