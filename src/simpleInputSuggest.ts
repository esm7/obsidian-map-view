import { App, AbstractInputSuggest } from 'obsidian';

export class SimpleInputSuggest extends AbstractInputSuggest<string> {
    private options: string[];
    private action: (selection: string) => void;

    constructor(
        app: App,
        textInputEl: HTMLInputElement | HTMLDivElement,
        options: string[],
        action: (selection: string) => void,
    ) {
        super(app, textInputEl);
        this.options = options;
        this.action = action;
    }

    protected getSuggestions(query: string) {
        return this.options.filter((option) =>
            option.toLowerCase().contains(query.toLowerCase()),
        );
    }

    selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
        this.action(value);
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value);
    }
}
