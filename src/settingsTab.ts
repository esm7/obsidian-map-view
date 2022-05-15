import {
    App,
    TextComponent,
    PluginSettingTab,
    TextAreaComponent,
    Setting,
} from 'obsidian';

import MapViewPlugin from 'src/main';
import { PluginSettings, DEFAULT_SETTINGS } from 'src/settings';
import { getIconFromOptions, getIconFromRules } from 'src/markers';
import { MapView } from 'src/mapView';
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
            .setDesc('Auto zoom & pan the map to fit search results.')
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
                'The service used for searching for geolocations. To use Google, see details in the plugin documentation. Changes are applied after restart.'
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
                        apiKeyControl.settingEl.style.display =
                            value === 'google' ? '' : 'none';
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

        // Display the API key control only if the search provider requires it
        apiKeyControl.settingEl.style.display =
            this.plugin.settings.searchProvider === 'google' ? '' : 'none';

        new Setting(containerEl)
            .setName('Default action for map marker click')
            .setDesc(
                'How should the corresponding note be opened when clicking a map marker? Either way, CTRL reverses the behavior.'
            )
            .addDropdown((component) => {
                component
                    .addOption(
                        'samePane',
                        'Open in same pane (replace map view)'
                    )
                    .addOption(
                        'secondPane',
                        'Open in a 2nd pane and keep reusing it'
                    )
                    .addOption('alwaysNew', 'Always open a new pane')
                    .setValue(
                        this.plugin.settings.markerClickBehavior || 'samePane'
                    )
                    .onChange(async (value: any) => {
                        this.plugin.settings.markerClickBehavior = value;
                        this.plugin.saveSettings();
                    });
            });

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
            .setName('Show note preview on map marker hover')
            .setDesc(
                'In addition to the note and internal link name, show the native Obsidian note preview.'
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
                'Show a hover popup summarizing the icons inside a marker cluster. Changes are applied after restart.'
            )
            .addToggle((component) => {
                component
                    .setValue(this.plugin.settings.showClusterPreview)
                    .onChange(async (value) => {
                        this.plugin.settings.showClusterPreview = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('Default zoom for "show on map" action')
            .setDesc(
                'When jumping to the map from a note, what should be the display zoom?'
            )
            .addSlider((component) => {
                component
                    .setLimits(1, 18, 1)
                    .setValue(this.plugin.settings.zoomOnGoFromNote)
                    .onChange(async (value) => {
                        this.plugin.settings.zoomOnGoFromNote = value;
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
                    order: 'latFirst',
                    preset: false,
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
			Refer to <a href="https://fontawesome.com/">Font Awesome</a> for icon names and see <a href="https://github.com/coryasilva/Leaflet.ExtraMarkers#properties">here</a> for the other properties.
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
                    const mapView = leaf.view as MapView;
                    mapView.refreshMap();
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
                        .setPlaceholder('URL (dark) (optional)')
                        .setValue(setting.urlDark)
                        .onChange(async (value: string) => {
                            setting.urlDark = value;
                            this.refreshPluginOnHide = true;
                            await this.plugin.saveSettings();
                        });
                })
                .addText((component) => {
                    component
                        .setPlaceholder('Max Tile Zoom')
                        .setValue(
                            (typeof setting.maxZoom === 'number'
                                ? setting.maxZoom
                                : DEFAULT_MAX_TILE_ZOOM
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
                        });
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
                        .setPlaceholder('Regex with 2 capture groups')
                        .setValue(setting.regExp)
                        .onChange(async (value: string) => {
                            setting.regExp = value;
                            await this.plugin.saveSettings();
                        });
                })
                .addDropdown((component) =>
                    component
                        .addOption('latFirst', 'lat, lng')
                        .addOption('lngFirst', 'lng, lat')
                        .setValue(setting.order)
                        .onChange(async (value: 'latFirst' | 'lngFirst') => {
                            setting.order = value;
                            await this.plugin.saveSettings();
                        })
                );
            controls.settingEl.style.padding = '5px';
            controls.settingEl.style.borderTop = 'none';
            if (!setting.preset)
                controls.addButton((component) =>
                    component.setButtonText('Delete').onClick(async () => {
                        this.plugin.settings.urlParsingRules.remove(setting);
                        await this.plugin.saveSettings();
                        this.refreshUrlParsingRules(containerEl);
                    })
                );
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
                    const compiledIcon = getIconFromOptions(
                        Object.assign(
                            {},
                            rules.find(
                                (element) => element.ruleName === 'default'
                            ).iconDetails,
                            rule.iconDetails
                        )
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
                    rules
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
