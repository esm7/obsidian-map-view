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
    OpenBehavior,
    UrlParsingRuleType,
    UrlParsingContentType,
    GeoHelperType,
    LinkNamePopupBehavior,
    DEFAULT_SETTINGS,
} from 'src/settings';
import { getIconFromOptions, getIconFromRules } from 'src/markerIcons';
import { BaseMapView } from 'src/baseMapView';
import * as consts from 'src/consts';
import { DEFAULT_MAX_TILE_ZOOM, MAX_ZOOM } from 'src/consts';

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
            .setName('Map follows search results')
            .setDesc(
                'Auto zoom & pan the map to fit search results, including Follow Active Note.'
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
                'The service used for searching for geolocations. To use Google, see details in the plugin documentation.'
            )
            .addDropdown((component) => {
                component
                    .addOption('osm', 'OpenStreetMap')
                    .addOption('google', 'Google (API key required)')
                    .setValue(
                        this.plugin.settings.searchProvider ||
                            DEFAULT_SETTINGS.searchProvider
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
                'If using Google as the geocoding search provider, paste the API key here. See the plugin documentation for more details. Changes are applied after restart.'
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
                'Use Google Places API instead of Google Geocoding to get higher-quality results. Your API key must have a specific Google Places permission turned on! See the plugin documentation for more details.'
            )
            .addToggle((component) => {
                component
                    .setValue(
                        this.plugin.settings.useGooglePlaces ??
                            DEFAULT_SETTINGS.useGooglePlaces
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.useGooglePlaces = value;
                        await this.plugin.saveSettings();
                    });
            });

        // Display the API key control only if the search provider requires it
        apiKeyControl.settingEl.style.display =
            this.plugin.settings.searchProvider === 'google' ? '' : 'none';
        googlePlacesControl.settingEl.style.display =
            this.plugin.settings.searchProvider === 'google' ? '' : 'none';

        new Setting(containerEl)
            .setName('New note name format')
            .setDesc(
                'Date/times in the format can be wrapped in {{date:...}}, e.g. "note-{{date:YYYY-MM-DD}}". Search queries can be added with {{query}}.'
            )
            .addText((component) => {
                component
                    .setValue(
                        this.plugin.settings.newNoteNameFormat ||
                            DEFAULT_SETTINGS.newNoteNameFormat
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
                'Choose the file to use as a template, e.g. "templates/map-log.md".'
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
                'Maximal radius in pixels to cover in a marker cluster. Lower values will produce smaller map clusters. (Requires restart.)'
            )
            .addSlider((slider) => {
                slider
                    .setLimits(0, 200, 5)
                    .setDynamicTooltip()
                    .setValue(
                        this.plugin.settings.maxClusterRadiusPixels ??
                            DEFAULT_SETTINGS.maxClusterRadiusPixels
                    )
                    .onChange(async (value: number) => {
                        this.plugin.settings.maxClusterRadiusPixels = value;
                        this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Default zoom for "show on map" action')
            .setDesc(
                'When jumping to the map from a note, what should be the display zoom? This is also used as a max zoom for "Map follows search results" above.'
            )
            .addSlider((component) => {
                component
                    .setLimits(1, 18, 1)
                    .setDynamicTooltip()
                    .setValue(
                        this.plugin.settings.zoomOnGoFromNote ??
                            DEFAULT_SETTINGS.zoomOnGoFromNote
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.zoomOnGoFromNote = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Allow zooming beyond the defined maximum')
            .setDesc(
                'Allow zooming further than the maximum defined for the map source, interpolating the image of the highest available zoom.'
            )
            .addToggle((component) => {
                component
                    .setValue(
                        this.plugin.settings.letZoomBeyondMax ??
                            DEFAULT_SETTINGS.letZoomBeyondMax
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
                'While making changes to the map, save the history to be browsable through Obsidian back/forward buttons.'
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
                'What query to use for following active notes (in the main or mini view), $PATH$ being the file path.'
            )
            .addText((component) => {
                component
                    .setValue(
                        this.plugin.settings.queryForFollowActiveNote ||
                            DEFAULT_SETTINGS.queryForFollowActiveNote
                    )
                    .onChange(async (value: string) => {
                        this.plugin.settings.queryForFollowActiveNote = value;
                        this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Fix front-matter on inline geolocation paste')
            .setDesc(
                'Monitor the clipboard and add a "locations:" front-matter if a supported geolocation is pasted from the keyboard.'
            )
            .addToggle((component) => {
                component
                    .setValue(
                        this.plugin.settings.fixFrontMatterOnPaste ??
                            DEFAULT_SETTINGS.fixFrontMatterOnPaste
                    )
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.fixFrontMatterOnPaste = value;
                        this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Key for front matter location')
            .setDesc(
                'The key Map View uses to denote a front matter geolocation. Restart required. Beware: changing this will make your old front matter key not recognized as geolocations by Map View.'
            )
            .addText((component) => {
                component
                    .setValue(
                        this.plugin.settings.frontMatterKey ??
                            DEFAULT_SETTINGS.frontMatterKey
                    )
                    .onChange(async (value: string) => {
                        this.plugin.settings.frontMatterKey = value;
                        this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Tag name to denote inline geolocations')
            .setDesc(
                'Instead or in addition to the "locations:" YAML tag, you can use a regular tag that will mark for Map View that a note has inline geolocations, e.g. "#hasLocations". (Note: this has a performance penalty for the time being.)'
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
                'URL to use for calculating and showing routes and directions, used for "route to point". {x0},{y0} are the source lat,lng and {x1},{y1} are the destination lat,lng.'
            )
            .addText((component) => {
                component
                    .setValue(
                        this.plugin.settings.routingUrl ??
                            DEFAULT_SETTINGS.routingUrl
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
                'How and if Map View handles geolinks in notes (both front matter and inline)'
            );
        new Setting(containerEl)
            .setName('Handle geolinks in notes')
            .setDesc(
                'When turned on, Map View will handle geolinks internally, and turn front matter locations into links. (Requires restarting Obsidian to update correctly.)'
            )
            .addToggle((component) => {
                component
                    .setValue(
                        this.plugin.settings.handleGeolinksInNotes ??
                            DEFAULT_SETTINGS.handleGeolinksInNotes
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.handleGeolinksInNotes = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Show geolink previews in notes')
            .setDesc(
                'Show a popup with a map preview when hovering on geolinks in notes. Requires "Geolinks in Notes" above.'
            )
            .addToggle((component) => {
                component
                    .setValue(
                        this.plugin.settings.showGeolinkPreview ??
                            DEFAULT_SETTINGS.showGeolinkPreview
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
                            DEFAULT_SETTINGS.zoomOnGeolinkPreview
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.zoomOnGeolinkPreview = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setHeading()
            .setName('Marker Hover & Previews')
            .setDesc(
                'What is shown when hovering (desktop) or clicking (mobile) map markers.'
            );
        new Setting(containerEl)
            .setName('Show note name on marker hover')
            .setDesc(
                'Show a popup with the note name when hovering on a map marker.'
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
                'In the popup above, show also the link name, in the case of an inline link.'
            )
            .addDropdown((component) => {
                component
                    .addOption('always', 'Always')
                    .addOption('mobileOnly', 'Only on mobile')
                    .addOption('never', 'Never')
                    .setValue(
                        this.plugin.settings.showLinkNameInPopup ??
                            DEFAULT_SETTINGS.showLinkNameInPopup
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.showLinkNameInPopup =
                            value as LinkNamePopupBehavior;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Show note preview on map marker hover')
            .setDesc(
                'In addition to the note name, show the native Obsidian note preview.'
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
            .setName('Show preview for marker clusters')
            .setDesc(
                'Show a hover popup summarizing the icons inside a marker cluster.'
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
                'Control when and if Map View should use panes vs tabs, new panes vs existing ones etc.'
            );

        // Name is 'click', 'Ctrl+click' and 'middle click'
        const addOpenBehaviorOptions = (
            setting: Setting,
            setValue: (value: OpenBehavior) => void,
            getValue: () => OpenBehavior,
            includeLatest: boolean
        ) => {
            setting.addDropdown((component) => {
                component
                    .addOption(
                        'replaceCurrent',
                        'Open in same pane (replace Map View)'
                    )
                    .addOption(
                        'dedicatedPane',
                        'Open in a 2nd pane and keep reusing it'
                    )
                    .addOption('alwaysNew', 'Always open a new pane')
                    .addOption(
                        'dedicatedTab',
                        'Open in a new tab and keep reusing it'
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
                    'How should the corresponding note be opened following a click on a marker?'
                ),
            (value: OpenBehavior) => {
                this.plugin.settings.markerClickBehavior = value;
            },
            () => {
                return this.plugin.settings.markerClickBehavior;
            },
            true
        );
        addOpenBehaviorOptions(
            new Setting(containerEl)
                .setName('Default action for map marker Ctrl+click')
                .setDesc(
                    'How should the corresponding note be opened following a Ctrl+click on a marker?'
                ),
            (value: OpenBehavior) => {
                this.plugin.settings.markerCtrlClickBehavior = value;
            },
            () => {
                return this.plugin.settings.markerCtrlClickBehavior;
            },
            true
        );
        addOpenBehaviorOptions(
            new Setting(containerEl)
                .setName('Default action for map marker middle-click')
                .setDesc(
                    'How should the corresponding note be opened following a middle-click on a marker?'
                ),
            (value: OpenBehavior) => {
                this.plugin.settings.markerMiddleClickBehavior = value;
            },
            () => {
                return this.plugin.settings.markerMiddleClickBehavior;
            },
            true
        );

        addOpenBehaviorOptions(
            new Setting(containerEl)
                .setName('Default mode for opening Map View')
                .setDesc(
                    'How should Map View open by default (e.g. when clicking the ribbon icon, or from within a note).'
                ),
            (value: OpenBehavior) => {
                this.plugin.settings.openMapBehavior = value;
            },
            () => {
                return this.plugin.settings.openMapBehavior;
            },
            false
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
            false
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
            false
        );

        new Setting(containerEl)
            .setName('New pane split direction')
            .setDesc(
                'Which way should the pane be split when opening in a new pane.'
            )
            .addDropdown((component) => {
                component
                    .addOption('horizontal', 'Horizontal')
                    .addOption('vertical', 'Vertical')
                    .setValue(
                        this.plugin.settings.newPaneSplitDirection ||
                            'horizontal'
                    )
                    .onChange(async (value: any) => {
                        this.plugin.settings.newPaneSplitDirection = value;
                        this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setHeading()
            .setName('Map Sources')
            .setDesc(
                'Change and switch between sources for map tiles. An optional dark mode URL can be defined for each source. If no such URL is defined and dark mode is used, the map colors are reverted. See the documentation for more details.'
            );

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
            })
        );
        mapSourcesDiv = containerEl.createDiv();
        this.refreshMapSourceSettings(mapSourcesDiv);

        new Setting(containerEl)
            .setHeading()
            .setName('Custom "Open In" Actions')
            .setDesc(
                "'Open in' actions showing in geolocation-relevant popup menus. URL should have {x} and {y} as parameters to transfer."
            );

        let openInActionsDiv: HTMLDivElement = null;
        new Setting(containerEl).addButton((component) =>
            component.setButtonText('New Custom Action').onClick(() => {
                this.plugin.settings.openIn.push({ name: '', urlPattern: '' });
                this.refreshOpenInSettings(openInActionsDiv);
            })
        );
        openInActionsDiv = containerEl.createDiv();
        this.refreshOpenInSettings(openInActionsDiv);

        new Setting(containerEl)
            .setHeading()
            .setName('URL Parsing Rules')
            .setDesc(
                'Customizable rules for converting URLs of various mapping services to coordinates, for the purpose of the "Convert URL" action.'
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
            })
        );
        parsingRulesDiv = containerEl.createDiv();
        this.refreshUrlParsingRules(parsingRulesDiv);

        const iconRulesHeading = new Setting(containerEl)
            .setHeading()
            .setName('Marker Icon Rules');
        iconRulesHeading.descEl.innerHTML = `Customize map markers by note tags.
			Refer to <a href="https://fontawesome.com/">Font Awesome</a> for icon names or use <a href="https://emojipedia.org">emojis</a>, and see <a href="https://github.com/coryasilva/Leaflet.ExtraMarkers#properties">here</a> for the other properties.
			<br>The rules override each other, starting from the default. Refer to the plugin documentation for more details.
		`;

        let markerIconsDiv: HTMLDivElement = null;
        new Setting(containerEl).addButton((component) =>
            component.setButtonText('New Icon Rule').onClick(() => {
                this.plugin.settings.markerIconRules.push({
                    ruleName: '',
                    preset: false,
                    iconDetails: { prefix: 'fas' },
                });
                this.refreshMarkerIcons(markerIconsDiv);
            })
        );
        markerIconsDiv = containerEl.createDiv();
        this.refreshMarkerIcons(markerIconsDiv);

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
                            DEFAULT_SETTINGS.supportRealTimeGeolocation
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.supportRealTimeGeolocation = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Geo helper type')
            .addDropdown((component) => {
                component
                    .addOption('url', 'External URL')
                    .addOption('app', 'Installed app')
                    .addOption('commandline', 'Command line')
                    .setValue(
                        this.plugin.settings.geoHelperType ??
                            DEFAULT_SETTINGS.geoHelperType
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
            'Geo Helper Command'
        );
        geoHelperCommand.addText((component) => {
            component
                .setValue(
                    this.plugin.settings.geoHelperCommand ??
                        DEFAULT_SETTINGS.geoHelperCommand
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
                    'URL to open (directly or using the defined command; see README for more details)'
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
                            : DEFAULT_SETTINGS.debug
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.debug = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    hide() {
        if (this.refreshPluginOnHide) {
            const mapViews = this.app.workspace.getLeavesOfType(
                consts.MAP_VIEW_NAME
            );
            for (const leaf of mapViews) {
                if (leaf.view) {
                    const mapView = leaf.view as BaseMapView;
                    mapView.mapContainer.refreshMap();
                }
            }
        }
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
                            ).toString()
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
                    })
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
                    })
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
                    (rule) => rule.name === defaultSetting.name
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
                        : 'Regex with 2 capture groups'
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
                    .selectEl.addClass('url-rule-dropdown')
            );
            controls.settingEl.style.padding = '0px';
            controls.settingEl.style.borderTop = 'none';
            if (!setting.preset)
                controls.addButton((component) =>
                    component.setButtonText('Delete').onClick(async () => {
                        this.plugin.settings.urlParsingRules.remove(setting);
                        await this.plugin.saveSettings();
                        this.refreshUrlParsingRules(containerEl);
                    })
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

    refreshMarkerIcons(containerEl: HTMLElement) {
        containerEl.innerHTML = '';
        let jsonControl: TextAreaComponent = null;
        let rulesDiv = containerEl.createDiv();
        // The functions to update all icons, needed when the default rule changes
        let iconUpdateFunctions: (() => void)[] = [];
        const createRules = () => {
            rulesDiv.innerHTML = '';
            const rules = this.plugin.settings.markerIconRules;
            for (const rule of rules) {
                // Assign each icon on the default one, so the preview will show how it looks when the icon properties
                // override the default one
                const setting = new Setting(rulesDiv)
                    .addText(
                        (component) =>
                            (component
                                .setPlaceholder('Tag name')
                                .setDisabled(rule.preset)
                                .setValue(rule.ruleName)
                                .onChange(async (value) => {
                                    rule.ruleName = value;
                                    await this.plugin.saveSettings();
                                    updateIconAndJson();
                                }).inputEl.style.width = '10em')
                    )
                    .addText(
                        (component) =>
                            (component
                                .setPlaceholder('Icon name')
                                .setValue(rule.iconDetails.icon ?? '')
                                .onChange(async (value) => {
                                    if (value) rule.iconDetails.icon = value;
                                    else delete rule.iconDetails.icon;
                                    await this.plugin.saveSettings();
                                    if (rule.preset)
                                        iconUpdateFunctions.forEach((update) =>
                                            update()
                                        );
                                    else updateIconAndJson();
                                }).inputEl.style.width = '8em')
                    )
                    .addText(
                        (component) =>
                            (component
                                .setPlaceholder('Color name')
                                .setValue(rule.iconDetails.markerColor ?? '')
                                .onChange(async (value) => {
                                    if (value)
                                        rule.iconDetails.markerColor = value;
                                    else delete rule.iconDetails.markerColor;
                                    await this.plugin.saveSettings();
                                    if (rule.preset)
                                        iconUpdateFunctions.forEach((update) =>
                                            update()
                                        );
                                    else updateIconAndJson();
                                }).inputEl.style.width = '8em')
                    )
                    .addText(
                        (component) =>
                            (component
                                .setPlaceholder('Shape')
                                .setValue(rule.iconDetails.shape ?? '')
                                .onChange(async (value) => {
                                    if (value) rule.iconDetails.shape = value;
                                    else delete rule.iconDetails.shape;
                                    await this.plugin.saveSettings();
                                    if (rule.preset)
                                        iconUpdateFunctions.forEach((update) =>
                                            update()
                                        );
                                    else updateIconAndJson();
                                }).inputEl.style.width = '6em')
                    );
                setting.settingEl.style.padding = '5px';
                setting.settingEl.style.borderTop = 'none';
                if (!rule.preset) {
                    setting.addButton((component) =>
                        component
                            .setButtonText('Delete')
                            .onClick(async () => {
                                rules.remove(rule);
                                await this.plugin.saveSettings();
                                this.refreshMarkerIcons(containerEl);
                            })
                            .buttonEl.classList.add('settings-dense-button')
                    );
                    const ruleIndex = rules.indexOf(rule);
                    setting.addButton((component) =>
                        component
                            .setButtonText('\u2191')
                            .onClick(async () => {
                                // Move up
                                if (ruleIndex > 1) {
                                    rules.splice(ruleIndex, 1);
                                    rules.splice(ruleIndex - 1, 0, rule);
                                    await this.plugin.saveSettings();
                                    this.refreshMarkerIcons(containerEl);
                                }
                            })
                            .buttonEl.classList.add('settings-dense-button')
                    );
                    setting.addButton((component) =>
                        component
                            .setButtonText('\u2193')
                            .onClick(async () => {
                                // Move down
                                if (ruleIndex < rules.length - 1) {
                                    rules.splice(ruleIndex, 1);
                                    rules.splice(ruleIndex + 1, 0, rule);
                                    await this.plugin.saveSettings();
                                    this.refreshMarkerIcons(containerEl);
                                }
                            })
                            .buttonEl.classList.add('settings-dense-button')
                    );
                }
                let iconElement: HTMLElement = null;
                const updateIconAndJson = () => {
                    if (iconElement) setting.controlEl.removeChild(iconElement);
                    let options = Object.assign(
                        {},
                        rules.find((element) => element.ruleName === 'default')
                            .iconDetails,
                        rule.iconDetails
                    );
                    const compiledIcon = getIconFromOptions(
                        options,
                        this.plugin.iconFactory,
                        options.shape
                    );
                    iconElement = compiledIcon.createIcon();
                    let style = iconElement.style;
                    style.marginLeft = style.marginTop = '0';
                    style.position = 'relative';
                    setting.controlEl.append(iconElement);
                    if (jsonControl)
                        jsonControl.setValue(
                            JSON.stringify(
                                this.plugin.settings.markerIconRules,
                                null,
                                2
                            )
                        );
                };
                iconUpdateFunctions.push(updateIconAndJson);
                updateIconAndJson();
            }

            let multiTagIconElement: HTMLElement = null;
            let testTagsBox: TextComponent = null;
            const ruleTestSetting = new Setting(containerEl)
                .setName('Marker preview tester')
                .addText((component) => {
                    component
                        .setPlaceholder('#tagOne #tagTwo')
                        .onChange((value) => {
                            updateMultiTagPreview();
                        });
                    testTagsBox = component;
                });
            const updateMultiTagPreview = () => {
                if (multiTagIconElement)
                    ruleTestSetting.controlEl.removeChild(multiTagIconElement);
                const compiledIcon = getIconFromRules(
                    testTagsBox.getValue().split(' '),
                    rules,
                    this.plugin.iconFactory
                );
                multiTagIconElement = compiledIcon.createIcon();
                let style = multiTagIconElement.style;
                style.marginLeft = style.marginTop = '0';
                style.position = 'relative';
                ruleTestSetting.controlEl.append(multiTagIconElement);
            };
            updateMultiTagPreview();
        };
        createRules();
        new Setting(containerEl)
            .setName('Edit marker icons as JSON (advanced)')
            .setDesc(
                'Use this for advanced settings not controllable by the GUI above. Beware - uncareful edits can get Map View to faulty behaviors!'
            )
            .addTextArea((component) => {
                component
                    .setValue(
                        JSON.stringify(
                            this.plugin.settings.markerIconRules,
                            null,
                            2
                        )
                    )
                    .onChange(async (value) => {
                        try {
                            const newMarkerIcons = JSON.parse(value);
                            this.plugin.settings.markerIconRules =
                                newMarkerIcons;
                            await this.plugin.saveSettings();
                            createRules();
                        } catch (e) {}
                    });
                jsonControl = component;
            });
    }
}
