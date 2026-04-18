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
            text: '地图视图插件设置',
        });

        new Setting(containerEl)
            .setName('预加载标记和路径')
            .setDesc(
                '在 Obsidian 启动时后台加载地图标记和路径缓存。这会大幅加快地图视图速度，但即使不使用也会占用内存。关闭后，只有在首次使用地图视图时才会加载。',
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
            .setName('地图跟随搜索结果')
            .setDesc(
                '自动缩放和平移地图以适应搜索结果，包括"跟随活跃笔记"功能。',
            )
            .addToggle((component) => {
                component
                    .setValue(this.plugin.settings.autoZoom)
                    .onChange(async (value) => {
                        this.plugin.settings.autoZoom = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('每次只展开一个控制面板')
            .setDesc(
                '每次只保持一个控制面板展开，点击另一个面板时折叠当前展开的面板。（重启地图视图后生效）',
            )
            .addToggle((component) => {
                component
                    .setValue(this.plugin.settings.onlyOneExpanded)
                    .onChange(async (value) => {
                        this.plugin.settings.onlyOneExpanded = value;
                        await this.plugin.saveSettings();
                    });
            });

        let apiKeyControl: Setting = null;
        let osmUser: Setting = null;
        new Setting(containerEl)
            .setName('地理编码搜索提供商')
            .setDesc(
                '用于搜索地理位置的服务。要使用 Google 服务，请查看插件文档了解详情。',
            )
            .addDropdown((component) => {
                component
                    .addOption('osm', 'OpenStreetMap')
                    .addOption('google', 'Google（需要 API 密钥）')
                    .setValue(
                        this.plugin.settings.searchProvider ||
                            DEFAULT_SETTINGS.searchProvider,
                    )
                    .onChange(async (value: 'osm' | 'google') => {
                        this.plugin.settings.searchProvider = value;
                        await this.plugin.saveSettings();
                        this.refreshPluginOnHide = true;
                        osmUser.settingEl.style.display =
                            value === 'osm' ? '' : 'none';
                        apiKeyControl.settingEl.style.display =
                            value === 'google' ? '' : 'none';
                        googlePlacesControl.settingEl.style.display =
                            this.plugin.settings.searchProvider === 'google'
                                ? ''
                                : 'none';
                        googlePlacesDataFields.settingEl.style.display =
                            googlePlacesControl.settingEl.style.display;
                    });
            });

        osmUser = new Setting(containerEl)
            .setName('OpenStreetMap 用户邮箱')
            .setDesc(
                'OpenStreetMap Nominatim 服务要求提供用户邮箱。设置后需重启地图视图。',
            )
            .addText((component) => {
                component
                    .setValue(this.plugin.settings.osmUser)
                    .onChange(async (value) => {
                        this.plugin.settings.osmUser = value;
                        await this.plugin.saveSettings();
                        component.inputEl.style.borderColor = value
                            ? ''
                            : 'red';
                    });
                component.inputEl.style.borderColor = this.plugin.settings
                    .osmUser
                    ? ''
                    : 'red';
            });

        apiKeyControl = new Setting(containerEl)
            .setName('地理编码 API 密钥')
            .setDesc(
                '如果使用 Google 作为地理编码搜索提供商，请在此粘贴 API 密钥。详见插件文档。更改在重启后生效。',
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
            .setName('使用 Google Places 进行搜索')
            .setDesc(
                '使用 Google Places API 代替 Google Geocoding 以获得更高质量的搜索结果。您的 API 密钥必须启用"Google Places (New)"权限！详见插件文档。',
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
        let googlePlacesDataFields = new Setting(containerEl)
            .setName('Google Places 查询数据字段')
            .setDesc(
                '要使用 Places API 模板（参见文档——如 "googleMapsPlaceData.place_id"），请在此列出您要查询的字段，以逗号分隔，例如 place_id,business_status。',
            )
            .addText((component) => {
                component
                    .setValue(
                        this.plugin.settings.googlePlacesDataFields ||
                            DEFAULT_SETTINGS.googlePlacesDataFields,
                    )
                    .onChange(async (value: string) => {
                        this.plugin.settings.googlePlacesDataFields = value;
                        this.plugin.saveSettings();
                    });
            });

        // Display the user or API key control only if the search provider requires it
        osmUser.settingEl.style.display =
            this.plugin.settings.searchProvider === 'osm' ? '' : 'none';
        apiKeyControl.settingEl.style.display =
            this.plugin.settings.searchProvider === 'google' ? '' : 'none';
        googlePlacesControl.settingEl.style.display =
            this.plugin.settings.searchProvider === 'google' ? '' : 'none';
        googlePlacesDataFields.settingEl.style.display =
            googlePlacesControl.settingEl.style.display;
        new Setting(containerEl)
            .setName('输入时的搜索延迟')
            .setDesc(
                '输入时发起搜索前的等待延迟（毫秒），避免每次按键都发起搜索。OSM 搜索提供商强制最低 1 秒。',
            )
            .addSlider((slider) => {
                slider
                    .setLimits(100, 2000, 50)
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
            .setName('新笔记名称格式')
            .setDesc(
                '日期/时间可以用 {{date:...}} 包裹，例如 "note-{{date:YYYY-MM-DD}}"。搜索查询可用 {{query}} 添加。',
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
            .setName('新笔记路径')
            .setDesc('从地图创建笔记时的磁盘路径。')
            .addText((component) => {
                component
                    .setValue(this.plugin.settings.newNotePath || '')
                    .onChange(async (value: string) => {
                        this.plugin.settings.newNotePath = value;
                        this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('模板文件路径')
            .setDesc('选择用作模板的文件，例如 "templates/map-log.md"。')
            .addText((component) => {
                component
                    .setValue(this.plugin.settings.newNoteTemplate || '')
                    .onChange(async (value: string) => {
                        this.plugin.settings.newNoteTemplate = value;
                        this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('聚类最大像素大小')
            .setDesc(
                '标记聚类的最大半径（像素）。值越大，聚合的标记越多，性能越好。（需要重启）',
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
            .setName('"在地图上显示"操作的默认缩放级别')
            .setDesc(
                '从笔记跳转到地图时的显示缩放级别。也用作上方"地图跟随搜索结果"的最大缩放。',
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
            .setName('允许超过定义的最大缩放')
            .setDesc(
                '允许缩放超过地图源定义的最大级别，对最高可用缩放的图像进行插值。',
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
            .setName('保存前进/后退历史')
            .setDesc(
                '在地图上操作时保存历史记录，可通过 Obsidian 前进/后退按钮浏览。',
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
            .setName('"跟随活跃笔记"的查询格式')
            .setDesc('跟随活跃笔记时使用的查询格式，$PATH$ 为文件路径。')
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
            .setName('粘贴内联地理位置时修复前置元数据')
            .setDesc(
                '监控剪贴板，当粘贴支持的地理位置格式时自动添加 "locations:" 前置元数据。',
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
            .setName('前置元数据位置的键名')
            .setDesc(
                '地图视图用于表示前置元数据位置的键名。需要重启。注意：更改后旧键名将不再被识别为地理位置。',
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
            .setName('标记内联地理位置的标签名')
            .setDesc(
                '代替或补充 "locations:" YAML 标签，您可以使用普通标签来标记包含内联地理位置的笔记，例如 "#hasLocations"。（注意：目前使用此功能会降低性能。）',
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
            .setHeading()
            .setName('笔记中的地理链接')
            .setDesc(
                '地图视图如何处理笔记中的地理链接（包括前置元数据和内联）',
            );
        new Setting(containerEl)
            .setName('处理笔记中的地理链接')
            .setDesc(
                '开启后，地图视图将在内部处理地理链接，并将前置元数据位置转换为链接。（需要重启 Obsidian 才能正确更新。）',
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
            .setName('在笔记中显示地理链接预览')
            .setDesc(
                '鼠标悬停在笔记中的地理链接上时显示地图预览弹窗。需要上方"笔记中的地理链接"功能。',
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
            .setName('地理链接地图预览的缩放级别')
            .setDesc('地理链接地图预览弹窗使用的缩放级别。')
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
            .setName('笔记中的地理链接上下文菜单')
            .setDesc(
                '覆盖 Obsidian 对笔记中地理链接的上下文菜单，确保地图视图的"打开方式"选项正确显示。需要上方"笔记中的地理链接"功能。目前在 iOS 上不可用。',
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
            .setName('标记悬停和预览')
            .setDesc('鼠标悬停（桌面）或点击（移动端）地图标记时显示的内容。');
        new Setting(containerEl)
            .setName('标记悬停时显示笔记名称')
            .setDesc('鼠标悬停在地图标记上时显示包含笔记名称的弹窗。')
            .addToggle((component) => {
                component
                    .setValue(this.plugin.settings.showNoteNamePopup)
                    .onChange(async (value) => {
                        this.plugin.settings.showNoteNamePopup = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('标记悬停时显示内联链接名称')
            .setDesc('在上方弹窗中，如果是内联链接，同时显示链接名称。')
            .addDropdown((component) => {
                component
                    .addOption('always', '总是')
                    .addOption('mobileOnly', '仅移动端')
                    .addOption('never', '从不')
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
            .setName('标记悬停时显示笔记预览')
            .setDesc(
                '除笔记名称外，还显示笔记内容预览。仅当地图足够大时才会显示。',
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
            .setName('标记悬停时显示原生 Obsidian 弹窗')
            .setDesc(
                '除上述设置外，悬停标记时触发原生 Obsidian 笔记预览。' +
                    '原生 Obsidian 预览功能更丰富，但不建议与上述功能同时使用，因为地图视图无法控制其位置，也无法向其添加笔记名称、标记名称等信息。',
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
            .setName('显示标记聚类预览')
            .setDesc('悬停标记聚类时显示包含内部图标摘要的弹窗。')
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
            .setName('面板和标签页使用')
            .setDesc('控制地图视图何时使用面板或标签页、新建还是复用等。');

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
                        '在同一面板中打开（替换地图视图）',
                    )
                    .addOption('dedicatedPane', '在第 2 个面板中打开并持续复用')
                    .addOption('alwaysNew', '总是打开新面板')
                    .addOption('dedicatedTab', '在新标签页中打开并持续复用')
                    .addOption('alwaysNewTab', '总是打开新标签页');
                if (includeLatest)
                    component.addOption('lastUsed', '在最近使用的面板中打开');
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
                .setName('地图标记点击的默认操作')
                .setDesc('点击标记后如何打开对应的笔记？'),
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
                .setName('地图标记 Ctrl+点击的默认操作')
                .setDesc('Ctrl+点击标记后如何打开对应的笔记？'),
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
                .setName('地图标记中键点击的默认操作')
                .setDesc('中键点击标记后如何打开对应的笔记？'),
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
                .setName('打开地图视图的默认模式')
                .setDesc(
                    '地图视图默认如何打开（例如点击功能区图标或从笔记中打开时）。',
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
                .setName('Ctrl+点击打开地图视图')
                .setDesc('按住 Ctrl 时如何打开地图视图。'),
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
                .setName('中键点击打开地图视图')
                .setDesc('使用中键点击时如何打开地图视图。'),
            (value: OpenBehavior) => {
                this.plugin.settings.openMapMiddleClickBehavior = value;
            },
            () => {
                return this.plugin.settings.openMapMiddleClickBehavior;
            },
            false,
        );

        new Setting(containerEl)
            .setName('新面板分割方向')
            .setDesc('在新面板中打开时的分割方向。')
            .addDropdown((component) => {
                component
                    .addOption('horizontal', '水平')
                    .addOption('vertical', '垂直')
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
            .setName('地图源');
        mapSources.descEl.innerHTML = `更改和切换地图瓦片源。可以为每个源定义可选的深色模式 URL。如果没有定义深色 URL 并使用深色模式，地图颜色将反转。详见<a href="https://esm7.github.io/obsidian-map-view/map-sources">文档</a>。`;

        let mapSourcesDiv: HTMLDivElement = null;
        new Setting(containerEl).addButton((component) =>
            component.setButtonText('新建地图源').onClick(() => {
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
            .setName('自定义"在...中打开"操作')
            .setDesc(
                "'在...中打开'操作显示在与地理位置相关的弹出菜单中。URL 应包含 {x} 和 {y} 作为坐标参数，可选的 {name} 参数用于传递名称。",
            );

        let openInActionsDiv: HTMLDivElement = null;
        new Setting(containerEl).addButton((component) =>
            component.setButtonText('新建自定义操作').onClick(() => {
                this.plugin.settings.openIn.push({ name: '', urlPattern: '' });
                this.refreshOpenInSettings(openInActionsDiv);
            }),
        );
        openInActionsDiv = containerEl.createDiv();
        this.refreshOpenInSettings(openInActionsDiv);

        new Setting(containerEl)
            .setHeading()
            .setName('URL 解析规则')
            .setDesc(
                '用于将各种地图服务的 URL 转换为坐标的可自定义规则，供"转换 URL"操作使用。',
            );

        let parsingRulesDiv: HTMLDivElement = null;
        new Setting(containerEl).addButton((component) =>
            component.setButtonText('新建解析规则').onClick(() => {
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
            .setName('标记和路径显示规则');
        iconRulesHeading.descEl.innerHTML = `通过笔记标签自定义地图标记。
			图标名称参考 <a href="https://fontawesome.com/">Font Awesome</a> 或使用 <a href="https://emojipedia.org">表情符号</a>，其他属性参见 <a href="https://github.com/coryasilva/Leaflet.ExtraMarkers#properties">这里</a>。
			<br>规则按顺序覆盖，从默认规则开始。详见插件文档。
		`;

        new Setting(containerEl).addButton((component) =>
            component.setButtonText('标记和路径显示规则...').onClick(() => {
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

        new Setting(containerEl).setHeading().setName('路径、GeoJSON、GPX');
        new Setting(containerEl)
            .setName("处理 'geojson' 代码块")
            .setDesc("为 'geojson' 代码块显示嵌入式地图。")
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
        new Setting(containerEl)
            .setName('处理支持的路径嵌入')
            .setDesc(
                '为支持的路径文件嵌入（如 `![[my path.gpx]]`）显示嵌入式地图。',
            )
            .addToggle((component) => {
                component
                    .setValue(
                        this.plugin.settings.handlePathEmbeds ??
                            DEFAULT_SETTINGS.handlePathEmbeds,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.handlePathEmbeds = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl).setHeading().setName('路由');
        new Setting(containerEl)
            .setName('外部路由服务 URL')
            .setDesc(
                '用于外部路由服务的 URL，用于"路由到此点"功能。{x0},{y0} 为起点经纬度，{x1},{y1} 为终点经纬度。',
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
            .setName('GraphHopper API 密钥')
            .setDesc(
                '您可以从 GraphHopper 获取免费或付费密钥，以启用地图视图的内置路由功能。',
            )
            .addText((component) => {
                component
                    .setValue(this.plugin.settings.routingGraphHopperApiKey)
                    .onChange(async (value: string) => {
                        this.plugin.settings.routingGraphHopperApiKey = value;
                        this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('GraphHopper 配置文件')
            .setDesc(
                '以逗号分隔的配置文件列表。注意免费计划仅支持此处列出的默认值。',
            )
            .addText((component) => {
                component
                    .setValue(this.plugin.settings.routingGraphHopperProfiles)
                    .onChange(async (value: string) => {
                        this.plugin.settings.routingGraphHopperProfiles = value;
                        this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('GraphHopper 额外参数（高级）')
            .setDesc(
                '在此粘贴有效的 GraphHopper 参数 JSON（用 {...} 包裹）。详见 GraphHopper 路由 POST 文档。',
            )
            .addText((component) => {
                component
                    .setValue(
                        JSON.stringify(
                            this.plugin.settings.routingGraphHopperExtra ?? {},
                        ),
                    )
                    .onChange(async (value: string) => {
                        try {
                            this.plugin.settings.routingGraphHopperExtra =
                                JSON.parse(value);
                        } catch (e) {
                            this.plugin.settings.routingGraphHopperExtra =
                                DEFAULT_SETTINGS.routingGraphHopperExtra;
                        }
                        this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl).setHeading().setName('离线地图');
        new Setting(containerEl)
            .setName('管理离线存储')
            .setDesc(
                '保存和删除瓦片以供离线使用。也可通过地图的上下文菜单访问。',
            )
            .addButton((component) => {
                component.setButtonText('离线存储...').onClick(() => {
                    const mapView = this.findMapView();
                    if (mapView)
                        openManagerDialog(
                            this.plugin,
                            this.plugin.settings,
                            mapView.mapContainer,
                        );
                    else alert('需要先打开地图视图。');
                });
            });
        new Setting(containerEl)
            .setName('自动缓存')
            .setDesc(
                '自动存储所有查看过的瓦片到本地。有利于性能但会占用存储空间。关闭后，仅保留显式下载的离线瓦片。',
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
            .setName('自动清除超过...的瓦片')
            .setDesc(
                '在 Obsidian 启动时移除旧瓦片以保持地图更新。目前同时适用于自动缓存和显式下载的瓦片。',
            )
            .addDropdown((component) => {
                component
                    .addOption('1', '1 个月')
                    .addOption('3', '3 个月')
                    .addOption('6', '6 个月')
                    .addOption('12', '12 个月')
                    .addOption('0', '从不')
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
            .setName('离线瓦片最大存储量 (GB)')
            .setDesc(
                '如果存储量过大，在 Obsidian 启动时按时间清除旧瓦片。目前同时适用于自动缓存和显式下载的瓦片。',
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

        const gpsTitle = new Setting(containerEl)
            .setHeading()
            .setName('GPS 和实时位置');
        const warningFragment = document.createDocumentFragment();
        const warningText = warningFragment.createDiv();
        warningText.innerHTML = '需要位置权限。';
        gpsTitle.setDesc(warningFragment);
        new Setting(containerEl)
            .setName('启用 GPS 支持')
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
            .setName('自动填充空位置属性（仅移动端）')
            .setDesc(
                "当笔记中发现空的前置元数据位置键（'location' 或上面设置的自定义键）且有实时位置时，自动填充位置。可与模板配合使用来自动填充每日位置等。仅限移动端。",
            )
            .addToggle((component) => {
                component
                    .setValue(
                        this.plugin.settings.autoAddLocationIfEmptyProperty ??
                            DEFAULT_SETTINGS.autoAddLocationIfEmptyProperty,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.autoAddLocationIfEmptyProperty =
                            value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(containerEl)
            .setName('不自动填充位置的路径模式')
            .setDesc(
                '包含此文本的文件路径不会自动填充空位置属性。重要：防止地图视图破坏模板文件。',
            )
            .addText((component) => {
                component
                    .setValue(
                        this.plugin.settings.autoAddLocationExclude ||
                            DEFAULT_SETTINGS.autoAddLocationExclude,
                    )
                    .onChange(async (value: string) => {
                        this.plugin.settings.autoAddLocationExclude = value;
                        this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl).setHeading().setName('高级');

        new Setting(containerEl)
            .setName('调试日志（高级）')
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
                        .setPlaceholder('名称')
                        .setValue(setting.name)
                        .onChange(async (value: string) => {
                            setting.name = value;
                            this.refreshPluginOnHide = true;
                            await this.plugin.saveSettings();
                        }).inputEl.style.width = '10em';
                })
                .addText((component) => {
                    component
                        .setPlaceholder('URL（浅色/默认）')
                        .setValue(setting.urlLight)
                        .onChange(async (value: string) => {
                            setting.urlLight = value;
                            this.refreshPluginOnHide = true;
                            await this.plugin.saveSettings();
                        });
                })
                .addText((component) => {
                    component
                        .setPlaceholder('URL（深色）（可选）')
                        .setValue(setting.urlDark)
                        .onChange(async (value: string) => {
                            setting.urlDark = value;
                            this.refreshPluginOnHide = true;
                            await this.plugin.saveSettings();
                        }).inputEl.style.width = '10em';
                })
                .addText((component) => {
                    component
                        .setPlaceholder('最大缩放级别')
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
                    component.setButtonText('删除').onClick(async () => {
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
                        .setPlaceholder('名称')
                        .setValue(setting.name)
                        .onChange(async (value: string) => {
                            setting.name = value;
                            await this.plugin.saveSettings();
                        });
                })
                .addText((component) => {
                    component
                        .setPlaceholder('URL 模板')
                        .setValue(setting.urlPattern)
                        .onChange(async (value: string) => {
                            setting.urlPattern = value;
                            await this.plugin.saveSettings();
                        });
                })
                .addButton((component) =>
                    component.setButtonText('删除').onClick(async () => {
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
                        ? '含 1 个捕获组的正则表达式'
                        : '含 2 个捕获组的正则表达式',
                );
                if (line2)
                    line2.style.display =
                        ruleType === 'fetch' ? 'block' : 'none';
            };
            const controls = new Setting(line1).addText((component) => {
                component
                    .setPlaceholder('名称')
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
                    component.setButtonText('删除').onClick(async () => {
                        this.plugin.settings.urlParsingRules.remove(setting);
                        await this.plugin.saveSettings();
                        this.refreshUrlParsingRules(containerEl);
                    }),
                );
            line2 = parsingRuleDiv.createDiv('parsing-rule-line-2');
            adjustToRuleType(setting.ruleType);
            const contentLabel = line2.createEl('label');
            contentLabel.setText('内容解析表达式：');
            contentLabel.style.paddingRight = '10px';
            new TextComponent(line2)
                .setPlaceholder('含 1-2 个捕获组的正则表达式')
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
