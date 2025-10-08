<script lang="ts">
    import { onMount } from 'svelte';
    import MapViewPlugin from '../main';
    import { App, getIcon, Component, MarkdownRenderer } from 'obsidian';
    import { type PluginSettings } from '../settings';
    import { MapContainer } from '../mapContainer';
    import { BaseGeoLayer } from '../baseGeoLayer';
    import { FileMarker } from '../fileMarker';
    import { GeoJsonLayer } from '../geojsonLayer';
    import { FloatingMarker } from '../floatingMarker';
    import { FloatingPath } from '../floatingPath';
    import * as utils from '../utils';
    import * as consts from '../consts';
    import * as leaflet from 'leaflet';
    import {
        LineController,
        LineElement,
        PointElement,
        LinearScale,
        Chart,
        CategoryScale,
        type ChartConfiguration,
    } from 'chart.js';
    Chart.register([
        LineController,
        LineElement,
        LinearScale,
        PointElement,
        CategoryScale,
    ]);

    let { plugin, app, settings, view, layer, leafletLayer, doClose } = $props<{
        plugin: MapViewPlugin;
        app: App;
        settings: PluginSettings;
        view: MapContainer;
        layer: BaseGeoLayer;
        leafletLayer: leaflet.Layer;
        doClose: () => void;
    }>();

    const mapHeight = view.display.mapDiv.clientHeight;

    let header = $state('');
    let subHeader = $state('');

    let showSubHeader: boolean = $state(false);
    let showPreview: boolean = $state(false);
    let showElevation: boolean = $state(false);

    init();

    let previewDiv: HTMLDivElement = $state();
    let elevationCanvas: HTMLCanvasElement = $state();

    function init() {
        const showLinkSetting = settings.showLinkNameInPopup;
        showPreview =
            settings.showNotePreview &&
            mapHeight >= consts.MIN_HEIGHT_TO_SHOW_MARKER_POPUP;
        showSubHeader =
            (showLinkSetting === 'always' ||
                (showLinkSetting === 'mobileOnly' && utils.isMobile(app))) &&
            layer.extraName &&
            layer.extraName.length > 0;
        if (showSubHeader) subHeader = layer.extraName;
        if (layer instanceof FileMarker) {
            const fileName = layer.file.name;
            header = fileName.endsWith('.md')
                ? fileName.substring(0, fileName.lastIndexOf('.md'))
                : fileName;
        } else if (layer instanceof GeoJsonLayer) {
            const fileName = layer.file.name;
            header = fileName.endsWith('.md')
                ? fileName.substring(0, fileName.lastIndexOf('.md'))
                : fileName;
            showElevation = true;
        } else if (layer instanceof FloatingMarker) {
            header = layer.header;
        } else if (layer instanceof FloatingPath) {
            header = `Routing with ${layer.routingResult.profileUsed}`;
            showElevation = true;
            showPreview = false;
        }
    }

    async function createNotePreview(
        layer: BaseGeoLayer,
        element: HTMLDivElement,
        settings: PluginSettings,
        app: App,
    ) {
        let snippet = '';
        if (layer instanceof FileMarker) {
            const content = await app.vault.read(layer.file);
            snippet = extractSnippet(content, 15, layer.fileLine);
        } else if (layer instanceof FloatingMarker) {
            snippet = layer.description;
        } else if (layer instanceof GeoJsonLayer) {
            snippet = layer.text;
        }
        if (snippet) {
            MarkdownRenderer.render(
                app,
                snippet,
                element,
                layer.file.path,
                new Component(),
            );
        }
    }

    async function createElevationGraph(element: HTMLCanvasElement) {
        // Use the main layer coordinates, and if there is no such thing, use the first 'feature' in the collection
        const coordinates =
            layer.geojson.coordinates ??
            (layer.geojson?.features?.length > 0
                ? layer.geojson.features[0]?.geometry?.coordinates
                : []);
        // Check that all coordinates have elevation data
        if (
            !coordinates ||
            !coordinates.every(
                (coord: number[]) => coord.length > 2 && coord[2] !== undefined,
            )
        ) {
            return;
        }
        let totalDistance = 0;
        let points: { x: number; y: number }[] = [];
        let prevCoord = null;
        for (const coord of coordinates) {
            const distanceFromLastPoint =
                prevCoord !== null
                    ? view.display.map.distance(prevCoord, coord) / 1000
                    : 0;
            totalDistance += distanceFromLastPoint;
            points.push({ x: totalDistance, y: coord[2] });
            prevCoord = coord;
        }
        const chartConfig: ChartConfiguration<'line'> = {
            type: 'line' as const,
            data: {
                datasets: [
                    {
                        data: points,
                        pointRadius: 0,
                        borderColor: 'black',
                        borderJoinStyle: 'round',
                    },
                ],
            },
            options: {
                animation: false,
                scales: {
                    x: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: 'Distance (km)',
                        },
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Elevation (m)',
                        },
                    },
                },
            },
        };
        new Chart(elevationCanvas, chartConfig);
    }

    /**
     * Also adds a highlight to the line
     */
    function extractSnippet(
        content: string,
        snippetLines: number,
        fileLine?: number,
    ): string {
        const lines = content.split('\n');
        if (fileLine) {
            const linesAbove = Math.floor((snippetLines - 1) / 2);
            const linesBelow = Math.ceil((snippetLines - 1) / 2);
            let start = Math.max(fileLine - linesAbove, 0);
            let end = Math.min(fileLine + linesBelow + 1, lines.length); // +1 because slice end is exclusive
            lines[fileLine] =
                `<mark class="mv-marked-line">${lines[fileLine]}</mark>`;
            return lines.slice(start, end).join('\n');
        } else {
            return lines.slice(0, snippetLines).join('\n');
        }
    }

    /**
     * If the popup has a highlighted line, try to make this line visible and centered.
     */
    export function scrollPopupToHighlight(element: HTMLDivElement) {
        const markedLine = element?.querySelector(
            'mark.mv-marked-line',
        ) as HTMLElement;
        if (element && markedLine) {
            // Get the top of the marked line in relation to the scrollable container (element).
            const containerRect = element.getBoundingClientRect();
            const markedLineRect = markedLine.getBoundingClientRect();
            const markTop = markedLineRect.top - containerRect.top;
            const markHeight = markedLine.offsetHeight;
            const containerHeight = element.offsetHeight;
            const scrollTopPosition =
                markTop + markHeight / 2 - containerHeight / 2;
            // Scroll the container to the calculated position
            element.scrollTop = scrollTopPosition;
        }
    }

    onMount(async () => {
        if (showPreview) {
            await createNotePreview(layer, previewDiv, settings, app);
            scrollPopupToHighlight(previewDiv);
        }
        if (showElevation) {
            await createElevationGraph(elevationCanvas);
        }
    });

    function openMenu(ev: MouseEvent) {
        const markerElement = leafletLayer.getElement();
        if (markerElement) {
            markerElement.dispatchEvent(
                new MouseEvent('contextmenu', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    button: 2,
                    buttons: 2,
                    clientX: ev.clientX,
                    clientY: ev.clientY,
                    screenX: ev.screenX,
                    screenY: ev.screenY,
                }),
            );
        }
    }

    function openNote(ev: MouseEvent) {
        view.goToMarker(
            layer,
            utils.mouseEventToOpenMode(settings, ev, 'openNote'),
            true,
        );
    }
</script>

<div
    class="mv-marker-popup-internal"
    class:with-content={showPreview || showElevation}
>
    <div class="top-row">
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="headlines clickable" onclick={openNote}>
            <p class="map-view-marker-name">
                {header}
            </p>
            {#if showSubHeader}
                <p class="map-view-marker-sub-name">
                    {subHeader}
                </p>
            {/if}
        </div>
        <div class="top-right-controls">
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="button clickable" onclick={openNote}>
                {@html getIcon('external-link').outerHTML}
            </div>
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="button clickable" onclick={openMenu}>
                {@html getIcon('ellipsis-vertical').outerHTML}
            </div>
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="button clickable" onclick={doClose()}>
                {@html getIcon('x').outerHTML}
            </div>
        </div>
    </div>
    {#if showPreview}
        <!-- Adding all these classes to get the preview as closest to Obsidian's preview as possible -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
            class="markdown-embed markdown-embed-content markdown-preview-view markdown-rendered allow-fold-headings allow-fold-lists"
            bind:this={previewDiv}
        ></div>
    {/if}
    {#if showElevation}
        <div class="elevation">
            {#if layer instanceof FloatingPath && layer.routingResult}
                {@const route = layer.routingResult}
                Distance: {(route.distanceMeters / 1000).toFixed(1)}km <br />
                Time: {utils.formatTime(route.timeMinutes)}
                {@const ascent = route?.totalAscentMeters}
                {@const descent = route?.totalDescentMeters}
                {#if ascent > 0 || descent > 0}
                    <br />
                    {#if ascent > 0}
                        Total ascent: {Math.round(ascent)}m
                    {/if}
                    {#if ascent > 0 && descent > 0}
                        ,
                    {/if}
                    {#if descent > 0}
                        Total descent: {Math.round(descent)}m
                    {/if}
                {/if}
            {/if}
            <div class="elevation-graph-container">
                <canvas class="elevationGraph" bind:this={elevationCanvas}>
                </canvas>
            </div>
        </div>
    {/if}
</div>

<style>
    .mv-marker-popup-internal {
        display: flex;
        flex-direction: column;
        position: relative;
        margin: 5px;
        gap: 8px;
    }

    .with-content {
        height: 300px;
    }

    .top-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        width: 100%;
        flex: 0 0 auto;
    }

    .headlines {
        flex: 1;
        min-width: 0;
    }

    .markdown-embed {
        width: 100%;
        flex: 1 1 auto;
        overflow-y: auto;
        padding: 5px;
    }

    :global(.markdown-embed-content p) {
        margin: 0;
    }

    .elevation-graph-container {
        width: 100%;
        height: 200px;
        padding-top: 10px;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .elevation {
        width: 100%;
        padding: 5px;
    }

    .map-view-marker-name {
        color: var(--text-normal);
        font-size: var(--font-text-size);
        font-family: var(--font-text);
        font-weight: bold;
        margin: 0;
        line-height: 1.3;
        max-height: calc(1.3em * 3);
        overflow: hidden;
    }

    .map-view-marker-sub-name {
        color: var(--text-normal);
        font-size: var(--font-text-size);
        font-family: var(--font-text);
        margin: 4px 0 0 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .top-right-controls {
        flex-shrink: 0;
        display: flex;
        gap: 4px;
    }

    .button {
        opacity: 0.8;
        color: var(--text-muted);
    }

    .clickable {
        cursor: pointer;
    }

    .button:hover {
        opacity: 1;
    }
</style>
