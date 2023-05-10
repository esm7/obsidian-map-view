import {
    App,
    Editor,
    Notice,
    EditorSuggest,
    EditorPosition,
    TFile,
    EditorSuggestTriggerInfo,
    EditorSuggestContext,
} from 'obsidian';
import { GeoSearcher } from 'src/geosearch';

import * as utils from 'src/utils';
import { PluginSettings } from 'src/settings';
import { GeoSearchResult } from 'src/geosearch';

class SuggestInfo extends GeoSearchResult {
    context: EditorSuggestContext;
}

export class LocationSuggest extends EditorSuggest<SuggestInfo> {
    private cursorInsideGeolinkFinder = /\[(.*?)\]\(geo:.*?\)/g;
    private lastSearchTime = 0;
    private delayInMs = 250;
    private settings: PluginSettings;
    private searcher: GeoSearcher;

    constructor(app: App, settings: PluginSettings) {
        super(app);
        this.settings = settings;
        this.searcher = new GeoSearcher(app, settings);
    }

    onTrigger(
        cursor: EditorPosition,
        editor: Editor,
        file: TFile
    ): EditorSuggestTriggerInfo | null {
        const currentLink = this.getGeolinkOfCursor(cursor, editor);
        if (currentLink)
            return {
                start: { line: cursor.line, ch: currentLink.index },
                end: { line: cursor.line, ch: currentLink.linkEnd },
                query: currentLink.name,
            };
        return null;
    }

    async getSuggestions(
        context: EditorSuggestContext
    ): Promise<SuggestInfo[]> {
        if (context.query.length < 2) return [];
        return await this.getSearchResultsWithDelay(context);
    }

    renderSuggestion(value: SuggestInfo, el: HTMLElement) {
        el.setText(value.name);
    }

    selectSuggestion(value: SuggestInfo, evt: MouseEvent | KeyboardEvent) {
        // Replace the link under the cursor with the retrieved location.
        // We call getGeolinkOfCursor again instead of using the original context because it's possible that
        // the user continued to type text after the suggestion was made
        const currentCursor = value.context.editor.getCursor();
        const linkOfCursor = this.getGeolinkOfCursor(
            currentCursor,
            value.context.editor
        );
        const finalResult = `[${value.context.query}](geo:${value.location.lat},${value.location.lng})`;
        value.context.editor.replaceRange(
            finalResult,
            { line: currentCursor.line, ch: linkOfCursor.index },
            { line: currentCursor.line, ch: linkOfCursor.linkEnd }
        );
        if (
            utils.verifyOrAddFrontMatterForInline(
                value.context.editor,
                this.settings
            )
        )
            new Notice(
                "The note's front matter was updated to denote locations are present"
            );
    }

    getGeolinkOfCursor(cursor: EditorPosition, editor: Editor) {
        const results = editor
            .getLine(cursor.line)
            .matchAll(this.cursorInsideGeolinkFinder);
        if (!results) return null;
        for (let result of results) {
            const linkName = result[1];
            if (
                cursor.ch >= result.index &&
                cursor.ch < result.index + linkName.length + 2
            )
                return {
                    index: result.index,
                    name: linkName,
                    linkEnd: result.index + result[0].length,
                };
        }
        return null;
    }

    async getSearchResultsWithDelay(
        context: EditorSuggestContext
    ): Promise<SuggestInfo[] | null> {
        const timestamp = Date.now();
        this.lastSearchTime = timestamp;
        const Sleep = (ms: number) =>
            new Promise((resolve) => setTimeout(resolve, ms));
        await Sleep(this.delayInMs);
        if (this.lastSearchTime != timestamp) {
            // Search is canceled by a newer search
            return null;
        }
        // After the sleep our search is still the last -- so the user stopped and we can go on
        const searchResults = await this.searcher.search(context.query);
        let suggestions: SuggestInfo[] = [];
        for (const result of searchResults)
            suggestions.push({
                ...result,
                context: context,
            });
        return suggestions;
    }

    async selectionToLink(editor: Editor) {
        const selection = editor.getSelection();
        const results = await this.searcher.search(selection);
        if (results && results.length > 0) {
            const firstResult = results[0];
            const location = firstResult.location;
            editor.replaceSelection(
                `[${selection}](geo:${location.lat},${location.lng})`
            );
            new Notice(firstResult.name, 10 * 1000);
            if (utils.verifyOrAddFrontMatterForInline(editor, this.settings))
                new Notice(
                    "The note's front matter was updated to denote locations are present"
                );
        } else {
            new Notice(`No location found for the term '${selection}'`);
        }
    }
}
