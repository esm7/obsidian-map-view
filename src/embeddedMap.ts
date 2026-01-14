import { App, Notice, type MarkdownPostProcessorContext } from 'obsidian';

import { type PluginSettings } from 'src/settings';
import MapViewPlugin from 'src/main';

import { MapContainer, type ViewSettings } from 'src/mapContainer';
import { type MapState, getCodeBlock } from 'src/mapState';
import { getEditor, findOpenMapView } from 'src/utils';

export class EmbeddedMap {
    public mapContainer: MapContainer;
    private resizeObserver: ResizeObserver;
    private settings: PluginSettings;
    private app: App;
    private markdownContext: MarkdownPostProcessorContext;
    private parentEl: HTMLElement;
    private customViewSettings: Partial<ViewSettings>;

    constructor(
        parentEl: HTMLElement,
        ctx: MarkdownPostProcessorContext,
        app: App,
        settings: PluginSettings,
        plugin: MapViewPlugin,
        customViewSettings: Partial<ViewSettings> = null,
    ) {
        this.app = app;
        this.settings = settings;
        this.markdownContext = ctx;
        this.parentEl = parentEl;
        this.customViewSettings = customViewSettings;

        const viewSettings: ViewSettings = {
            showMinimizeButton: false,
            showZoomButtons: true,
            showMapControls: true,
            showFilters: false,
            showView: true,
            showLinks: false,
            viewTabType: 'mini',
            showEmbeddedControls: true,
            showPresets: false,
            showEdit: false,
            showSearch: false,
            showRouting: false,
            showRealTimeButton: false,
            showLockButton: true,
            showOpenButton: true,
            autoZoom: true,
            emptyFitRevertsToDefault: true,
            ...customViewSettings,
        };

        this.mapContainer = new MapContainer(
            parentEl,
            settings,
            viewSettings,
            plugin,
            plugin.app,
        );

        this.mapContainer.updateCodeBlockCallback = async () => {
            this.updateCodeBlockWithState(this.mapContainer.state);
        };

        this.mapContainer.updateCodeBlockFromMapViewCallback = async () => {
            const view = findOpenMapView(this.app);
            if (!view) {
                new Notice(
                    "Can't find another Map View instance to copy the state from",
                );
                return;
            }
            const state = view.mapContainer.state;
            const success = this.updateCodeBlockWithState(state);
            if (success)
                new Notice('Successfully copied another open Map View');
        };
    }

    async updateCodeBlockWithState(state: MapState) {
        const sectionInfo = this.markdownContext.getSectionInfo(this.parentEl);
        if (!sectionInfo) {
            new Notice('Unable to find section info');
            return false;
        }
        const editor = getEditor(this.app);
        if (!editor) {
            new Notice('Unable to find the current editor');
            return false;
        } else {
            const lastLineLength = editor.getLine(sectionInfo.lineEnd).length;
            const newBlock = getCodeBlock(state, this.customViewSettings);
            editor.replaceRange(
                newBlock,
                { line: sectionInfo.lineStart, ch: 0 },
                { line: sectionInfo.lineEnd, ch: lastLineLength },
            );
            // If the cursor was in an invisible location of the document (e.g. above the current viewport),
            // calling replaceRange above would scroll back to it. In order to prevent such a jump, and ensure
            // the map stays in view after the replacement, we move the cursor to be next to it
            let freeLine;
            if (sectionInfo.lineEnd != editor.lastLine())
                freeLine = sectionInfo.lineEnd + 1;
            else freeLine = sectionInfo.lineStart - 1;
            editor.setCursor({ line: freeLine, ch: 0 });
            return true;
        }
    }

    async open(state: MapState) {
        this.mapContainer.defaultState = state;
        await this.mapContainer.onOpen();
        this.resizeObserver = new ResizeObserver(() => {
            this.onResize();
        });
        this.resizeObserver.observe(this.mapContainer.display.mapDiv);
        await this.mapContainer.highLevelSetViewStateAsync(state);
        if (state.embeddedHeight && state.embeddedHeight > 0)
            this.parentEl.style.height = `${state.embeddedHeight}px`;
        this.settings.mapControlsSections.viewDisplayed = false;
        this.onResize();
    }

    async setState(state: Partial<MapState>): Promise<MapState> {
        return this.mapContainer.highLevelSetViewState(state);
    }

    onResize() {
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
}
