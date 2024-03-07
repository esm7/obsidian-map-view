import { App, Loc, MarkdownRenderer, Component } from 'obsidian';
import * as leaflet from 'leaflet';
import { FileMarker } from 'src/markers';
import { PluginSettings } from 'src/settings';
import * as utils from 'src/utils';
import * as consts from 'src/consts';

export async function populateMarkerPopup(
    fileMarker: FileMarker,
    mapMarker: leaflet.Marker,
    popupDiv: HTMLDivElement,
    mapDiv: HTMLDivElement,
    settings: PluginSettings,
    app: App
) {
    popupDiv.innerHTML = '';
    const fileName = fileMarker.file.name;
    const fileNameWithoutExtension = fileName.endsWith('.md')
        ? fileName.substring(0, fileName.lastIndexOf('.md'))
        : fileName;
    let content = `<p class="map-view-marker-name">${fileNameWithoutExtension}</p>`;
    const showLinkSetting = settings.showLinkNameInPopup;
    if (
        (showLinkSetting === 'always' ||
            (showLinkSetting === 'mobileOnly' && utils.isMobile(app))) &&
        fileMarker.extraName &&
        fileMarker.extraName.length > 0
    )
        content += `<p class="map-view-marker-sub-name">${fileMarker.extraName}</p>`;

    popupDiv.innerHTML = content;

    // Adding all these classes to get the preview as closest to Obsidian's preview as possible
    const mapWidth = mapDiv.clientWidth;
    const mapHeight = mapDiv.clientHeight;
    if (
        settings.showNotePreview &&
        mapHeight >= consts.MIN_HEIGHT_TO_SHOW_MARKER_POPUP
    ) {
        const previewDiv = popupDiv.createDiv(
            'markdown-embed markdown-embed-content markdown-preview-view markdown-rendered allow-fold-headings allow-fold-lists'
        );
        await createPreview(fileMarker, previewDiv, settings, app);
    }
}

async function createPreview(
    fileMarker: FileMarker,
    element: HTMLDivElement,
    settings: PluginSettings,
    app: App
) {
    const content = await app.vault.read(fileMarker.file);
    const snippet = extractSnippet(content, 15, fileMarker.fileLine);
    MarkdownRenderer.render(
        app,
        snippet,
        element,
        fileMarker.file.path,
        new Component()
    );
}

/**
 * If the popup has a highlighted line, try to make this line visible and centered.
 */
export function scrollPopupToHighlight(popupDiv: HTMLDivElement) {
    const element = popupDiv.querySelector('.markdown-embed') as HTMLElement;
    const markedLine = element?.querySelector(
        'mark.mv-marked-line'
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

/**
 * Also adds a highlight to the line
 */
function extractSnippet(
    content: string,
    snippetLines: number,
    fileLine?: number
): string {
    const lines = content.split('\n');
    if (fileLine) {
        const linesAbove = Math.floor((snippetLines - 1) / 2);
        const linesBelow = Math.ceil((snippetLines - 1) / 2);
        let start = Math.max(fileLine - linesAbove, 0);
        let end = Math.min(fileLine + linesBelow + 1, lines.length); // +1 because slice end is exclusive
        lines[
            fileLine
        ] = `<mark class="mv-marked-line">${lines[fileLine]}</mark>`;
        return lines.slice(start, end).join('\n');
    } else {
        return lines.slice(0, snippetLines).join('\n');
    }
}
