// Minimal stub of the Obsidian API for testing purposes

export class App {
    metadataCache: any = {};
    vault: any = {};
    workspace: any = {};
    fileManager: any = {};
}

export class TFile {
    path: string;
    name: string;
    basename: string;
    extension: string;
    stat: any;
    parent: any;

    constructor(path: string = 'test.md') {
        this.path = path;
        this.name = path.split('/').pop() ?? path;
        this.basename = this.name.replace(/\.[^.]+$/, '');
        this.extension = 'md';
    }
}

export class TAbstractFile {}

export class Component {
    load() {}
    unload() {}
    onload() {}
    onunload() {}
    addChild(_child: any) {}
    removeChild(_child: any) {}
    register(_cb: () => void) {}
    registerEvent(_event: any) {}
    registerDomEvent(..._args: any[]) {}
    registerInterval(_id: number) {}
}

export class Plugin extends Component {
    app: App;
    manifest: any;
    constructor(app: App, manifest: any) {
        super();
        this.app = app;
        this.manifest = manifest;
    }
    loadData(): Promise<any> {
        return Promise.resolve({});
    }
    saveData(_data: any): Promise<void> {
        return Promise.resolve();
    }
    addCommand(_cmd: any) {}
    addSettingTab(_tab: any) {}
    registerView(_type: string, _factory: any) {}
    registerMarkdownPostProcessor(_fn: any) {}
    registerMarkdownCodeBlockProcessor(_lang: string, _fn: any) {}
    registerEditorExtension(_ext: any) {}
    registerObsidianProtocolHandler(_action: string, _fn: any) {}
    registerDomEvent(_target: any, _type: string, _fn: any) {}
}

export class ItemView extends Component {
    app: App;
    leaf: any;
    containerEl: HTMLElement = document.createElement('div');
    constructor(leaf: any) {
        super();
        this.leaf = leaf;
        this.app = leaf?.app ?? new App();
    }
    getViewType(): string {
        return '';
    }
    getDisplayText(): string {
        return '';
    }
    getIcon(): string {
        return '';
    }
}

export class WorkspaceLeaf {
    app: App = new App();
    view: any;
    getViewState() {
        return {};
    }
}

export class MarkdownView {
    file: TFile | null = null;
    editor: any = null;
}

export class Editor {}

export class PopoverSuggest<T> {
    app: App;
    scope: any;
    constructor(app: App, scope?: any) {
        this.app = app;
        this.scope = scope;
    }
    open() {}
    close() {}
    renderSuggestion(_value: T, _el: HTMLElement) {}
    selectSuggestion(_value: T, _evt: MouseEvent | KeyboardEvent) {}
}

export class Scope {}

export class TextComponent {
    inputEl: HTMLInputElement = document.createElement('input');
    getValue() {
        return '';
    }
    setValue(_v: string) {
        return this;
    }
    onChange(_fn: (v: string) => void) {
        return this;
    }
    setPlaceholder(_p: string) {
        return this;
    }
}

export class Notice {
    constructor(_message: string, _timeout?: number) {}
}

export class Menu {
    addItem(_fn: (item: MenuItem) => void) {
        return this;
    }
    showAtMouseEvent(_ev: MouseEvent) {}
    showAtPosition(_pos: any) {}
}

export class MenuItem {
    setTitle(_t: string) {
        return this;
    }
    setIcon(_i: string) {
        return this;
    }
    onClick(_fn: (ev: any) => void) {
        return this;
    }
}

export class FileView extends ItemView {}

export class Modal {
    app: App;
    contentEl: HTMLElement = document.createElement('div');
    constructor(app: App) {
        this.app = app;
    }
    open() {}
    close() {}
    onOpen() {}
    onClose() {}
}

export class Setting {
    settingEl: HTMLElement = document.createElement('div');
    infoEl: HTMLElement = document.createElement('div');
    nameEl: HTMLElement = document.createElement('div');
    descEl: HTMLElement = document.createElement('div');
    controlEl: HTMLElement = document.createElement('div');
    constructor(_container: HTMLElement) {}
    setName(_name: string) {
        return this;
    }
    setDesc(_desc: string) {
        return this;
    }
    addText(_fn: (t: TextComponent) => void) {
        _fn(new TextComponent());
        return this;
    }
    addToggle(_fn: (t: any) => void) {
        _fn({ setValue: () => this, onChange: () => this });
        return this;
    }
    addButton(_fn: (b: any) => void) {
        _fn({ setButtonText: () => this, onClick: () => this });
        return this;
    }
    addDropdown(_fn: (d: any) => void) {
        _fn({
            addOption: () => this,
            setValue: () => this,
            onChange: () => this,
        });
        return this;
    }
}

export class PluginSettingTab {
    app: App;
    plugin: any;
    containerEl: HTMLElement = document.createElement('div');
    constructor(app: App, plugin: any) {
        this.app = app;
        this.plugin = plugin;
    }
    display() {}
    hide() {}
}

export const Platform = {
    isMobile: false,
    isDesktop: true,
    isMacOS: false,
    isIosApp: false,
    isAndroidApp: false,
};

export function getAllTags(_cache: any): string[] {
    return [];
}

export function getFrontMatterInfo(_content: string) {
    return { frontmatter: '', contentStart: 0, exists: false, from: 0, to: 0 };
}

export function parseLinktext(_linktext: string) {
    return { path: _linktext, subpath: '' };
}

export function resolveSubpath(_cache: any, _subpath: string) {
    return null;
}

export type SplitDirection = 'horizontal' | 'vertical';
export type EditorPosition = { line: number; ch: number };
export type CachedMetadata = {
    frontmatter?: Record<string, any>;
    tags?: any[];
    links?: any[];
    frontmatterLinks?: any[];
    headings?: any[];
    blocks?: Record<string, any>;
    embeds?: any[];
};
export type HeadingCache = {
    heading: string;
    level: number;
    position: {
        start: { offset: number; line: number };
        end: { offset: number; line: number };
    };
};
export type BlockCache = {
    id: string;
    position: { start: { offset: number }; end: { offset: number } };
};
export type FrontMatterCache = Record<string, any>;
export type FrontmatterLinkCache = {
    key: string;
    link: string;
    displayText?: string;
};
export type LinkCache = {
    link: string;
    original: string;
    displayText?: string;
    position: any;
};
export type ReferenceCache = {
    link: string;
    original: string;
    displayText?: string;
    position: any;
};
export type MarkdownFileInfo = {};
export type ObsidianProtocolData = Record<string, string>;
export type MarkdownPostProcessorContext = {
    docId: string;
    sourcePath: string;
    frontmatter: any;
    addChild(_child: any): void;
    getSectionInfo(_el: HTMLElement): any;
};
export type ViewState = {};
