import { Editor, App, SuggestModal, TFile, type Instruction } from 'obsidian';
import * as leaflet from 'leaflet';

import MapViewPlugin from 'src/main';
import { type PluginSettings } from 'src/settings';
import { GeoSearcher, GeoSearchResult, searchDelayMs } from 'src/geosearch';
import {
    getIconFromOptions,
    createIconElement,
    type IconOptions,
} from 'src/markerIcons';
import * as utils from 'src/utils';
import * as consts from 'src/consts';
import { debounce } from 'ts-debounce';

export class SuggestInfo extends GeoSearchResult {
    icon?: IconOptions;
}

type DialogAction = 'newNote' | 'addToNote' | 'custom';

export class LocationSearchDialog extends SuggestModal<SuggestInfo> {
    private plugin: MapViewPlugin;
    private settings: PluginSettings;
    private searcher: GeoSearcher;
    private lastSearch = '';
    private lastSearchResults: SuggestInfo[] = [];
    private includeResults: SuggestInfo[] = [];
    private hasIcons: boolean = false;

    private dialogAction: DialogAction;
    private editor: Editor = null;
    private file: TFile = null;
    private debouncedSearch: (query: string) => void;

    // If dialogAction is 'custom', this will launch upon selection
    public customOnSelect: (
        selection: SuggestInfo,
        evt: MouseEvent | KeyboardEvent,
    ) => void;
    // If specified, this rectangle is used as a parameter for the various geocoding providers, so they can
    // prioritize results that are closer to the current view
    public searchArea: leaflet.LatLngBounds | null = null;

    constructor(
        app: App,
        plugin: MapViewPlugin,
        settings: PluginSettings,
        dialogAction: DialogAction,
        title: string,
        editor: Editor = null,
        file: TFile = null,
        includeResults: SuggestInfo[] = null,
        hasIcons: boolean = false,
        moreInstructions: Instruction[] = null,
    ) {
        super(app);
        this.plugin = plugin;
        this.settings = settings;
        this.searcher = new GeoSearcher(app, settings);
        this.dialogAction = dialogAction;
        this.editor = editor;
        this.file = file;
        this.includeResults = includeResults;
        this.hasIcons = hasIcons;
        this.debouncedSearch = debounce((query: string) => {
            this.doSearch(query);
        }, searchDelayMs(this.settings));

        this.setPlaceholder(
            title + ': type a place name or paste a string to parse',
        );
        let instructions = [{ command: 'enter', purpose: 'to use' }];
        if (moreInstructions)
            instructions = instructions.concat(moreInstructions);
        this.setInstructions(instructions);
        this.inputEl.addEventListener('keypress', (ev: KeyboardEvent) => {
            // In the case of a custom select function, trigger it also for Shift+Enter.
            // Obsidian doesn't have an API for that, so we find the selected item in a rather patchy way,
            // and manually close the dialog
            if (
                ev.key == 'Enter' &&
                ev.shiftKey &&
                this.customOnSelect != null
            ) {
                const chooser = (this as any).chooser;
                const selectedItem = chooser?.selectedItem;
                const values = chooser?.values;
                if (chooser && values) {
                    this.onChooseSuggestion(values[selectedItem], ev);
                    this.close();
                }
            }
        });
    }

    getSuggestions(query: string) {
        let result: SuggestInfo[] = [];
        // Get results from the "to include" list, e.g. existing markers
        let resultsToInclude: SuggestInfo[] = [];
        if (this.includeResults)
            for (const toInclude of this.includeResults) {
                if (
                    query.length == 0 ||
                    toInclude.name.toLowerCase().includes(query.toLowerCase())
                )
                    resultsToInclude.push(toInclude);
                if (resultsToInclude.length >= consts.MAX_MARKER_SUGGESTIONS)
                    break;
            }
        result = result.concat(resultsToInclude);

        // From this point onward, results are added asynchronously.
        // We make sure to add them *after* the synchronuous results, otherwise
        // it will be very annoying for a user who may have already selected something.
        if (query == this.lastSearch) {
            result = result.concat(this.lastSearchResults);
        }
        if (query.length > 3 && query != this.lastSearch)
            this.debouncedSearch(query);
        return result;
    }

    renderSuggestion(value: SuggestInfo, el: HTMLElement) {
        el.addClass('map-search-suggestion');
        if (this.hasIcons) {
            let iconDiv = el.createDiv('search-icon-div');
            const compiledIcon = getIconFromOptions(
                value.icon ?? consts.SEARCH_RESULT_MARKER,
                [],
                this.plugin.iconFactory,
            );
            let iconElement: HTMLElement = createIconElement(
                iconDiv,
                compiledIcon,
            );
            let style = iconElement.style;
            style.marginLeft = style.marginTop = '0';
            style.position = 'relative';
            iconDiv.append(iconElement);
            let textDiv = el.createDiv('search-text-div');
            textDiv.appendText(value.name);
        } else el.appendText(value.name);
    }

    onChooseSuggestion(value: SuggestInfo, evt: MouseEvent | KeyboardEvent) {
        if (this.dialogAction == 'newNote')
            this.plugin.newFrontMatterNote(
                value.location,
                evt,
                utils.sanitizePlaceNameForNoteName(value.name),
                value.extraLocationData,
            );
        else if (this.dialogAction == 'addToNote')
            this.addToNote(value.location, evt, value.name);
        else if (this.dialogAction == 'custom' && this.customOnSelect != null)
            this.customOnSelect(value, evt);
    }

    async addToNote(
        location: leaflet.LatLng,
        ev: MouseEvent | KeyboardEvent,
        query: string,
    ) {
        const locationString = `${location.lat},${location.lng}`;
        utils.verifyOrAddFrontMatter(
            this.app,
            this.file,
            this.settings.frontMatterKey,
            locationString,
            false,
        );
    }

    // Do not call directly! We use the debounced version of this method (see usage)
    async doSearch(query: string) {
        this.lastSearch = query;
        this.lastSearchResults = await this.searcher.search(
            query,
            this.searchArea,
        );
        (this as any).updateSuggestions();
    }
}
