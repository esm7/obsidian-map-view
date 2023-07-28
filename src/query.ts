import { App, TFile, TextComponent, PopoverSuggest, Scope } from 'obsidian';

import * as consts from 'src/consts';
import { matchByPosition } from 'src/utils';
import * as regex from 'src/regex';
import { BaseGeoLayer, FileMarker } from 'src/markers';
import * as utils from 'src/utils';
import { checkTagPatternMatch } from 'src/markerIcons';

import * as parser from 'boon-js';

export class QueryNode {
    public nodeType: 'leaf' | 'and' | 'or' | 'not';
    public leafOperator: 'tag' | 'path';
    public leafContent: string;
    public leftChild: QueryNode;
    public rightChild: QueryNode;
}

export class Query {
    private queryRpn: parser.PostfixExpression = null;
    private queryEmpty = false;
    private app: App;

    constructor(app: App, queryString: string) {
        this.app = app;
        if (queryString?.length > 0) {
            this.queryRpn = parser.parse(
                this.preprocessQueryString(queryString)
            );
        } else this.queryEmpty = true;
    }

    preprocessQueryString(queryString: string) {
        // 1. Replace tag:#abc by "tag:#abc" because this parser doesn't like the '#' symbol
        // 2. Replace path:"abc def/ghi" by "path:abc def/dhi" because the parser doesn't like quotes as part of the words
        // 3. Same goes for linkedto:"", linkedfrom:"" and name:""
        let newString = queryString
            .replace(regex.TAG_NAME_WITH_HEADER_AND_WILDCARD, '"tag:$1"')
            .replace(regex.PATH_QUERY_WITH_HEADER, '"path:$1"')
            .replace(regex.LINKEDTO_QUERY_WITH_HEADER, '"linkedto:$1"')
            .replace(regex.LINKEDFROM_QUERY_WITH_HEADER, '"linkedfrom:$1"')
            .replace(regex.NAME_QUERY_WITH_HEADER, '"name:$1"');
        return newString;
    }

    testMarker(marker: BaseGeoLayer): boolean {
        if (this.queryEmpty) return true;
        const toBool = (s: string) => {
            return s === 'true';
        };
        const toString = (b: boolean) => {
            return b ? 'true' : 'false';
        };
        let booleanStack: string[] = [];
        for (const token of this.queryRpn) {
            if (token.name === 'IDENTIFIER') {
                if (marker instanceof FileMarker) {
                    const result = this.testIdentifier(marker, token.value);
                    booleanStack.push(toString(result));
                }
            } else if (token.name === 'OPERATOR') {
                let result;
                if (token.value === 'NOT') {
                    let arg1 = toBool(booleanStack.pop());
                    booleanStack.push(toString(!arg1));
                } else if (token.value === 'OR') {
                    let arg1 = toBool(booleanStack.pop());
                    let arg2 = toBool(booleanStack.pop());
                    booleanStack.push(toString(arg1 || arg2));
                } else if (token.value === 'AND') {
                    let arg1 = toBool(booleanStack.pop());
                    let arg2 = toBool(booleanStack.pop());
                    booleanStack.push(toString(arg1 && arg2));
                } else {
                    throw Error('Unsuppoted operator' + token.value);
                }
            } else {
                throw Error('Unsupported token type:' + token);
            }
        }
        return toBool(booleanStack[0]);
    }

    testIdentifier(marker: FileMarker, value: string): boolean {
        if (value.startsWith('tag:#')) {
            const queryTag = value.replace('tag:', '');
            if (queryTag.length === 0) return false;
            if (checkTagPatternMatch(queryTag, marker.tags)) return true;
            return false;
        } else if (value.startsWith('name:')) {
            const query = value.replace('name:', '').toLowerCase();
            if (query.length === 0) return false;
            // For inline geolocations, completely ignore the file name and use only the link name
            if (marker.extraName)
                return marker.extraName.toLowerCase().includes(query);
            // For front matter geolocations, use the file name
            return marker.file.name.toLowerCase().includes(query);
        } else if (value.startsWith('path:')) {
            const queryPath = value.replace('path:', '').toLowerCase();
            if (queryPath.length === 0) return false;
            return marker.file.path.toLowerCase().includes(queryPath);
        } else if (value.startsWith('linkedto:')) {
            const query = value.replace('linkedto:', '').toLowerCase();
            const linkedToDest = this.app.metadataCache.getFirstLinkpathDest(
                query,
                ''
            );
            if (!linkedToDest) return false;
            const fileCache = this.app.metadataCache.getFileCache(marker.file);
            if (
                fileCache?.links?.some(
                    (linkCache) =>
                        this.app.metadataCache.getFirstLinkpathDest(
                            linkCache.link,
                            ''
                        ) == linkedToDest
                )
            )
                return true;
        } else if (value.startsWith('linkedfrom:')) {
            const query = value.replace('linkedfrom:', '').toLowerCase();
            const fileMatch = this.app.metadataCache.getFirstLinkpathDest(
                query,
                ''
            );
            if (fileMatch) {
                const linksFrom =
                    this.app.metadataCache.getFileCache(fileMatch);
                // Check if the given marker is linked from 'fileMatch'
                if (
                    linksFrom?.links?.some(
                        (linkCache) =>
                            linkCache.link.toLowerCase() ===
                                marker.file.basename.toLowerCase() ||
                            linkCache.displayText.toLowerCase() ===
                                marker.file.basename.toLowerCase()
                    )
                ) {
                    return true;
                }
                // Also include the 'linked from' file itself
                if (fileMatch.basename === marker.file.basename) return true;
            }
        } else if (value.startsWith('lines:')) {
            const linesQueryMatch = value.match(/(lines:)([0-9]+)-([0-9]+)/);
            if (linesQueryMatch && linesQueryMatch.length === 4) {
                const fromLine = parseInt(linesQueryMatch[2]);
                const toLine = parseInt(linesQueryMatch[3]);
                return (
                    marker.fileLine &&
                    marker.fileLine >= fromLine &&
                    marker.fileLine <= toLine
                );
            }
        } else throw new Error('Unsupported query format' + value);
    }
}

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
    app: App;
    sourceElement: TextComponent;
    selection: Suggestion = null;
    lastSuggestions: Suggestion[];
    // Event handers that were registered, in the format of [name, lambda]
    eventHandlers: [string, any][] = [];

    constructor(app: App, sourceElement: TextComponent, scope?: Scope) {
        super(app, scope);
        this.app = app;
        this.sourceElement = sourceElement;
    }

    open() {
        this.suggestionsDiv = this.app.workspace.containerEl.createDiv({
            cls: 'suggestion-container mod-search-suggestion',
        });
        this.suggestionsDiv.style.position = 'fixed';
        this.suggestionsDiv.style.top =
            this.sourceElement.inputEl.getClientRects()[0].bottom + 'px';
        this.suggestionsDiv.style.left =
            this.sourceElement.inputEl.getClientRects()[0].left + 'px';
        const keyUp = async () => {
            // We do this in keyup because we want the selection to update first
            this.doSuggestIfNeeded();
        };
        const mouseUp = async () => {
            // We do this in keyup because we want the selection to update first
            this.doSuggestIfNeeded();
        };
        const keyDown = async (ev: KeyboardEvent) => {
            if (ev.key == 'Enter' && this.selection) {
                this.selectSuggestion(this.selection, ev);
                this.doSuggestIfNeeded();
            } else if (ev.key == 'ArrowDown' || ev.key == 'ArrowUp') {
                if (this.lastSuggestions.length == 0) return;
                let index = this.lastSuggestions.findIndex(
                    (value) => value == this.selection
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
            ['keydown', keyDown]
        );
        this.sourceElement.inputEl.addEventListener('keyup', keyUp);
        this.sourceElement.inputEl.addEventListener('mouseup', mouseUp);
        this.sourceElement.inputEl.addEventListener('keydown', keyDown);
        this.doSuggestIfNeeded();
    }

    doSuggestIfNeeded() {
        const suggestions = this.createSuggestions();
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
        const cursorPos = this.sourceElement.inputEl.selectionStart;
        const input = this.sourceElement.getValue();
        const tagMatch = regex.getTagUnderCursor(input, cursorPos);
        // Doesn't include a closing parenthesis
        const pathMatch = matchByPosition(
            input,
            regex.QUOTED_OR_NOT_QUOTED_PATH,
            cursorPos
        );
        const linkedToMatch = matchByPosition(
            input,
            regex.QUOTED_OR_NOT_QUOTED_LINKEDTO,
            cursorPos
        );
        const linkedFromMatch = matchByPosition(
            input,
            regex.QUOTED_OR_NOT_QUOTED_LINKEDFROM,
            cursorPos
        );
        if (tagMatch) {
            const tagQuery = tagMatch[1] ?? '';
            // Return a tag name with the pound (#) sign removed if any
            const noPound = (tagName: string) => {
                return tagName.startsWith('#') ? tagName.substring(1) : tagName;
            };
            // Find all tags that include the query, with the pound sign removed, case insensitive
            const allTagNames = utils
                .getAllTagNames(this.app)
                .filter((value) =>
                    value
                        .toLowerCase()
                        .includes(noPound(tagQuery).toLowerCase())
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
                { text: 'LOGICAL OPERATORS', group: true },
                { text: 'AND', append: ' ' },
                { text: 'OR', append: ' ' },
                { text: 'NOT', append: ' ' },
            ];
        }
    }

    createPathSuggestions(
        pathMatch: RegExpMatchArray,
        operator: string
    ): Suggestion[] {
        const pathQuery = pathMatch[3] ?? pathMatch[4];
        const allPathNames = this.getAllPathNames(pathQuery);
        let toReturn: Suggestion[] = [{ text: 'PATHS', group: true }];
        for (const pathName of allPathNames) {
            toReturn.push({
                text: pathName,
                textToInsert: `${operator}:"${pathName}" `,
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
            this.sourceElement.inputEl.removeEventListener(eventName, handler);
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
        event: MouseEvent | KeyboardEvent
    ) {
        // We don't use it, but need it here to inherit from QuerySuggest
        if (!suggestion.group) {
            const insertAt =
                suggestion.insertAt != null
                    ? suggestion.insertAt
                    : this.sourceElement.inputEl.selectionStart;
            const insertSkip = suggestion.insertSkip ?? 0;
            let addedText = suggestion.textToInsert ?? suggestion.text;
            addedText += suggestion.append ?? '';
            const currentText = this.sourceElement.getValue();
            const newText =
                currentText.substring(0, insertAt) +
                addedText +
                currentText.substring(insertAt + insertSkip);
            this.sourceElement.setValue(newText);
            this.sourceElement.inputEl.selectionEnd =
                this.sourceElement.inputEl.selectionStart =
                    insertAt +
                    addedText.length +
                    (suggestion?.cursorOffset ?? 0);
            // Don't allow a click to steal the focus from the text box
            event.preventDefault();
            // This causes the text area to scroll to the new cursor position
            this.sourceElement.inputEl.blur();
            this.sourceElement.inputEl.focus();
            // Refresh the suggestion box
            this.doSuggestIfNeeded();
            // Make the UI react to the change
            this.sourceElement.onChanged();
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
