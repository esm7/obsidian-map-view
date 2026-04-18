import { App, TFile, TextComponent, PopoverSuggest, Scope } from 'obsidian';

import * as consts from 'src/consts';
import {
    matchByPosition,
    getTagUnderCursor,
    escapeDoubleQuotes,
} from 'src/utils';
import * as regex from 'src/regex';
import MapViewPlugin from 'src/main';

type Suggestion = {
    // What to show in the menu, and what to insert if textToInsert doesn't exist
    text: string;
    // Will insert this instead of `text` if exists
    textToInsert?: string;
    // Is this a group in the menu? (can't be selected)
    group?: boolean;
    // The menu element
    element?: HTMLDivElement;
    // Text to append after inserting textToInsert
    append?: string;
    // On which index to insert textToInsert
    insertAt?: number;
    // After 'insertAt' (or the caret), number of characters from the current input text to skip (replace)
    insertSkip?: number;
    // By default the cursor will move to the end of the inserted text.
    // This offsets this location
    cursorOffset?: number;
};

export class QuerySuggest extends PopoverSuggest<Suggestion> {
    suggestionsDiv: HTMLDivElement;
    plugin: MapViewPlugin;
    sourceElement: HTMLInputElement;
    selection: Suggestion = null;
    lastSuggestions: Suggestion[];
    // Event handers that were registered, in the format of [name, lambda]
    eventHandlers: [string, any][] = [];

    constructor(
        app: App,
        plugin: MapViewPlugin,
        sourceElement: HTMLInputElement,
        scope?: Scope,
    ) {
        super(app, scope);
        this.plugin = plugin;
        this.sourceElement = sourceElement;
    }

    open() {
        this.suggestionsDiv = this.app.workspace.containerEl.createDiv({
            cls: 'suggestion-container mod-search-suggestion',
        });
        this.suggestionsDiv.style.position = 'fixed';
        this.suggestionsDiv.style.top =
            this.sourceElement.getClientRects()[0].bottom + 'px';
        this.suggestionsDiv.style.left =
            this.sourceElement.getClientRects()[0].left + 'px';
        const keyUp = () => {
            // We do this in keyup because we want the selection to update first
            this.doSuggestIfNeeded();
        };
        const mouseUp = () => {
            // We do this in keyup because we want the selection to update first
            this.doSuggestIfNeeded();
        };
        const keyDown = (ev: KeyboardEvent) => {
            if (ev.key == 'Enter' && this.selection) {
                this.selectSuggestion(this.selection, ev);
                this.doSuggestIfNeeded();
            } else if (ev.key == 'ArrowDown' || ev.key == 'ArrowUp') {
                if (this.lastSuggestions.length == 0) return;
                let index = this.lastSuggestions.findIndex(
                    (value) => value == this.selection,
                );
                const direction = ev.key == 'ArrowDown' ? 1 : -1;
                do {
                    index += direction;
                    if (index >= this.lastSuggestions.length) index = 0;
                    if (index < 0) index = this.lastSuggestions.length - 1;
                } while (this.lastSuggestions[index].group);
                this.updateSelection(this.lastSuggestions[index]);
                ev.preventDefault();
            }
        };
        this.eventHandlers.push(
            ['keyup', keyUp],
            ['mouseup', mouseUp],
            ['keydown', keyDown],
        );
        this.sourceElement.addEventListener('keyup', keyUp);
        this.sourceElement.addEventListener('mouseup', mouseUp);
        this.sourceElement.addEventListener('keydown', keyDown);
        this.doSuggestIfNeeded();
    }

    doSuggestIfNeeded() {
        const suggestions = this.createSuggestions();
        if (!suggestions) return;
        suggestions.splice(consts.MAX_QUERY_SUGGESTIONS);
        if (!this.compareSuggestions(suggestions, this.lastSuggestions)) {
            this.clear();
            this.lastSuggestions = suggestions;
            this.renderSuggestions(suggestions, this.suggestionsDiv);
        }
    }

    compareSuggestions(suggestions1: Suggestion[], suggestions2: Suggestion[]) {
        if (!suggestions1 && !suggestions2) return true;
        if (!suggestions1 || !suggestions2) return false;
        if (suggestions1.length != suggestions2.length) return false;
        for (const [i, s1] of suggestions1.entries()) {
            const s2 = suggestions2[i];
            if (
                s1.text != s2.text ||
                s1.textToInsert != s2.textToInsert ||
                s1.append != s2.append ||
                s1.insertAt != s2.insertAt ||
                s1.insertSkip != s2.insertSkip
            )
                return false;
        }
        return true;
    }

    clear() {
        while (this.suggestionsDiv.firstChild)
            this.suggestionsDiv.removeChild(this.suggestionsDiv.firstChild);
        this.selection = null;
        this.lastSuggestions = [];
    }

    createSuggestions(): Suggestion[] {
        const cursorPos = this.sourceElement.selectionStart;
        const input = this.sourceElement.value;
        const tagMatch = getTagUnderCursor(input, cursorPos);
        // Doesn't include a closing parenthesis
        const pathMatch = matchByPosition(
            input,
            regex.QUOTED_OR_NOT_QUOTED_PATH,
            cursorPos,
        );
        const linkedToMatch = matchByPosition(
            input,
            regex.QUOTED_OR_NOT_QUOTED_LINKEDTO,
            cursorPos,
        );
        const linkedFromMatch = matchByPosition(
            input,
            regex.QUOTED_OR_NOT_QUOTED_LINKEDFROM,
            cursorPos,
        );
        if (tagMatch) {
            const tagQuery = tagMatch[1] ?? '';
            // Return a tag name with the pound (#) sign removed if any
            const noPound = (tagName: string) => {
                return tagName.startsWith('#') ? tagName.substring(1) : tagName;
            };
            // Find all tags that include the query, with the pound sign removed, case insensitive
            const allTagNames = Array.from(this.plugin.allTags).filter(
                (value) =>
                    value
                        .toLowerCase()
                        .includes(noPound(tagQuery).toLowerCase()),
            );
            let toReturn: Suggestion[] = [{ text: 'TAGS', group: true }];
            for (const tagName of allTagNames) {
                toReturn.push({
                    text: tagName,
                    textToInsert: `tag:${tagName} `,
                    insertAt: tagMatch.index,
                    insertSkip: tagMatch[0].length,
                });
            }
            return toReturn;
        } else if (pathMatch)
            return this.createPathSuggestions(pathMatch, 'path');
        else if (linkedToMatch)
            return this.createPathSuggestions(linkedToMatch, 'linkedto');
        else if (linkedFromMatch)
            return this.createPathSuggestions(linkedFromMatch, 'linkedfrom');
        else {
            return [
                { text: 'SEARCH OPERATORS', group: true },
                { text: 'tag:', append: '#' },
                { text: 'name:', textToInsert: 'name:""', cursorOffset: -1 },
                { text: 'path:', textToInsert: 'path:""', cursorOffset: -1 },
                {
                    text: 'linkedto:',
                    textToInsert: 'linkedto:""',
                    cursorOffset: -1,
                },
                {
                    text: 'linkedfrom:',
                    textToInsert: 'linkedfrom:""',
                    cursorOffset: -1,
                },
                {
                    text: 'distancefrom:lat,lng<radius (e.g. distancefrom:32.08,34.78<5km)',
                    textToInsert: 'distancefrom:',
                },
                {
                    text: '["property":"value"]',
                    textToInsert: '[:]',
                    cursorOffset: -2,
                },
                { text: 'LOGICAL OPERATORS', group: true },
                { text: 'AND', append: ' ' },
                { text: 'OR', append: ' ' },
                { text: 'NOT', append: ' ' },
            ];
        }
    }

    createPathSuggestions(
        pathMatch: RegExpMatchArray,
        operator: string,
    ): Suggestion[] {
        const pathQuery = pathMatch[3] ?? pathMatch[4];
        const allPathNames = this.getAllPathNames(pathQuery);
        let toReturn: Suggestion[] = [{ text: 'PATHS', group: true }];
        for (const pathName of allPathNames) {
            const escapedPathName = escapeDoubleQuotes(pathName);
            toReturn.push({
                text: pathName,
                textToInsert: `${operator}:"${escapedPathName}" `,
                insertAt: pathMatch.index,
                insertSkip: pathMatch[0].length,
            });
        }
        return toReturn;
    }

    renderSuggestions(suggestions: Suggestion[], el: HTMLElement) {
        for (const suggestion of suggestions) {
            const element = el.createDiv({
                cls: 'suggestion-item search-suggest-item',
            });
            if (suggestion.group) element.addClass('mod-group');
            suggestion.element = element;
            if (this.selection == suggestion) {
                element.addClass('is-selected');
                this.selection = suggestion;
            }
            element.addEventListener('mousedown', (event) => {
                this.selectSuggestion(suggestion, event);
            });
            element.addEventListener('mouseover', () => {
                this.updateSelection(suggestion);
            });
            this.renderSuggestion(suggestion, element);
        }
    }

    close() {
        this.suggestionsDiv.remove();
        this.clear();
        for (const [eventName, handler] of this.eventHandlers)
            this.sourceElement.removeEventListener(eventName, handler);
    }

    updateSelection(newSelection: Suggestion) {
        if (this.selection && this.selection.element) {
            this.selection.element.removeClass('is-selected');
        }
        if (!newSelection.group) {
            newSelection.element?.addClass('is-selected');
            this.selection = newSelection;
        }
    }

    renderSuggestion(value: Suggestion, el: HTMLElement) {
        el.setText(value.text);
    }

    selectSuggestion(
        suggestion: Suggestion,
        event: MouseEvent | KeyboardEvent,
    ) {
        // We don't use it, but need it here to inherit from QuerySuggest
        if (!suggestion.group) {
            const insertAt =
                suggestion.insertAt != null
                    ? suggestion.insertAt
                    : this.sourceElement.selectionStart;
            const insertSkip = suggestion.insertSkip ?? 0;
            let addedText = suggestion.textToInsert ?? suggestion.text;
            addedText += suggestion.append ?? '';
            const currentText = this.sourceElement.value;
            const newText =
                currentText.substring(0, insertAt) +
                addedText +
                currentText.substring(insertAt + insertSkip);
            this.sourceElement.value = newText;
            this.sourceElement.selectionEnd =
                this.sourceElement.selectionStart =
                    insertAt +
                    addedText.length +
                    (suggestion?.cursorOffset ?? 0);
            // Don't allow a click to steal the focus from the text box
            event.preventDefault();
            // Dispatch an input event to trigger Svelte's change detection
            this.sourceElement.dispatchEvent(
                new Event('input', { bubbles: true }),
            );
            // This causes the text area to scroll to the new cursor position
            this.sourceElement.blur();
            this.sourceElement.focus();
            // Refresh the suggestion box
            this.doSuggestIfNeeded();
        }
    }

    getAllPathNames(search: string): string[] {
        const allFiles = this.app.vault.getMarkdownFiles();
        let toReturn: string[] = [];
        for (const file of allFiles) {
            if (
                !search ||
                (search &&
                    file.path.toLowerCase().includes(search.toLowerCase()))
            )
                toReturn.push(file.path);
        }
        return toReturn;
    }
}
