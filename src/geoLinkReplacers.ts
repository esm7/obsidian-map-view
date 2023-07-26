import {
    DecorationSet,
    EditorView,
    Decoration,
    PluginValue,
    ViewUpdate,
    ViewPlugin,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import {
    editorInfoField,
    MarkdownView,
    MarkdownPostProcessorContext,
} from 'obsidian';
import MapViewPlugin from './main';
import { matchInlineLocation, generateMarkerId } from './markers';
import * as regex from './regex';

export interface GeoLinkReplacePlugin extends PluginValue {}

/*
 * This is a CodeMirror editor View plugin that modifies editor links to have custom 'onclick' and mouse enter/leave
 * events, to handle Map View links and map preview popups.
 */
export function getLinkReplaceEditorPlugin(mapViewPlugin: MapViewPlugin) {
    return ViewPlugin.fromClass(
        class implements GeoLinkReplacePlugin {
            view: EditorView;
            decorations: DecorationSet;
            active = false;
            mapViewPlugin: MapViewPlugin;

            constructor(view: EditorView) {
                this.mapViewPlugin = mapViewPlugin;
                this.decorations = this.buildDecorations(view);
            }

            update(vu: ViewUpdate) {
                if (vu.viewportChanged || vu.docChanged) {
                    this.decorations = this.buildDecorations(vu.view);
                }
            }

            /*
             * This basically searches the document (within the visible viewport) for inline and front matter
             * geolocations, and makes these links that Map View handles internally.
             */
            buildDecorations(view: EditorView) {
                const builder = new RangeSetBuilder<Decoration>();
                if (!this.mapViewPlugin.settings.handleGeolinksInNotes)
                    return builder.finish();
                if (view == null || view.state == null) return builder.finish();

                let matches: {
                    markerId: string;
                    lat: string;
                    lng: string;
                    from: number;
                    to: number;
                }[] = [];
                const viewport = view.viewport;
                // Make sure that only the visible area is searched, for performance reasons
                const text = view.state.doc.sliceString(
                    viewport.from,
                    viewport.to
                );
                const editorInfo = view.state.field(editorInfoField);
                const fileName =
                    editorInfo instanceof MarkdownView
                        ? editorInfo?.file?.name
                        : null;
                // Search for inline geolocations
                let inlineMatches = matchInlineLocation(text);
                for (const match of inlineMatches) {
                    const lat = match.groups.lat;
                    const lng = match.groups.lng;
                    if (
                        match.groups.link &&
                        match.groups.link.length > 0 &&
                        lat &&
                        lng
                    ) {
                        // For each such link we calculate the marker ID of Map View so it can find the relevant
                        // marker to highlight, and we then tell CodeMirror to add a "decoration" that modifies
                        // the DOM for the relevant mouse events.
                        const from = viewport.from + match.index;
                        const to = from + match.groups.link.length;
                        const markerId = generateMarkerId(
                            fileName,
                            lat,
                            lng,
                            from,
                            null
                        );
                        matches.push({
                            markerId,
                            lat,
                            lng,
                            from,
                            to,
                        });
                    }
                }
                // Now do the same for the document front matter -- convert it into a link
                let frontMatterMatch = text.match(regex.FRONT_MATTER_LOCATION);
                if (frontMatterMatch) {
                    const lat = frontMatterMatch.groups.lat;
                    const lng = frontMatterMatch.groups.lng;
                    if (lat && lng) {
                        const from =
                            viewport.from +
                            frontMatterMatch.index +
                            frontMatterMatch.groups.header.length;
                        const to = from + frontMatterMatch.groups.loc.length;
                        const markerId = generateMarkerId(
                            fileName,
                            lat,
                            lng,
                            null,
                            null
                        );
                        matches.push({
                            markerId,
                            lat,
                            lng,
                            from,
                            to,
                        });
                    }
                }
                // The range builder needs the ranges sorted by 'from'
                matches.sort((a, b) => a.from - b.from);
                for (const match of matches) {
                    builder.add(
                        match.from,
                        match.to,
                        this.makeDecoration(
                            match.from,
                            match.to,
                            match.markerId,
                            match.lat,
                            match.lng
                        )
                    );
                }
                return builder.finish();
            }

            makeDecoration(
                from: number,
                to: number,
                markerId: string,
                lat: string,
                lng: string
            ) {
                return Decoration.mark({
                    from,
                    to,
                    tagName: 'a',
                    attributes: {
                        // The functions referenced here need to be given as text, and are therefore defined in
                        // the main plugin module on a 'window' level.
                        onclick: `handleMapViewGeoLink(event, ${from}, "${markerId}", "${lat}", "${lng}")`,
                        // This is not ideal since it ruins scrolling and other default behaviors on touches that
                        // start from the link, but without this, in mobile links launch their default behavior
                        // in addition to the one I set above
                        ontouchstart: `handleMapViewGeoLink(event, ${from}, "${markerId}", "${lat}", "${lng}")`,
                        onmouseover: `createMapPopup(event, ${from}, "${markerId}", "${lat}", "${lng}")`,
                        onmouseout: 'closeMapPopup(event)',
                    },
                    class: 'geolink',
                });
            }

            destroy() {}
        },
        { decorations: (v) => v.decorations }
    );
}

// This returns a Markdown post-processor that adds attributes to geolinks, similarly to the editor extension above.
export const replaceLinksPostProcessor = (mapViewPlugin: MapViewPlugin) => {
    return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        if (!mapViewPlugin.settings.handleGeolinksInNotes) return;
        const links = Array.from(el.querySelectorAll('a'));
        for (const link of links) {
            if (link.href.startsWith('geo:')) {
                // This is very similar to the editor extension above, with the same reason that the functions here need to be
                // defined as strings.
                // However one main difference is that we don't have a reliable way to calculate the document position
                // of the links, and thus don't have a marker ID to highlight.
                const match = link.href.substring(4).match(regex.COORDINATES);
                if (
                    match &&
                    match.groups &&
                    match.groups.lat &&
                    match.groups.lng
                ) {
                    link.setAttribute(
                        'onclick',
                        `handleMapViewGeoLink(event, null, null, "${match.groups.lat}", "${match.groups.lng}")`
                    );
                    link.setAttribute(
                        'ontouchstart',
                        `handleMapViewGeoLink(event, null, null, "${match.groups.lat}", "${match.groups.lng}")`
                    );
                    link.setAttribute(
                        'onmouseover',
                        `createMapPopup(event, null, null, "${match.groups.lat}", "${match.groups.lng}")`
                    );
                    link.setAttribute('onmouseout', 'closeMapPopup(event)');
                }
            }
        }
    };
};
