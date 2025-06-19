<script lang="ts">
    import { onMount } from 'svelte';
    import MapViewPlugin from '../main';
    import { App, getIcon, Component, MarkdownRenderer } from 'obsidian';
    import { type PluginSettings } from '../settings';
    import { MapContainer } from '../mapContainer';
    import { BaseGeoLayer } from '../baseGeoLayer';
    import { FileMarker } from '../fileMarker';
    import { FloatingMarker } from '../floatingMarker';
    import * as utils from '../utils';
    import * as consts from '../consts';
    import * as leaflet from 'leaflet';

    let { plugin, app, settings, view, layer, leafletLayer, doClose } = $props<{
        plugin: MapViewPlugin;
        app: App;
        settings: PluginSettings;
        view: MapContainer;
        layer: BaseGeoLayer;
        leafletLayer: leaflet.Layer;
        doClose: () => void;
    }>();

    let header = $state('');
    if (layer instanceof FileMarker) {
        const fileName = layer.file.name;
        header = fileName.endsWith('.md')
            ? fileName.substring(0, fileName.lastIndexOf('.md'))
            : fileName;
    } else if (layer instanceof FloatingMarker) {
        header = layer.header;
    }

    const showLinkSetting = settings.showLinkNameInPopup;
    const showExtraName =
        (showLinkSetting === 'always' ||
            (showLinkSetting === 'mobileOnly' && utils.isMobile(app))) &&
        layer.extraName &&
        layer.extraName.length > 0;
    const mapHeight = view.display.mapDiv.clientHeight;
    const showPreview =
        settings.showNotePreview &&
        mapHeight >= consts.MIN_HEIGHT_TO_SHOW_MARKER_POPUP;
    let previewDiv: HTMLDivElement;

    async function createPreview(
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
            await createPreview(layer, previewDiv, settings, app);
            scrollPopupToHighlight(previewDiv);
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

<div class="mv-marker-popup-internal" class:with-preview={showPreview}>
    <div class="top-row">
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="headlines clickable" onclick={openNote}>
            <p class="map-view-marker-name">
                {header}
            </p>
            {#if showExtraName}
                <p class="map-view-marker-sub-name">
                    {layer.extraName}
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
    <!-- Adding all these classes to get the preview as closest to Obsidian's preview as possible -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
        class="markdown-embed markdown-embed-content markdown-preview-view markdown-rendered allow-fold-headings allow-fold-lists"
        bind:this={previewDiv}
    ></div>
</div>

<style>
    .mv-marker-popup-internal {
        display: flex;
        flex-direction: column;
        position: relative;
        margin: 5px;
        gap: 8px;
    }

    .with-preview {
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
