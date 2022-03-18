import {
  addIcon,
  Notice,
  Editor,
  FileView,
  MarkdownView,
  MenuItem,
  Menu,
  TFile,
  Plugin,
  WorkspaceLeaf,
  TAbstractFile,
} from "obsidian";
import * as consts from "src/consts";
import * as leaflet from "leaflet";
import { LocationSuggest } from "src/geosearch";
import { UrlConvertor } from "src/urlConvertor";

import { MapView } from "src/mapView";
import {
  PluginSettings,
  DEFAULT_SETTINGS,
  convertLegacyMarkerIcons,
  convertLegacyTilesUrl,
  convertLegacyDefaultState,
  MapState,
} from "src/settings";
import {
  getFrontMatterLocation,
  matchInlineLocation,
  verifyLocation,
} from "src/markers";
import { SettingsTab } from "src/settingsTab";
import { NewNoteDialog } from "src/newNoteDialog";
import * as utils from "src/utils";

export default class MapViewPlugin extends Plugin {
  settings: PluginSettings;
  public highestVersionSeen: number = 0;
  private suggestor: LocationSuggest;
  private urlConvertor: UrlConvertor;

  async onload() {
    addIcon("globe", consts.RIBBON_ICON);

    await this.loadSettings();

    this.addRibbonIcon("globe", "Open map view", () => {
      this.app.workspace.getLeaf().setViewState({ type: consts.MAP_VIEW_NAME });
    });

    this.registerView(consts.MAP_VIEW_NAME, (leaf: WorkspaceLeaf) => {
      return new MapView(leaf, this.settings, this);
    });

    this.suggestor = new LocationSuggest(this.app, this.settings);
    this.urlConvertor = new UrlConvertor(this.app, this.settings);

    this.registerEditorSuggest(this.suggestor);

    if (convertLegacyMarkerIcons(this.settings)) {
      await this.saveSettings();
      new Notice(
        "Map View: legacy marker icons were converted to the new format"
      );
    }
    if (convertLegacyTilesUrl(this.settings)) {
      await this.saveSettings();
      new Notice("Map View: legacy tiles URL was converted to the new format");
    }
    if (convertLegacyDefaultState(this.settings)) {
      await this.saveSettings();
      new Notice(
        "Map View: legacy default state was converted to the new format"
      );
    }

    this.addCommand({
      id: "open-map-view",
      name: "Open Map View",
      callback: () => {
        this.app.workspace
          .getLeaf()
          .setViewState({ type: consts.MAP_VIEW_NAME });
      },
    });

    this.addCommand({
      id: "convert-selection-to-location",
      name: "Convert Selection to Geolocation",
      editorCheckCallback: (checking, editor, view) => {
        if (checking) return editor.getSelection().length > 0;
        this.suggestor.selectionToLink(editor);
      },
    });

    this.addCommand({
      id: "insert-geolink",
      name: "Add inline geolocation link",
      editorCallback: (editor, view) => {
        const positionBeforeInsert = editor.getCursor();
        editor.replaceSelection("[](geo:)");
        editor.setCursor({
          line: positionBeforeInsert.line,
          ch: positionBeforeInsert.ch + 1,
        });
      },
    });

    this.addCommand({
      id: "new-geolocation-note",
      name: "New geolocation note",
      callback: () => {
        const dialog = new NewNoteDialog(this.app, this.settings);
        dialog.open();
      },
    });

    this.addCommand({
      id: "add-frontmatter-geolocation",
      name: "Add geolocation (front matter) to current note",
      editorCallback: (editor, view) => {
        const dialog = new NewNoteDialog(
          this.app,
          this.settings,
          "addToNote",
          editor
        );
        dialog.open();
      },
    });

    this.addSettingTab(new SettingsTab(this.app, this));

    this.app.workspace.on(
      "file-menu",
      (
        menu: Menu,
        file: TAbstractFile,
        _source: string,
        leaf?: WorkspaceLeaf
      ) => {
        if (file instanceof TFile) {
          const location = getFrontMatterLocation(file, this.app);
          if (location) {
            menu.addItem((item: MenuItem) => {
              item.setTitle("Show on map");
              item.setIcon("globe");
              item.onClick(
                async (evt: MouseEvent) =>
                  await this.openMapWithLocation(location, evt.ctrlKey)
              );
            });
            menu.addItem((item: MenuItem) => {
              item.setTitle("Open with default app");
              item.onClick((_ev) => {
                open(`geo:${location.lat},${location.lng}`);
              });
            });
            utils.populateOpenInItems(menu, location, this.settings);
          } else {
            if (leaf && leaf.view instanceof MarkdownView) {
              const editor = leaf.view.editor;
              menu.addItem((item: MenuItem) => {
                item.setTitle("Add geolocation (front matter)");
                item.setIcon("globe");
                item.onClick(async (evt: MouseEvent) => {
                  const dialog = new NewNoteDialog(
                    this.app,
                    this.settings,
                    "addToNote",
                    editor
                  );
                  dialog.open();
                });
              });
            }
          }
        }
      }
    );

    this.app.workspace.on(
      "editor-menu",
      async (menu: Menu, editor: Editor, view: MarkdownView) => {
        if (view instanceof FileView) {
          const location = this.getLocationOnEditorLine(editor, view);
          if (location) {
            menu.addItem((item: MenuItem) => {
              item.setTitle("Show on map");
              item.setIcon("globe");
              item.onClick(
                async (evt: MouseEvent) =>
                  await this.openMapWithLocation(location, evt.ctrlKey)
              );
            });
            menu.addItem((item: MenuItem) => {
              item.setTitle("Open with default app");
              item.onClick((_ev) => {
                open(`geo:${location.lat},${location.lng}`);
              });
            });
            utils.populateOpenInItems(menu, location, this.settings);
          }
          if (editor.getSelection()) {
            menu.addItem((item: MenuItem) => {
              item.setTitle("Convert to geolocation (geosearch)");
              item.onClick(
                async () => await this.suggestor.selectionToLink(editor)
              );
            });
          }

          if (this.urlConvertor.findMatchInLine(editor))
            menu.addItem((item: MenuItem) => {
              item.setTitle("Convert to geolocation");
              item.onClick(async () => {
                this.urlConvertor.convertUrlAtCursorToGeolocation(editor);
              });
            });

          const clipboard = await navigator.clipboard.readText();
          const clipboardLocation =
            this.urlConvertor.parseLocationFromUrl(clipboard)?.location;
          if (clipboardLocation) {
            menu.addItem((item: MenuItem) => {
              item.setTitle("Paste as geolocation");
              item.onClick(async () => {
                this.urlConvertor.insertLocationToEditor(
                  clipboardLocation,
                  editor
                );
              });
            });
          }
        }
      }
    );
  }

  private async openMapWithLocation(
    location: leaflet.LatLng,
    ctrlKey: boolean
  ) {
    await this.openMapWithState(
      {
        mapCenter: location,
        mapZoom: this.settings.zoomOnGoFromNote,
      } as MapState,
      ctrlKey
    );
  }

  private async openMapWithState(state: MapState, ctrlKey: boolean) {
    // Find the best candidate for a leaf to open the map view on.
    // If there's an open map view, use that, otherwise use the current leaf.
    // If Ctrl is pressed, override that behavior and always use the current leaf.
    const maps = this.app.workspace.getLeavesOfType(consts.MAP_VIEW_NAME);
    let chosenLeaf: WorkspaceLeaf = null;
    if (maps && !ctrlKey) chosenLeaf = maps[0];
    else chosenLeaf = this.app.workspace.getLeaf();
    if (!chosenLeaf) chosenLeaf = this.app.workspace.activeLeaf;
    await chosenLeaf.setViewState({ type: consts.MAP_VIEW_NAME, state: state });
  }

  private getLocationOnEditorLine(
    editor: Editor,
    view: FileView
  ): leaflet.LatLng {
    const line = editor.getLine(editor.getCursor().line);
    const match = matchInlineLocation(line)[0];
    let selectedLocation = null;
    if (match)
      selectedLocation = new leaflet.LatLng(
        parseFloat(match[2]),
        parseFloat(match[3])
      );
    else {
      const fmLocation = getFrontMatterLocation(view.file, this.app);
      if (line.indexOf("location") > -1 && fmLocation)
        selectedLocation = fmLocation;
    }
    if (selectedLocation) {
      verifyLocation(selectedLocation);
      return selectedLocation;
    }
    return null;
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
