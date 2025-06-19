import {
    App,
    TextComponent,
    PluginSettingTab,
    TextAreaComponent,
    Setting,
    DropdownComponent,
} from 'obsidian';

import MapViewPlugin from 'src/main';
import {
    type OpenBehavior,
    type UrlParsingRuleType,
    type UrlParsingContentType,
    type GeoHelperType,
    type LinkNamePopupBehavior,
    type DisplayRule,
    DEFAULT_SETTINGS,
} from 'src/settings';
import { BaseMapView } from 'src/baseMapView';
import * as consts from 'src/consts';
import { DEFAULT_MAX_TILE_ZOOM, MAX_ZOOM } from 'src/consts';
import { openManagerDialog } from 'src/offlineTiles.svelte';
import { SvelteModal } from 'src/svelte';
import DisplayRules from './components/DisplayRules.svelte';

export class SettingsTab extends PluginSettingTab {
    plugin: MapViewPlugin;
    private refreshPluginOnHide: boolean = false;

    constructor(app: App, plugin: MapViewPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        let { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', {
            text: 'Settings for the map view plugin.',
        });

        new Setting(containerEl)
            .setName('Pre-load markers and paths')
            .setDesc(
                'Load map markers and paths cache in the background when Obsidian starts. This greatly speeds up Map View but takes memory even when unused. When off, the map content will load only when Map View is first used.',
            )
            .addToggle((component) => {
                component
                    .setValue(this.plugin.settings.loadLayersAhead)
                    .onChange(async (value) => {
                        this.plugin.settings.loadLayersAhead = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Map follows search results')
            .setDesc(
                'Auto zoom & pan the map to fit search results, including Follow Active Note.',
            )
            .addToggle((component) => {
                component
                    .setValue(this.plugin.settings.autoZoom)
                    .onChange(async (value) => {
                        this.plugin.settings.autoZoom = value;
                        await this.plugin.saveSettings();
                    });
            });

        let apiKeyControl: Setting = null;
        new Setting(containerEl)
            .setName('Geocoding search provider')
            .setDesc(
                'The service used for searching for geolocations. To use Google, see details in the plugin documentation.',
            )
            .addDropdown((component) => {
                component
                    .addOption('osm', 'OpenStreetMap')
                    .addOption('google', 'Google (API key required)')
                    .setValue(
                        this.plugin.settings.searchProvider ||
                            DEFAULT_SETTINGS.searchProvider,
                    )
                    .onChange(async (value: 'osm' | 'google') => {
                        this.plugin.settings.searchProvider = value;
                        await this.plugin.saveSettings();
                        this.refreshPluginOnHide = true;
                        apiKeyControl.settingEl.style.display =
                            value === 'google' ? '' : 'none';
                        googlePlacesControl.settingEl.style.display =
                            this.plugin.settings.searchProvider === 'google'
                                ? ''
                                : 'none';
                    });
            });

        apiKeyControl = new Setting(containerEl)
            .setName('Gecoding API key')
            .setDesc(
                'If using Google as the geocoding search provider, paste the API key here. See the plugin documentation for more details. Changes are applied after restart.',
            )
            .addText((component) => {
                component
                    .setValue(this.plugin.settings.geocodingApiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.geocodingApiKey = value;
                        await this.plugin.saveSettings();
                        component.inputEl.style.borderColor = value
                            ? ''
                            : 'red';
                    });
                component.inputEl.style.borderColor = this.plugin.settings
                    .geocodingApiKey
                    ? ''
                    : 'red';
            });
        let googlePlacesControl = new Setting(containerEl)
            .setName('Use Google Places for searches')
            .setDesc(
                'Use Google Places API instead of Google Geocoding to get higher-quality results. Your API key must have a specific "Google Places (New)" permission turned on! See the plugin documentation for more details.',
            )
            .addToggle((component) => {
                component
                    .setValue(
                        this.plugin.settings.useGooglePlacesNew2025 ??
                            DEFAULT_SETTINGS.useGooglePlacesNew2025,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.useGooglePlacesNew2025 = value;
                        await this.plugin.saveSettings();
                    });
            });

        // Display the API key control only if the search provider requires it
        apiKeyControl.settingEl.style.display =
            this.plugin.settings.searchProvider === 'google' ? '' : 'none';
        googlePlacesControl.settingEl.style.display =
            this.plugin.settings.searchProvider === 'google' ? '' : 'none';
        new Setting(containerEl)
            .setName('Search delay while typing')
            .setDesc(
                'Delay in ms to wait before searching while you type (required to not flood the search provider with every key).',
            )
            .addSlider((slider) => {
                slider
                    .setLimits(100, 500, 50)
                    .setDynamicTooltip()
                    .setValue(
                        this.plugin.settings.searchDelayMs ??
                            DEFAULT_SETTINGS.searchDelayMs,
                    )
                    .onChange(async (value: number) => {
                        this.plugin.settings.searchDelayMs = value;
                        this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('New note name format')
            .setDesc(
                'Date/times in the format can be wrapped in {{date:...}}, e.g. "note-{{date:YYYY-MM-DD}}". Search queries can be added with {{query}}.',
            )
            .addText((component) => {
                component
                    .setValue(
                        this.plugin.settings.newNoteNameFormat ||
                            DEFAULT_SETTINGS.newNoteNameFormat,
                    )
                    .onChange(async (value: string) => {
                        this.plugin.settings.newNoteNameFormat = value;
                        this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('New note path')
            .setDesc('Disk path for notes created from the map.')
            .addText((component) => {
                component
                    .setValue(this.plugin.settings.newNotePath || '')
                    .onChange(async (value: string) => {
                        this.plugin.settings.newNotePath = value;
                        this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Template file path')
            .setDesc(
                'Choose the file to use as a template, e.g. "templates/map-log.md".',
            )
            .addText((component) => {
                component
                    .setValue(this.plugin.settings.newNoteTemplate || '')
                    .onChange(async (value: string) => {
                        this.plugin.settings.newNoteTemplate = value;
                        this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Max cluster size in pixels')
            .setDesc(
                'Maximal radius in pixels to cover in a marker cluster. Higher values will group more markers together, which leads to better performance. (Requires restart.)',
            )
            .addSlider((slider) => {
                slider
                    .setLimits(0, 200, 5)
                    .setDynamicTooltip()
                    .setValue(
                        this.plugin.settings.maxClusterRadiusPixels ??
                            DEFAULT_SETTINGS.maxClusterRadiusPixels,
                    )
                    .onChange(async (value: number) => {
                        this.plugin.settings.maxClusterRadiusPixels = value;
                        this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Default zoom for "show on map" action')
            .setDesc(
                'When jumping to the map from a note, what should be the display zoom? This is also used as a max zoom for "Map follows search results" above.',
            )
            .addSlider((component) => {
                component
                    .setLimits(1, 18, 1)
                    .setDynamicTooltip()
                    .setValue(
                        this.plugin.settings.zoomOnGoFromNote ??
                            DEFAULT_SETTINGS.zoomOnGoFromNote,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.zoomOnGoFromNote = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Allow zooming beyond the defined maximum')
            .setDesc(
                'Allow zooming further than the maximum defined for the map source, interpolating the image of the highest available zoom.',
            )
            .addToggle((component) => {
                component
                    .setValue(
                        this.plugin.settings.letZoomBeyondMax ??
                            DEFAULT_SETTINGS.letZoomBeyondMax,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.letZoomBeyondMax = value;
                        this.refreshPluginOnHide = true;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Save back/forward history')
            .setDesc(
                'While making changes to the map, save the history to be browsable through Obsidian back/forward buttons.',
            )
            .addToggle((component) => {
                component
                    .setValue(this.plugin.settings.saveHistory)
                    .onChange(async (value) => {
                        this.plugin.settings.saveHistory = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Query format for "follow active note"')
            .setDesc(
                'What query to use for following active notes (in the main or mini view), $PATH$ being the file path.',
            )
            .addText((component) => {
                component
                    .setValue(
                        this.plugin.settings.queryForFollowActiveNote ||
                            DEFAULT_SETTINGS.queryForFollowActiveNote,
                    )
                    .onChange(async (value: string) => {
                        this.plugin.settings.queryForFollowActiveNote = value;
                        this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Fix front-matter on inline geolocation paste')
            .setDesc(
                'Monitor the clipboard and add a "locations:" front-matter if a supported geolocation is pasted from the keyboard.',
            )
            .addToggle((component) => {
                component
                    .setValue(
                        this.plugin.settings.fixFrontMatterOnPaste ??
                            DEFAULT_SETTINGS.fixFrontMatterOnPaste,
                    )
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.fixFrontMatterOnPaste = value;
                        this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Key for front matter location')
            .setDesc(
                'The key Map View uses to denote a front matter geolocation. Restart required. Beware: changing this will make your old front matter key not recognized as geolocations by Map View.',
            )
            .addText((component) => {
                component
                    .setValue(
                        this.plugin.settings.frontMatterKey ??
                            DEFAULT_SETTINGS.frontMatterKey,
                    )
                    .onChange(async (value: string) => {
                        this.plugin.settings.frontMatterKey = value;
                        this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Tag name to denote inline geolocations')
            .setDesc(
                'Instead or in addition to the "locations:" YAML tag, you can use a regular tag that will mark for Map View that a note has inline geolocations, e.g. "#hasLocations". (Note: this has a performance penalty for the time being.)',
            )
            .addText((component) => {
                component
                    .setValue(this.plugin.settings.tagForGeolocationNotes ?? '')
                    .onChange(async (value: string) => {
                        this.plugin.settings.tagForGeolocationNotes = value;
                        this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Routing service URL')
            .setDesc(
                'URL to use for calculating and showing routes and directions, used for "route to point". {x0},{y0} are the source lat,lng and {x1},{y1} are the destination lat,lng.',
            )
            .addText((component) => {
                component
                    .setValue(
                        this.plugin.settings.routingUrl ??
                            DEFAULT_SETTINGS.routingUrl,
                    )
                    .onChange(async (value: string) => {
                        this.plugin.settings.routingUrl = value;
                        this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setHeading()
            .setName('Geolinks in Notes')
            .setDesc(
                'How and if Map View handles geolinks in notes (both front matter and inline)',
            );
        new Setting(containerEl)
            .setName('Handle geolinks in notes')
            .setDesc(
                'When turned on, Map View will handle geolinks internally, and turn front matter locations into links. (Requires restarting Obsidian to update correctly.)',
            )
            .addToggle((component) => {
                component
                    .setValue(
                        this.plugin.settings.handleGeolinksInNotes ??
                            DEFAULT_SETTINGS.handleGeolinksInNotes,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.handleGeolinksInNotes = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Show geolink previews in notes')
            .setDesc(
                'Show a popup with a map preview when hovering on geolinks in notes. Requires "Geolinks in Notes" above.',
            )
            .addToggle((component) => {
                component
                    .setValue(
                        this.plugin.settings.showGeolinkPreview ??
                            DEFAULT_SETTINGS.showGeolinkPreview,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.showGeolinkPreview = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Zoom of the geolink map preview')
            .setDesc('Zoom level to use for the geolink map preview popup.')
            .addSlider((component) => {
                component
                    .setLimits(1, 18, 1)
                    .setDynamicTooltip()
                    .setValue(
                        this.plugin.settings.zoomOnGeolinkPreview ??
                            DEFAULT_SETTINGS.zoomOnGeolinkPreview,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.zoomOnGeolinkPreview = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Geolink context menu in notes')
            .setDesc(
                'Override the Obsidian context menu for geolinks in notes, making sure Map View "open in" items are shown correctly. Requires "Geolinks in Notes" above. Does not currently work in iOS.',
            )
            .addToggle((component) => {
                component
                    .setValue(
                        this.plugin.settings.handleGeolinkContextMenu ??
                            DEFAULT_SETTINGS.handleGeolinkContextMenu,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.handleGeolinkContextMenu = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setHeading()
            .setName('Marker Hover & Previews')
            .setDesc(
                'What is shown when hovering (desktop) or clicking (mobile) map markers.',
            );
        new Setting(containerEl)
            .setName('Show note name on marker hover')
            .setDesc(
                'Show a popup with the note name when hovering on a map marker.',
            )
            .addToggle((component) => {
                component
                    .setValue(this.plugin.settings.showNoteNamePopup)
                    .onChange(async (value) => {
                        this.plugin.settings.showNoteNamePopup = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Show inline link name on marker hover')
            .setDesc(
                'In the popup above, show also the link name, in the case of an inline link.',
            )
            .addDropdown((component) => {
                component
                    .addOption('always', 'Always')
                    .addOption('mobileOnly', 'Only on mobile')
                    .addOption('never', 'Never')
                    .setValue(
                        this.plugin.settings.showLinkNameInPopup ??
                            DEFAULT_SETTINGS.showLinkNameInPopup,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.showLinkNameInPopup =
                            value as LinkNamePopupBehavior;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Show note preview on marker hover')
            .setDesc(
                'In addition to the note name, show a preview if the note contents. Either way, it will be displayed only if the map is large enough to contain it.',
            )
            .addToggle((component) => {
                component
                    .setValue(this.plugin.settings.showNotePreview)
                    .onChange(async (value) => {
                        this.plugin.settings.showNotePreview = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Show native Obsidian popup on marker hover')
            .setDesc(
                'In addition to the above settings, trigger the native Obsidian note preview when hovering on a marker. ' +
                    'The native Obsidian preview is more feature-rich than the above, and not recommended together with it, but Map View cannot control its placement and cannot add to it the note name, marker name etc.',
            )
            .addToggle((component) => {
                component
                    .setValue(this.plugin.settings.showNativeObsidianHoverPopup)
                    .onChange(async (value) => {
                        this.plugin.settings.showNativeObsidianHoverPopup =
                            value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Show preview for marker clusters')
            .setDesc(
                'Show a hover popup summarizing the icons inside a marker cluster.',
            )
            .addToggle((component) => {
                component
                    .setValue(this.plugin.settings.showClusterPreview)
                    .onChange(async (value) => {
                        this.plugin.settings.showClusterPreview = value;
                        this.refreshPluginOnHide = true;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setHeading()
            .setName('Pane & Tab Usage')
            .setDesc(
                'Control when and if Map View should use panes vs tabs, new panes vs existing ones etc.',
            );

        // Name is 'click', 'Ctrl+click' and 'middle click'
        const addOpenBehaviorOptions = (
            setting: Setting,
            setValue: (value: OpenBehavior) => void,
            getValue: () => OpenBehavior,
            includeLatest: boolean,
        ) => {
            setting.addDropdown((component) => {
                component
                    .addOption(
                        'replaceCurrent',
                        'Open in same pane (replace Map View)',
                    )
                    .addOption(
                        'dedicatedPane',
                        'Open in a 2nd pane and keep reusing it',
                    )
                    .addOption('alwaysNew', 'Always open a new pane')
                    .addOption(
                        'dedicatedTab',
                        'Open in a new tab and keep reusing it',
                    )
                    .addOption('alwaysNewTab', 'Always open a new tab');
                if (includeLatest)
                    component.addOption('lastUsed', 'Open in last-used pane');
                component
                    .setValue(getValue() || 'samePane')
                    .onChange(async (value: OpenBehavior) => {
                        setValue(value);
                        this.plugin.saveSettings();
                    });
            });
        };

        addOpenBehaviorOptions(
            new Setting(containerEl)
                .setName('Default action for map marker click')
                .setDesc(
                    'How should the corresponding note be opened following a click on a marker?',
                ),
            (value: OpenBehavior) => {
                this.plugin.settings.markerClickBehavior = value;
            },
            () => {
                return this.plugin.settings.markerClickBehavior;
            },
            true,
        );
        addOpenBehaviorOptions(
            new Setting(containerEl)
                .setName('Default action for map marker Ctrl+click')
                .setDesc(
                    'How should the corresponding note be opened following a Ctrl+click on a marker?',
                ),
            (value: OpenBehavior) => {
                this.plugin.settings.markerCtrlClickBehavior = value;
            },
            () => {
                return this.plugin.settings.markerCtrlClickBehavior;
            },
            true,
        );
        addOpenBehaviorOptions(
            new Setting(containerEl)
                .setName('Default action for map marker middle-click')
                .setDesc(
                    'How should the corresponding note be opened following a middle-click on a marker?',
                ),
            (value: OpenBehavior) => {
                this.plugin.settings.markerMiddleClickBehavior = value;
            },
            () => {
                return this.plugin.settings.markerMiddleClickBehavior;
            },
            true,
        );

        addOpenBehaviorOptions(
            new Setting(containerEl)
                .setName('Default mode for opening Map View')
                .setDesc(
                    'How should Map View open by default (e.g. when clicking the ribbon icon, or from within a note).',
                ),
            (value: OpenBehavior) => {
                this.plugin.settings.openMapBehavior = value;
            },
            () => {
                return this.plugin.settings.openMapBehavior;
            },
            false,
        );
        addOpenBehaviorOptions(
            new Setting(containerEl)
                .setName('Opening Map View with Ctrl+Click')
                .setDesc('How should Map View open when Ctrl is pressed.'),
            (value: OpenBehavior) => {
                this.plugin.settings.openMapCtrlClickBehavior = value;
            },
            () => {
                return this.plugin.settings.openMapCtrlClickBehavior;
            },
            false,
        );
        addOpenBehaviorOptions(
            new Setting(containerEl)
                .setName('Opening Map View with middle-Click')
                .setDesc('How should Map View open when using middle-click.'),
            (value: OpenBehavior) => {
                this.plugin.settings.openMapMiddleClickBehavior = value;
            },
            () => {
                return this.plugin.settings.openMapMiddleClickBehavior;
            },
            false,
        );

        new Setting(containerEl)
            .setName('New pane split direction')
            .setDesc(
                'Which way should the pane be split when opening in a new pane.',
            )
            .addDropdown((component) => {
                component
                    .addOption('horizontal', 'Horizontal')
                    .addOption('vertical', 'Vertical')
                    .setValue(
                        this.plugin.settings.newPaneSplitDirection ||
                            'horizontal',
                    )
                    .onChange(async (value: any) => {
                        this.plugin.settings.newPaneSplitDirection = value;
                        this.plugin.saveSettings();
                    });
            });

        const mapSources = new Setting(containerEl)
            .setHeading()
            .setName('Map Sources');
        mapSources.descEl.innerHTML = `Change and switch between sources for map tiles. An optional dark mode URL can be defined for each source. If no such URL is defined and dark mode is used, the map colors are reverted. See <a href="https://github.com/esm7/obsidian-map-view?tab=readme-ov-file#map-sources">the documentation</a> for more details.`;

        let mapSourcesDiv: HTMLDivElement = null;
        new Setting(containerEl).addButton((component) =>
            component.setButtonText('New map source').onClick(() => {
                this.plugin.settings.mapSources.push({
                    name: '',
                    urlLight: '',
                    maxZoom: DEFAULT_MAX_TILE_ZOOM,
                    currentMode: 'auto',
                });
                this.refreshMapSourceSettings(mapSourcesDiv);
                this.refreshPluginOnHide = true;
            }),
        );
        mapSourcesDiv = containerEl.createDiv();
        this.refreshMapSourceSettings(mapSourcesDiv);

        new Setting(containerEl)
            .setHeading()
            .setName('Custom "Open In" Actions')
            .setDesc(
                "'Open in' actions showing in geolocation-relevant popup menus. URL should have {x} and {y} as parameters to transfer, and an optional {name} parameter can be used.",
            );

        let openInActionsDiv: HTMLDivElement = null;
        new Setting(containerEl).addButton((component) =>
            component.setButtonText('New Custom Action').onClick(() => {
                this.plugin.settings.openIn.push({ name: '', urlPattern: '' });
                this.refreshOpenInSettings(openInActionsDiv);
            }),
        );
        openInActionsDiv = containerEl.createDiv();
        this.refreshOpenInSettings(openInActionsDiv);

        new Setting(containerEl)
            .setHeading()
            .setName('URL Parsing Rules')
            .setDesc(
                'Customizable rules for converting URLs of various mapping services to coordinates, for the purpose of the "Convert URL" action.',
            );

        let parsingRulesDiv: HTMLDivElement = null;
        new Setting(containerEl).addButton((component) =>
            component.setButtonText('New Parsing Rule').onClick(() => {
                this.plugin.settings.urlParsingRules.push({
                    name: '',
                    regExp: '',
                    preset: false,
                    ruleType: 'latLng',
                });
                this.refreshUrlParsingRules(parsingRulesDiv);
            }),
        );
        parsingRulesDiv = containerEl.createDiv();
        this.refreshUrlParsingRules(parsingRulesDiv);

        const iconRulesHeading = new Setting(containerEl)
            .setHeading()
            .setName('Marker & Path Display Rules');
        iconRulesHeading.descEl.innerHTML = `Customize map markers by note tags.
			Refer to <a href="https://fontawesome.com/">Font Awesome</a> for icon names or use <a href="https://emojipedia.org">emojis</a>, and see <a href="https://github.com/coryasilva/Leaflet.ExtraMarkers#properties">here</a> for the other properties.
			<br>The rules override each other, starting from the default. Refer to the plugin documentation for more details.
		`;

        new Setting(containerEl).addButton((component) =>
            component
                .setButtonText('Marker & Path Display Rules...')
                .onClick(() => {
                    const dialog = new SvelteModal(
                        DisplayRules,
                        this.app,
                        this.plugin,
                        this.plugin.settings,
                        {
                            settings: this.plugin.settings,
                            app: this.app,
                            plugin: this.plugin,
                        },
                        ['mod-settings'],
                    );
                    dialog.open();
                }),
        );

        new Setting(containerEl).setHeading().setName('Paths, GeoJSONs, GPXs');
        new Setting(containerEl)
            .setName("Handle 'geojson' code blocks")
            .setDesc("Display an embedded map for a 'geojson' code block.")
            .addToggle((component) => {
                component
                    .setValue(
                        this.plugin.settings.handleGeoJsonCodeBlocks ??
                            DEFAULT_SETTINGS.handleGeoJsonCodeBlocks,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.handleGeoJsonCodeBlocks = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl).setHeading().setName('Offline Maps');
        new Setting(containerEl)
            .setName('Manage offline storage')
            .setDesc(
                'Save and delete tiles for offline usage. Also available via the context menu of the map.',
            )
            .addButton((component) => {
                component.setButtonText('Offline storage...').onClick(() => {
                    const mapView = this.findMapView();
                    if (mapView)
                        openManagerDialog(
                            this.plugin,
                            this.plugin.settings,
                            mapView.mapContainer,
                        );
                    else alert('This requires an open Map View.');
                });
            });
        new Setting(containerEl)
            .setName('Auto cache')
            .setDesc(
                'Automatically store all viewed tiles to be available locally. Great for performance but takes some storage. When this is off, only tiles explicitly downloaded for offline storage are kept.',
            )
            .addToggle((component) => {
                component
                    .setValue(
                        this.plugin.settings.cacheAllTiles ??
                            DEFAULT_SETTINGS.cacheAllTiles,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.cacheAllTiles = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Auto-purge tiles older than...')
            .setDesc(
                'Remove old tiles on Obsidian startup to keep your map up-to-date. This currently applies both to auto-cached and explicitly downloaded tiles.',
            )
            .addDropdown((component) => {
                component
                    .addOption('1', '1 month')
                    .addOption('3', '3 months')
                    .addOption('6', '6 months')
                    .addOption('12', '12 months')
                    .addOption('0', 'Never')
                    .setValue(
                        (
                            this.plugin.settings.offlineMaxTileAgeMonths ?? 0
                        ).toString(),
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.offlineMaxTileAgeMonths =
                            parseInt(value);
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Max offline tiles storage (GB)')
            .setDesc(
                'Remove tiles by age on Obsidian startup if the storage size is too high. This currently applies both to auto-cached and explicitly downloaded tiles.',
            )
            .addText((component) => {
                component
                    .setValue(
                        (
                            this.plugin.settings.offlineMaxStorageGb ?? 0
                        ).toString(),
                    )
                    .onChange(async (value) => {
                        const numValue = parseFloat(value);
                        if (!isNaN(numValue) && numValue >= 0) {
                            this.plugin.settings.offlineMaxStorageGb = numValue;
                            await this.plugin.saveSettings();
                        }
                    });
            });

        const gpsTitle = new Setting(containerEl).setHeading().setName('GPS');
        const warningFragment = document.createDocumentFragment();
        const warningText = warningFragment.createDiv();
        warningText.innerHTML =
            '<strong>Warning!</strong> This is an experimental feature -- your milage may vary.<br>Make sure to read <a href="https://github.com/esm7/obsidian-map-view#gps-location-support">the documentation</a> before using.';
        gpsTitle.setDesc(warningFragment);
        new Setting(containerEl)
            .setName('Enable experimental GPS support')
            .addToggle((component) => {
                component
                    .setValue(
                        this.plugin.settings.supportRealTimeGeolocation ??
                            DEFAULT_SETTINGS.supportRealTimeGeolocation,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.supportRealTimeGeolocation = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Use native app on mobile')
            .addToggle((component) => {
                component
                    .setValue(
                        this.plugin.settings.geoHelperPreferApp ??
                            DEFAULT_SETTINGS.geoHelperPreferApp,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.geoHelperPreferApp = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Geo helper type')
            .setDesc(
                'If the native app is not used, determines how to launch the geo helper.',
            )
            .addDropdown((component) => {
                component
                    .addOption('url', 'External URL')
                    .addOption('commandline', 'Command line')
                    .setValue(
                        this.plugin.settings.geoHelperType ??
                            DEFAULT_SETTINGS.geoHelperType,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.geoHelperType =
                            value as GeoHelperType;
                        geoHelperUrl.settingEl.style.display =
                            value === 'url' || 'commandline' ? '' : 'none';
                        geoHelperCommand.settingEl.style.display =
                            value === 'commandline' ? '' : 'none';
                        await this.plugin.saveSettings();
                    });
            });
        const geoHelperCommand = new Setting(containerEl).setName(
            'Geo Helper Command',
        );
        geoHelperCommand.addText((component) => {
            component
                .setValue(
                    this.plugin.settings.geoHelperCommand ??
                        DEFAULT_SETTINGS.geoHelperCommand,
                )
                .onChange(async (value) => {
                    this.plugin.settings.geoHelperCommand = value;
                    await this.plugin.saveSettings();
                });
        });
        const geoHelperUrl = new Setting(containerEl).setName('Geo Helper URL');
        geoHelperUrl.addText((component) => {
            component
                .setPlaceholder(
                    'URL to open (directly or using the defined command; see README for more details)',
                )
                .setValue(this.plugin.settings.geoHelperUrl ?? '')
                .onChange(async (value) => {
                    this.plugin.settings.geoHelperUrl = value;
                    await this.plugin.saveSettings();
                });
        });
        geoHelperUrl.settingEl.style.display =
            this.plugin.settings.geoHelperUrl === 'url' || 'commandline'
                ? ''
                : 'none';
        geoHelperCommand.settingEl.style.display =
            this.plugin.settings.geoHelperType === 'commandline' ? '' : 'none';

        new Setting(containerEl).setHeading().setName('Advanced');

        new Setting(containerEl)
            .setName('Debug logs (advanced)')
            .addToggle((component) => {
                component
                    .setValue(
                        this.plugin.settings.debug != null
                            ? this.plugin.settings.debug
                            : DEFAULT_SETTINGS.debug,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.debug = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    hide() {
        if (this.refreshPluginOnHide) {
            const mapView = this.findMapView();
            if (mapView) mapView.mapContainer.refreshMap();
        }
    }

    findMapView() {
        const mapViews = this.app.workspace.getLeavesOfType(
            consts.MAP_VIEW_NAME,
        );
        for (const leaf of mapViews) {
            if (leaf.view) return leaf.view as BaseMapView;
        }
        return null;
    }

    refreshMapSourceSettings(containerEl: HTMLElement) {
        containerEl.innerHTML = '';
        for (const setting of this.plugin.settings.mapSources) {
            const controls = new Setting(containerEl)
                .addText((component) => {
                    component
                        .setPlaceholder('Name')
                        .setValue(setting.name)
                        .onChange(async (value: string) => {
                            setting.name = value;
                            this.refreshPluginOnHide = true;
                            await this.plugin.saveSettings();
                        }).inputEl.style.width = '10em';
                })
                .addText((component) => {
                    component
                        .setPlaceholder('URL (light/default)')
                        .setValue(setting.urlLight)
                        .onChange(async (value: string) => {
                            setting.urlLight = value;
                            this.refreshPluginOnHide = true;
                            await this.plugin.saveSettings();
                        });
                })
                .addText((component) => {
                    component
                        .setPlaceholder('URL (dark) (opt.)')
                        .setValue(setting.urlDark)
                        .onChange(async (value: string) => {
                            setting.urlDark = value;
                            this.refreshPluginOnHide = true;
                            await this.plugin.saveSettings();
                        }).inputEl.style.width = '10em';
                })
                .addText((component) => {
                    component
                        .setPlaceholder('Max Tile Zoom')
                        .setValue(
                            (
                                setting.maxZoom ?? DEFAULT_MAX_TILE_ZOOM
                            ).toString(),
                        )
                        .onChange(async (value: string) => {
                            let zoom = parseInt(value);
                            if (typeof zoom == 'number') {
                                zoom = Math.min(Math.max(0, zoom), MAX_ZOOM);
                                setting.maxZoom = zoom;
                                this.refreshPluginOnHide = true;
                                await this.plugin.saveSettings();
                            }
                        }).inputEl.style.width = '3em';
                });
            if (!setting.preset)
                controls.addButton((component) =>
                    component.setButtonText('Delete').onClick(async () => {
                        this.plugin.settings.mapSources.remove(setting);
                        this.refreshPluginOnHide = true;
                        await this.plugin.saveSettings();
                        this.refreshMapSourceSettings(containerEl);
                    }),
                );
            controls.settingEl.style.padding = '5px';
            controls.settingEl.style.borderTop = 'none';
        }
    }

    refreshOpenInSettings(containerEl: HTMLElement) {
        containerEl.innerHTML = '';
        for (const setting of this.plugin.settings.openIn) {
            const controls = new Setting(containerEl)
                .addText((component) => {
                    component
                        .setPlaceholder('Name')
                        .setValue(setting.name)
                        .onChange(async (value: string) => {
                            setting.name = value;
                            await this.plugin.saveSettings();
                        });
                })
                .addText((component) => {
                    component
                        .setPlaceholder('URL template')
                        .setValue(setting.urlPattern)
                        .onChange(async (value: string) => {
                            setting.urlPattern = value;
                            await this.plugin.saveSettings();
                        });
                })
                .addButton((component) =>
                    component.setButtonText('Delete').onClick(async () => {
                        this.plugin.settings.openIn.remove(setting);
                        await this.plugin.saveSettings();
                        this.refreshOpenInSettings(containerEl);
                    }),
                );
            controls.settingEl.style.padding = '5px';
            controls.settingEl.style.borderTop = 'none';
        }
    }

    refreshUrlParsingRules(containerEl: HTMLElement) {
        containerEl.innerHTML = '';
        const parsingRules = this.plugin.settings.urlParsingRules;
        // Make sure that the default settings are included. That's because I'll want to add more parsing
        // rules in the future, and I want existing users to receive them
        for (const defaultSetting of DEFAULT_SETTINGS.urlParsingRules)
            if (
                parsingRules.findIndex(
                    (rule) => rule.name === defaultSetting.name,
                ) === -1
            ) {
                parsingRules.push(defaultSetting);
                this.plugin.saveSettings();
            }
        for (const setting of parsingRules) {
            const parsingRuleDiv = containerEl.createDiv('parsing-rule');
            const line1 = parsingRuleDiv.createDiv('parsing-rule-line-1');
            let line2: HTMLDivElement = null;
            let adjustToRuleType = (ruleType: UrlParsingRuleType) => {
                text.setPlaceholder(
                    ruleType === 'fetch'
                        ? 'Regex with 1 capture group'
                        : 'Regex with 2 capture groups',
                );
                if (line2)
                    line2.style.display =
                        ruleType === 'fetch' ? 'block' : 'none';
            };
            const controls = new Setting(line1).addText((component) => {
                component
                    .setPlaceholder('Name')
                    .setValue(setting.name)
                    .onChange(async (value: string) => {
                        setting.name = value;
                        await this.plugin.saveSettings();
                    });
            });
            const text = new TextComponent(controls.controlEl);
            text.setValue(setting.regExp).onChange(async (value: string) => {
                setting.regExp = value;
                await this.plugin.saveSettings();
            });
            controls.addDropdown((component) =>
                component
                    .addOption('latLng', '(lat)(lng)')
                    .addOption('lngLat', '(lng)(lat)')
                    .addOption('fetch', 'fetch')
                    .setValue(setting.ruleType ?? 'latLng')
                    .onChange(async (value: UrlParsingRuleType) => {
                        setting.ruleType = value;
                        adjustToRuleType(value);
                        await this.plugin.saveSettings();
                    })
                    .selectEl.addClass('url-rule-dropdown'),
            );
            controls.settingEl.style.padding = '0px';
            controls.settingEl.style.borderTop = 'none';
            if (!setting.preset)
                controls.addButton((component) =>
                    component.setButtonText('Delete').onClick(async () => {
                        this.plugin.settings.urlParsingRules.remove(setting);
                        await this.plugin.saveSettings();
                        this.refreshUrlParsingRules(containerEl);
                    }),
                );
            line2 = parsingRuleDiv.createDiv('parsing-rule-line-2');
            adjustToRuleType(setting.ruleType);
            const contentLabel = line2.createEl('label');
            contentLabel.setText('Content parsing expression:');
            contentLabel.style.paddingRight = '10px';
            new TextComponent(line2)
                .setPlaceholder('Regex with 1-2 capture groups')
                .setValue(setting.contentParsingRegExp)
                .onChange(async (value) => {
                    setting.contentParsingRegExp = value;
                    await this.plugin.saveSettings();
                });
            new DropdownComponent(line2)
                .addOption('latLng', '(lat)(lng)')
                .addOption('lngLat', '(lng)(lat)')
                .addOption('googlePlace', '(google-place)')
                .setValue(setting.contentType ?? 'latLng')
                .onChange(async (value) => {
                    setting.contentType = value as UrlParsingContentType;
                    await this.plugin.saveSettings();
                });
        }
    }
}
