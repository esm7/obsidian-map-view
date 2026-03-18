import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from 'obsidian';
import { QuerySuggest } from 'src/querySuggest';

// Mock src/main to avoid pulling in Svelte components and their transitive imports
vi.mock('src/main', () => ({
    default: class MockMapViewPlugin {},
}));

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeInput(value: string, selectionStart: number): HTMLInputElement {
    const el = document.createElement('input');
    el.value = value;
    // jsdom allows setting selectionStart on text inputs
    el.selectionStart = selectionStart;
    el.selectionEnd = selectionStart;
    return el;
}

function makeSuggest(
    inputEl: HTMLInputElement,
    tags: string[] = [],
    filePaths: string[] = [],
): QuerySuggest {
    const app = new App();
    app.vault = {
        getMarkdownFiles: vi
            .fn()
            .mockReturnValue(filePaths.map((p) => ({ path: p }))),
    } as any;
    app.workspace = {
        containerEl: document.createElement('div'),
    } as any;
    const plugin = { allTags: new Set(tags) } as any;
    return new QuerySuggest(app, plugin, inputEl);
}

// ─── compareSuggestions ───────────────────────────────────────────────────────

describe('QuerySuggest.compareSuggestions', () => {
    const suggest = makeSuggest(makeInput('', 0));

    it('returns true when both are null/undefined', () => {
        expect(suggest.compareSuggestions(null, null)).toBe(true);
    });

    it('returns false when first is null, second is not', () => {
        expect(suggest.compareSuggestions(null, [])).toBe(false);
    });

    it('returns false when second is null, first is not', () => {
        expect(suggest.compareSuggestions([], null)).toBe(false);
    });

    it('returns true for two empty arrays', () => {
        expect(suggest.compareSuggestions([], [])).toBe(true);
    });

    it('returns false for different lengths', () => {
        expect(
            suggest.compareSuggestions(
                [{ text: 'a' }],
                [{ text: 'a' }, { text: 'b' }],
            ),
        ).toBe(false);
    });

    it('returns true for identical suggestions', () => {
        const s = [
            {
                text: 'tag:',
                textToInsert: 'tag:#',
                insertAt: 0,
                insertSkip: 4,
                append: ' ',
            },
        ];
        expect(suggest.compareSuggestions(s, [...s])).toBe(true);
    });

    it('returns false when text differs', () => {
        expect(
            suggest.compareSuggestions([{ text: 'a' }], [{ text: 'b' }]),
        ).toBe(false);
    });

    it('returns false when textToInsert differs', () => {
        expect(
            suggest.compareSuggestions(
                [{ text: 'a', textToInsert: 'x' }],
                [{ text: 'a', textToInsert: 'y' }],
            ),
        ).toBe(false);
    });

    it('returns false when append differs', () => {
        expect(
            suggest.compareSuggestions(
                [{ text: 'a', append: ' ' }],
                [{ text: 'a', append: '' }],
            ),
        ).toBe(false);
    });

    it('returns false when insertAt differs', () => {
        expect(
            suggest.compareSuggestions(
                [{ text: 'a', insertAt: 0 }],
                [{ text: 'a', insertAt: 1 }],
            ),
        ).toBe(false);
    });

    it('returns false when insertSkip differs', () => {
        expect(
            suggest.compareSuggestions(
                [{ text: 'a', insertSkip: 0 }],
                [{ text: 'a', insertSkip: 3 }],
            ),
        ).toBe(false);
    });
});

// ─── createSuggestions — default (no match) ───────────────────────────────────

describe('QuerySuggest.createSuggestions – default operators', () => {
    it('returns operator list when input is empty', () => {
        const el = makeInput('', 0);
        const s = makeSuggest(el);
        const result = s.createSuggestions();
        const texts = result.map((r) => r.text);
        expect(texts).toContain('SEARCH OPERATORS');
        expect(texts).toContain('tag:');
        expect(texts).toContain('path:');
        expect(texts).toContain('linkedto:');
        expect(texts).toContain('linkedfrom:');
        expect(texts).toContain('AND');
        expect(texts).toContain('OR');
        expect(texts).toContain('NOT');
    });

    it('first item is the SEARCH OPERATORS group header', () => {
        const el = makeInput('', 0);
        const s = makeSuggest(el);
        const result = s.createSuggestions();
        expect(result[0]).toMatchObject({
            text: 'SEARCH OPERATORS',
            group: true,
        });
    });

    it('LOGICAL OPERATORS group header is present', () => {
        const el = makeInput('', 0);
        const s = makeSuggest(el);
        const result = s.createSuggestions();
        expect(
            result.some((r) => r.text === 'LOGICAL OPERATORS' && r.group),
        ).toBe(true);
    });

    it('path: suggestion has cursorOffset for inner cursor placement', () => {
        const el = makeInput('', 0);
        const s = makeSuggest(el);
        const result = s.createSuggestions();
        const pathSuggestion = result.find((r) => r.text === 'path:');
        expect(pathSuggestion?.cursorOffset).toBe(-1);
        expect(pathSuggestion?.textToInsert).toBe('path:""');
    });
});

// ─── createSuggestions — tag match ────────────────────────────────────────────

describe('QuerySuggest.createSuggestions – tag matching', () => {
    it('returns TAGS group when cursor is on a tag: expression', () => {
        const el = makeInput('tag:#tr', 7);
        const s = makeSuggest(el, ['#trip', '#travel', '#food']);
        const result = s.createSuggestions();
        expect(result[0]).toMatchObject({ text: 'TAGS', group: true });
    });

    it('filters tags by the partial query', () => {
        const el = makeInput('tag:#tr', 7);
        const s = makeSuggest(el, ['#trip', '#travel', '#food']);
        const result = s.createSuggestions();
        const texts = result.filter((r) => !r.group).map((r) => r.text);
        expect(texts).toContain('#trip');
        expect(texts).toContain('#travel');
        expect(texts).not.toContain('#food');
    });

    it('tag suggestion textToInsert uses tag: prefix', () => {
        const el = makeInput('tag:#trip', 9);
        const s = makeSuggest(el, ['#trip']);
        const result = s.createSuggestions();
        const tagSuggestion = result.find((r) => r.text === '#trip');
        expect(tagSuggestion?.textToInsert).toBe('tag:#trip ');
    });

    it('empty tag: returns all tags', () => {
        const el = makeInput('tag:', 4);
        const s = makeSuggest(el, ['#foo', '#bar']);
        const result = s.createSuggestions();
        const texts = result.filter((r) => !r.group).map((r) => r.text);
        expect(texts).toContain('#foo');
        expect(texts).toContain('#bar');
    });

    it('tag matching is case-insensitive', () => {
        const el = makeInput('tag:#TR', 7);
        const s = makeSuggest(el, ['#trip', '#travel']);
        const result = s.createSuggestions();
        const texts = result.filter((r) => !r.group).map((r) => r.text);
        expect(texts).toContain('#trip');
        expect(texts).toContain('#travel');
    });

    it('tag: without # still matches tags', () => {
        const el = makeInput('tag:tr', 6);
        const s = makeSuggest(el, ['#trip', '#travel', '#food']);
        const result = s.createSuggestions();
        const texts = result.filter((r) => !r.group).map((r) => r.text);
        expect(texts).toContain('#trip');
        expect(texts).toContain('#travel');
        expect(texts).not.toContain('#food');
    });
});

// ─── createSuggestions — path match ───────────────────────────────────────────

describe('QuerySuggest.createSuggestions – path matching', () => {
    it('returns PATHS group when cursor is on a path: expression', () => {
        const el = makeInput('path:notes', 10);
        const s = makeSuggest(el, [], ['notes/trip.md', 'other/food.md']);
        const result = s.createSuggestions();
        expect(result[0]).toMatchObject({ text: 'PATHS', group: true });
    });

    it('filters files by partial path query', () => {
        const el = makeInput('path:notes', 10);
        const s = makeSuggest(el, [], ['notes/trip.md', 'other/food.md']);
        const result = s.createSuggestions();
        const texts = result.filter((r) => !r.group).map((r) => r.text);
        expect(texts).toContain('notes/trip.md');
        expect(texts).not.toContain('other/food.md');
    });

    it('path suggestion textToInsert wraps the path in quotes', () => {
        const el = makeInput('path:trip', 9);
        const s = makeSuggest(el, [], ['notes/trip.md']);
        const result = s.createSuggestions();
        const pathSuggestion = result.find((r) => r.text === 'notes/trip.md');
        expect(pathSuggestion?.textToInsert).toBe('path:"notes/trip.md" ');
    });
});

// ─── createSuggestions — linkedto/linkedfrom match ───────────────────────────

describe('QuerySuggest.createSuggestions – linkedto/linkedfrom matching', () => {
    it('returns PATHS group when cursor is on a linkedto: expression', () => {
        const el = makeInput('linkedto:plan', 13);
        const s = makeSuggest(el, [], ['Trip Plan.md', 'Other.md']);
        const result = s.createSuggestions();
        expect(result[0]).toMatchObject({ text: 'PATHS', group: true });
    });

    it('linkedto suggestion uses linkedto: operator in textToInsert', () => {
        const el = makeInput('linkedto:plan', 13);
        const s = makeSuggest(el, [], ['Trip Plan.md']);
        const result = s.createSuggestions();
        const sugg = result.find((r) => r.text === 'Trip Plan.md');
        expect(sugg?.textToInsert).toBe('linkedto:"Trip Plan.md" ');
    });

    it('returns PATHS group when cursor is on a linkedfrom: expression', () => {
        const el = makeInput('linkedfrom:plan', 15);
        const s = makeSuggest(el, [], ['Trip Plan.md']);
        const result = s.createSuggestions();
        expect(result[0]).toMatchObject({ text: 'PATHS', group: true });
    });

    it('linkedfrom suggestion uses linkedfrom: operator in textToInsert', () => {
        const el = makeInput('linkedfrom:plan', 15);
        const s = makeSuggest(el, [], ['Trip Plan.md']);
        const result = s.createSuggestions();
        const sugg = result.find((r) => r.text === 'Trip Plan.md');
        expect(sugg?.textToInsert).toBe('linkedfrom:"Trip Plan.md" ');
    });
});

// ─── getAllPathNames ───────────────────────────────────────────────────────────

describe('QuerySuggest.getAllPathNames', () => {
    it('returns all paths when search is empty', () => {
        const el = makeInput('', 0);
        const s = makeSuggest(el, [], ['notes/a.md', 'notes/b.md', 'other.md']);
        expect(s.getAllPathNames('')).toEqual([
            'notes/a.md',
            'notes/b.md',
            'other.md',
        ]);
    });

    it('returns all paths when search is null/undefined', () => {
        const el = makeInput('', 0);
        const s = makeSuggest(el, [], ['notes/a.md', 'other.md']);
        expect(s.getAllPathNames(null as any)).toEqual([
            'notes/a.md',
            'other.md',
        ]);
    });

    it('filters paths case-insensitively', () => {
        const el = makeInput('', 0);
        const s = makeSuggest(
            el,
            [],
            ['notes/trip.md', 'notes/FOOD.md', 'archive.md'],
        );
        expect(s.getAllPathNames('TRIP')).toEqual(['notes/trip.md']);
    });

    it('returns empty array when no files match', () => {
        const el = makeInput('', 0);
        const s = makeSuggest(el, [], ['notes/a.md']);
        expect(s.getAllPathNames('xyz')).toEqual([]);
    });

    it('handles paths with special characters', () => {
        const el = makeInput('', 0);
        const s = makeSuggest(el, [], ['Trip (2024)/note.md', 'other.md']);
        expect(s.getAllPathNames('2024')).toEqual(['Trip (2024)/note.md']);
    });

    it('path with double quotes gets escaped in createPathSuggestions', () => {
        const el = makeInput('path:file', 9);
        const s = makeSuggest(el, [], ['file "A".md']);
        const result = s.createSuggestions();
        const sugg = result.find((r) => r.text === 'file "A".md');
        expect(sugg?.textToInsert).toBe('path:"file \\"A\\".md" ');
    });
});

// ─── selectSuggestion ─────────────────────────────────────────────────────────

describe('QuerySuggest.selectSuggestion', () => {
    const fakeEvent = { preventDefault: vi.fn() } as unknown as MouseEvent;

    function makeSuggestForSelection(
        value: string,
        selectionStart: number,
    ): QuerySuggest {
        const el = makeInput(value, selectionStart);
        const s = makeSuggest(el);
        // Stub doSuggestIfNeeded so selectSuggestion doesn't need suggestionsDiv
        vi.spyOn(s as any, 'doSuggestIfNeeded').mockImplementation(() => {});
        return s;
    }

    beforeEach(() => {
        vi.mocked(fakeEvent.preventDefault).mockClear?.();
    });

    it('appends text at cursor when no insertAt specified', () => {
        const s = makeSuggestForSelection('tag:', 4);
        s.selectSuggestion(
            { text: '#foo', textToInsert: 'tag:#foo ' },
            fakeEvent,
        );
        expect(s.sourceElement.value).toBe('tag:tag:#foo ');
    });

    it('replaces text when insertAt and insertSkip are provided', () => {
        const s = makeSuggestForSelection('tag:#tr', 7);
        s.selectSuggestion(
            {
                text: '#trip',
                textToInsert: 'tag:#trip ',
                insertAt: 0,
                insertSkip: 7,
            },
            fakeEvent,
        );
        expect(s.sourceElement.value).toBe('tag:#trip ');
    });

    it('appends the append string to textToInsert', () => {
        const s = makeSuggestForSelection('', 0);
        s.selectSuggestion({ text: 'AND', append: ' ' }, fakeEvent);
        expect(s.sourceElement.value).toBe('AND ');
    });

    it('places cursor at end of inserted text by default', () => {
        const s = makeSuggestForSelection('', 0);
        s.selectSuggestion({ text: 'AND', append: ' ' }, fakeEvent);
        expect(s.sourceElement.selectionStart).toBe(4);
    });

    it('applies cursorOffset to final cursor position', () => {
        const s = makeSuggestForSelection('', 0);
        s.selectSuggestion(
            { text: 'path:', textToInsert: 'path:""', cursorOffset: -1 },
            fakeEvent,
        );
        // Inserted 'path:""' (7 chars), cursor should be at 6 (inside the quotes)
        expect(s.sourceElement.selectionStart).toBe(6);
        expect(s.sourceElement.value).toBe('path:""');
    });

    it('does nothing for group suggestions', () => {
        const s = makeSuggestForSelection('abc', 3);
        s.selectSuggestion({ text: 'OPERATORS', group: true }, fakeEvent);
        expect(s.sourceElement.value).toBe('abc');
    });

    it('calls event.preventDefault()', () => {
        const s = makeSuggestForSelection('', 0);
        const ev = { preventDefault: vi.fn() } as unknown as MouseEvent;
        s.selectSuggestion({ text: 'OR', append: ' ' }, ev);
        expect(ev.preventDefault).toHaveBeenCalled();
    });

    it('inserts into middle of existing text with insertAt/insertSkip', () => {
        const s = makeSuggestForSelection('tag:#old AND path:x', 8);
        s.selectSuggestion(
            {
                text: '#new',
                textToInsert: 'tag:#new ',
                insertAt: 0,
                insertSkip: 8,
            },
            fakeEvent,
        );
        expect(s.sourceElement.value).toBe('tag:#new  AND path:x');
    });
});
