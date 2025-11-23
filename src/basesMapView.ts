import {
    BasesView,
    QueryController,
    type MarkdownPostProcessorContext,
    type ViewOption,
} from 'obsidian';

import { type PluginSettings } from 'src/settings';
import MapViewPlugin from 'src/main';

import { MapContainer, type ViewSettings } from 'src/mapContainer';
import { type MapState, mergeStates } from 'src/mapState';
import * as leaflet from 'leaflet';

/*
 * A view for Obsidian Bases.
 */
export class BasesMapView extends BasesView {
    type = 'map-view-plugin';

    public mapContainer: MapContainer;
    // private resizeObserver: ResizeObserver;
    private settings: PluginSettings;
    private parentEl: HTMLElement;

    constructor(
        controller: QueryController,
        parentEl: HTMLElement,
        settings: PluginSettings,
        plugin: MapViewPlugin,
    ) {
        super(controller);
        this.settings = settings;
        this.parentEl = parentEl;

        const viewSettings: ViewSettings = {
            showMinimizeButton: true,
            showZoomButtons: true,
            showMapControls: true,
            showFilters: false,
            showView: false,
            showLinks: false,
            viewTabType: 'regular',
            showEmbeddedControls: false,
            showPresets: false,
            showEdit: true,
            showSearch: true,
            showRouting: true,
            showRealTimeButton: true,
            showLockButton: false,
            showOpenButton: false,
            autoZoom: true,
            emptyFitRevertsToDefault: true,
        };

        this.mapContainer = new MapContainer(
            parentEl,
            settings,
            viewSettings,
            plugin,
            plugin.app,
        );
    }

    onload(): void {
        this.mapContainer.onOpen();
        this.setHeight(this.mapContainer.state.embeddedHeight);
        this.mapContainer.onStateChangedByUserCallback = (
            newState: MapState,
        ) => {
            this.config.set(
                'mapCenter',
                `${newState.mapCenter.lat},${newState.mapCenter.lng}`,
            );
            this.config.set('mapZoom', newState.mapZoom);
        };
    }

    onunload() {
        // TODO
    }

    setHeight(height: number) {
        if (this.isEmbedded()) {
            const currentHeight = parseInt(
                this.mapContainer.display.viewDiv.style.height,
            );
            const state = this.mapContainer.state;
            if (
                height &&
                height > 0 &&
                (!currentHeight || currentHeight !== height)
            ) {
                this.mapContainer.display.viewDiv.style.height = `${height}px`;
            }
        }
    }

    isEmbedded(): boolean {
        let element = this.parentEl;
        while (element) {
            if (
                element.hasClass('bases-embed') ||
                element.hasClass('block-language-base')
            ) {
                return true;
            }
            element = element.parentElement;
        }
        return false;
    }

    onResize(): void {
        if (this.mapContainer.display.mapDiv) {
            this.mapContainer.display.map.invalidateSize();
            const mapSize = this.mapContainer.display.map.getSize();
            if (mapSize.x > 0 && mapSize.y > 0) {
                // On a size invalidation, if the state requires us to auto-fit, we must run it again
                if (this.mapContainer.getState().autoFit)
                    this.mapContainer.autoFitMapToMarkers();
            }
        }
    }

    public onDataUpdated(): void {
        const [partialState, partialViewSettings] =
            this.viewConfigToMapStructures();
        let fullState = mergeStates(this.settings.defaultState, partialState);
        this.mapContainer.basesQueryResult = this.data;
        this.mapContainer.highLevelSetViewStateAsync(fullState, true);
        this.mapContainer.display.controls.setViewSettings(partialViewSettings);
        this.setHeight(fullState.embeddedHeight);
    }

    async setState(state: Partial<MapState>): Promise<MapState> {
        return this.mapContainer.highLevelSetViewState(state);
    }

    private viewConfigToMapStructures(): [
        Partial<MapState>,
        Partial<ViewSettings>,
    ] {
        let mapState: any = {};
        let viewSettings: Partial<ViewSettings> = {};
        const viewOptions = BasesMapView.getViewOptions(this.settings);

        // Helper function to process view options and extract keys
        const processViewOptions = (options: ViewOption[]) => {
            for (const option of options) {
                if (option.type === 'group' && option.items) {
                    // Recursively process group items
                    processViewOptions(option.items);
                } else if ('key' in option) {
                    const value = this.config.get(option.key);
                    if (value !== undefined) mapState[option.key] = value;
                }
            }
        };

        processViewOptions(viewOptions);

        // Fix types
        if (mapState.chosenMapSource)
            mapState.chosenMapSource = parseInt(mapState.chosenMapSource);
        if (mapState.mapCenter && mapState.mapCenter.length > 0) {
            const mapCenter = (mapState.mapCenter.split(',') as string[]).map(
                (part) => parseFloat(part.trim()),
            );
            if (mapCenter.length === 2)
                mapState.mapCenter = new leaflet.LatLng(
                    mapCenter[0],
                    mapCenter[1],
                );
            else delete mapState.mapCenter;
        } else delete mapState.mapCenter;

        if ('showEdit' in mapState) {
            // This belongs to the view settings, not the state
            viewSettings.showEdit = mapState.showEdit;
            delete mapState.showEdit;
        }

        return [mapState, viewSettings];
    }

    static getViewOptions(settings: PluginSettings): ViewOption[] {
        const mapCenter = settings.defaultState.mapCenter;
        return [
            {
                displayName: 'Additional Filters',
                key: 'query',
                type: 'text',
                default: '',
                placeholder: 'Map View query',
            },
            {
                displayName: 'View',
                type: 'group',
                items: [
                    {
                        displayName: 'Map Source',
                        key: 'chosenMapSource',
                        type: 'dropdown',
                        options: Object.fromEntries(
                            settings.mapSources.map((tileSource, index) => [
                                index.toString(),
                                tileSource.name,
                            ]),
                        ),
                        default:
                            settings.defaultState.chosenMapSource.toString(),
                    },
                    {
                        displayName: 'Embedded Height',
                        key: 'embeddedHeight',
                        type: 'slider',
                        min: 50,
                        max: 800,
                        step: 25,
                        default: settings.defaultState.embeddedHeight,
                    },
                    {
                        displayName: 'Labels',
                        key: 'markerLabels',
                        type: 'dropdown',
                        options: {
                            off: 'No labels',
                            left: 'Left labels',
                            right: 'Right labels',
                        },
                        default: settings.defaultState.markerLabels,
                    },
                    // {
                    // 	displayName: 'Show Edit Controls',
                    // 	key: 'showEdit',
                    // 	type: 'toggle',
                    // 	default: true
                    // }
                ],
            },
            {
                displayName: 'Links',
                type: 'group',
                items: [
                    {
                        displayName: 'Links',
                        key: 'showLinks',
                        type: 'toggle',
                        default: settings.defaultState.showLinks,
                    },
                    {
                        displayName: 'Link Color',
                        key: 'linkColor',
                        type: 'text',
                        default: settings.defaultState.linkColor,
                    },
                ],
            },
            {
                displayName: 'Positioning',
                type: 'group',
                items: [
                    {
                        displayName: 'Map Center',
                        key: 'mapCenter',
                        type: 'text',
                        default: `${mapCenter.lat},${mapCenter.lng}`,
                    },
                    {
                        displayName: 'Map Zoom',
                        key: 'mapZoom',
                        type: 'slider',
                        min: 1,
                        max: 18,
                        step: 1,
                        default: settings.defaultState.mapZoom,
                    },
                ],
            },
        ];
    }

    // onResize() {
    //     if (this.mapContainer.display.mapDiv) {
    //         this.mapContainer.display.map.invalidateSize();
    //         const mapSize = this.mapContainer.display.map.getSize();
    //         if (mapSize.x > 0 && mapSize.y > 0) {
    //             // On a size invalidation, if the state requires us to auto-fit, we must run it again
    //             if (this.mapContainer.getState().autoFit)
    //                 this.mapContainer.autoFitMapToMarkers();
    //         }
    //     }
    // }
}
