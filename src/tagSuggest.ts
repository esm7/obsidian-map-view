import {
    App,
    Editor,
    EditorSuggest,
    EditorPosition,
    TFile,
    EditorSuggestTriggerInfo,
    EditorSuggestContext,
} from 'obsidian';

import { PluginSettings } from 'src/settings';
import { getTagUnderCursor } from 'src/regex';
import { matchInlineLocation } from 'src/markers';
import * as utils from 'src/utils';

class SuggestInfo {
    tagName: string;
    context: EditorSuggestContext;
}

export class TagSuggest extends EditorSuggest<SuggestInfo> {
    private app: App;

    constructor(app: App, settings: PluginSettings) {
        super(app);
        this.app = app;
    }

    onTrigger(
        cursor: EditorPosition,
        editor: Editor,
        file: TFile
    ): EditorSuggestTriggerInfo | null {
        const line = editor.getLine(cursor.line);
        // Start by verifying that the current line has an inline location.
        // If it doesn't, we don't wanna trigger the completion even if the user
        // starts typing 'tag:'
        const hasLocationMatch = matchInlineLocation(line);
        if (!hasLocationMatch || hasLocationMatch.length == 0) return null;
        const tagMatch = getTagUnderCursor(line, cursor.ch);
        if (tagMatch)
            return {
                start: { line: cursor.line, ch: tagMatch.index },
                end: {
                    line: cursor.line,
                    ch: tagMatch.index + tagMatch[0].length,
                },
                query: tagMatch[1],
            };
        return null;
    }

    getSuggestions(context: EditorSuggestContext): SuggestInfo[] {
        const noPound = (tagName: string) => {
            return tagName.startsWith('#') ? tagName.substring(1) : tagName;
        };
        const tagQuery = context.query ?? '';
        // Find all tags that include the query
        const matchingTags = utils
            .getAllTagNames(this.app)
            .map((value) => noPound(value))
            .filter((value) =>
                value.toLowerCase().includes(tagQuery.toLowerCase())
            );
        return matchingTags.map((tagName) => {
            return {
                tagName: tagName,
                context: context,
            };
        });
    }

    renderSuggestion(value: SuggestInfo, el: HTMLElement) {
        el.setText(value.tagName);
    }

    selectSuggestion(value: SuggestInfo, evt: MouseEvent | KeyboardEvent) {
        const currentCursor = value.context.editor.getCursor();
        const linkResult = `tag:${value.tagName} `;
        value.context.editor.replaceRange(
            linkResult,
            value.context.start,
            value.context.end
        );
    }
}
