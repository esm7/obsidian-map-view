import {
    App,
    Editor,
    Notice,
    EditorSuggest,
    type EditorPosition,
    TFile,
    type EditorSuggestTriggerInfo,
    type EditorSuggestContext,
} from 'obsidian';
import { GeoSearcher, searchDelayMs } from 'src/geosearch';

import * as utils from 'src/utils';
import { type PluginSettings } from 'src/settings';
import { GeoSearchResult } from 'src/geosearch';
import { debounce } from 'ts-debounce';

class SuggestInfo extends GeoSearchResult {
    context: EditorSuggestContext;
}

export class LocationSuggest extends EditorSuggest<SuggestInfo> {
    // Match [...](geo:), where the part inside the square brackets cannot be more square brackets (any character
    // except '[' and ']')
    private cursorInsideGeolinkFinder = /\[([^\[\]]*?)\]\(geo:.*?\)/g;
    private lastSearchTime = 0;
    private settings: PluginSettings;
    private searcher: GeoSearcher;
    private initialized: boolean = false;
    private debouncedSearch: (
        context: EditorSuggestContext,
    ) => Promise<Promise<SuggestInfo[]>>;

    constructor(app: App, settings: PluginSettings) {
        super(app);
        this.settings = settings;
        this.debouncedSearch = debounce(
            async (context: EditorSuggestContext) => {
                return await this.doSearch(context);
            },
            searchDelayMs(this.settings),
        );
    }

    init() {
        // Lazy initialization to not hurt Obsidian's startup time
        if (!this.initialized) {
            this.searcher = new GeoSearcher(this.app, this.settings);
            this.initialized = true;
        }
    }

    onTrigger(
        cursor: EditorPosition,
        editor: Editor,
        file: TFile,
    ): EditorSuggestTriggerInfo | null {
        if (!this.initialized) this.init();
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
        context: EditorSuggestContext,
    ): Promise<SuggestInfo[]> {
        if (context.query.length < 3) return [];
        if (!this.initialized) this.init();
        let suggestions = await this.debouncedSearch(context);
        return suggestions;
    }

    renderSuggestion(value: SuggestInfo, el: HTMLElement) {
        el.setText(value.name);
    }

    async selectSuggestion(
        value: SuggestInfo,
        evt: MouseEvent | KeyboardEvent,
    ) {
        // Replace the link under the cursor with the retrieved location.
        // We call getGeolinkOfCursor again instead of using the original context because it's possible that
        // the user continued to type text after the suggestion was made
        const currentCursor = value.context.editor.getCursor();
        const linkOfCursor = this.getGeolinkOfCursor(
            currentCursor,
            value.context.editor,
        );
        const finalResult = `[${value.context.query}](geo:${value.location.lat},${value.location.lng})`;
        value.context.editor.replaceRange(
            finalResult,
            { line: currentCursor.line, ch: linkOfCursor.index },
            { line: currentCursor.line, ch: linkOfCursor.linkEnd },
        );
        value.context.editor.setCursor({
            line: currentCursor.line,
            ch: linkOfCursor.index + finalResult.length,
        });
        if (
            await utils.verifyOrAddFrontMatterForInline(
                this.app,
                value.context.editor,
                value.context.file,
                this.settings,
            )
        )
            new Notice(
                "The note's front matter was updated to denote locations are present",
            );
    }

    getGeolinkOfCursor(cursor: EditorPosition, editor: Editor) {
        if (!this.initialized) this.init();
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

    async doSearch(context: EditorSuggestContext): Promise<SuggestInfo[]> {
        let suggestions: SuggestInfo[] = [];
        const searchResults = await this.searcher.search(context.query);
        for (const result of searchResults)
            suggestions.push({
                ...result,
                context: context,
            });
        return suggestions;
    }

    async selectionToLink(editor: Editor, file: TFile) {
        if (!this.initialized) this.init();
        let resultString = '';
        const selectionLines = editor.getSelection().split('\n');
        for (const line of selectionLines) {
            const results = await this.searcher.search(line);
            if (results && results.length > 0) {
                const firstResult = results[0];
                const location = firstResult.location;
                if (resultString.length > 0) resultString += '\n\n';
                resultString += `[${line.trim()}](geo:${location.lat},${location.lng})`;
            }
        }
        if (resultString) {
            editor.replaceSelection(resultString);
            if (
                await utils.verifyOrAddFrontMatterForInline(
                    this.app,
                    editor,
                    file,
                    this.settings,
                )
            )
                new Notice(
                    "The note's front matter was updated to denote locations are present",
                );
        } else {
            new Notice(`No location found for the term '${selectionLines}'`);
        }
    }
}
