import { PluginSettings } from 'src/settings';
import { EmbeddedMap } from 'src/embeddedMap';
import MapViewPlugin from './main';
import { App } from 'obsidian';
import { MapState, mergeStates } from 'src/mapState';
import * as leaflet from 'leaflet';
import { createPopper, Instance as PopperInstance } from '@popperjs/core';

/***
 * Ideally I would have loved to have a single MapPreviewPopup object and recycle it throughout the app's
 * lifetime. But I was unable to get this to work smoothly due to annoying flashes of the old map when moving
 * between links. Everything I tried, e.g. showing the popup only when the map's 'moveend' event was fired,
 * led to more problems.
 * So the way it works for now, is that a MapPreviewPopup shows a single map, and the map is recreated
 * every time the user hovers a link, requiring loading all the markers etc.
 */
export class MapPreviewPopup {
    private popupDiv: HTMLDivElement = null;
    private mapDiv: HTMLDivElement = null;
    private map: EmbeddedMap = null;
    private targetElement: HTMLElement = null;
    private popupObserver: MutationObserver = null;
    private settings: PluginSettings;
    private plugin: MapViewPlugin;
    private app: App;
    private popperInstance: PopperInstance;
    private isOpen: boolean = false;

    constructor(settings: PluginSettings, plugin: MapViewPlugin, app: App) {
        this.settings = settings;
        this.plugin = plugin;
        this.app = app;

        this.popupDiv = document.body.createDiv('map-preview-popup');
        this.mapDiv = this.popupDiv.createDiv('map-preview-popup-map');
        this.popupDiv.addClasses(['popover', 'hover-popup']);
        this.map = new EmbeddedMap(
            this.mapDiv,
            null,
            this.app,
            this.settings,
            this.plugin,
            {
                showZoomButtons: false,
                showMapControls: false,
                showEmbeddedControls: false,
                showOpenButton: false,
                skipAnimations: true,
            }
        );
    }

    async open(
        event: PointerEvent,
        documentLocation: number,
        markerId: string,
        lat: string,
        lng: string
    ) {
        // We don't know how to place the element
        if (!(event.target instanceof HTMLElement)) return;
        this.targetElement = event.target;

        // This causes some recalculation of the DOM which for some reason is required to make the animations
        // work as expected
        void this.popupDiv.offsetWidth;
        // This makes sure that we know to close the popup not only when the mouse leaves it, but also when
        // the target element (i.e. the link that caused the popup) is removed from the document, e.g. when
        // the user opens another file or something else happens to the view
        this.popupObserver = new MutationObserver((mutations) => {
            if (!document.body.contains(this.targetElement)) {
                this.close(null);
            }
        });
        this.popupObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });

        this.popperInstance = createPopper(event.target, this.popupDiv, {
            placement: 'bottom-start',
        });
        await this.popperInstance.update();
        this.isOpen = true;
        this.popupDiv.addClass('show');

        const state: Partial<MapState> = {
            mapCenter: new leaflet.LatLng(parseFloat(lat), parseFloat(lng)),
            mapZoom: this.settings.zoomOnGeolinkPreview,
        };
        await this.map.open(mergeStates(this.settings.defaultState, state));
        const marker = markerId
            ? this.map.mapContainer?.findMarkerById(markerId)
            : null;
        if (marker) this.map.mapContainer.setHighlight(marker);
    }

    close(event: PointerEvent) {
        this.isOpen = false;
        this.popupDiv?.removeClass('show');
        this.popupObserver?.disconnect();
        this.popperInstance?.destroy();
        // The animation makes it difficult to find the right time to clean up the popup div, so
        // we're just doing it a second after the popup closes
        setTimeout(() => {
            if (this.popupDiv)
                this.popupDiv.parentNode?.removeChild(this.popupDiv);
        }, 1000);
    }
}
