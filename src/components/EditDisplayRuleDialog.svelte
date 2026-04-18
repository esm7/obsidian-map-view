<script lang="ts">
    import { App } from 'obsidian';
    import MapViewPlugin from '../main';
    import {
        type DisplayRule,
        type IconBadgeOptions,
        EMPTY_DISPLAY_RULE,
    } from '../settings';
    import { getIcon } from 'obsidian';
    import ViewCollapsibleSection from './ViewCollapsibleSection.svelte';

    let { close, displayRule, allRules, plugin, app, onSave, makePreview } =
        $props<{
            close: () => void;
            displayRule: DisplayRule;
            allRules: DisplayRule[];
            plugin: MapViewPlugin;
            app: App;
            onSave: (newRule: DisplayRule) => void;
            makePreview: (rule: DisplayRule) => void;
        }>();

    let ruleCopy: DisplayRule = $state(
        structuredClone(expandDisplayRule(displayRule)),
    );
    let allOk: boolean = $derived(sanityCheck(ruleCopy));
    let rulesCopyFormatted: string = $state('');
    let invalidJson: boolean = $state(false);

    $effect(() => {
        rulesCopyFormatted = JSON.stringify(ruleCopy, null, 2);
    });

    // Add default values to a display rule so it can be mapped to text fields
    function expandDisplayRule(rule: DisplayRule) {
        return Object.assign({}, EMPTY_DISPLAY_RULE, rule);
    }

    function shrinkDisplayRule(rule: DisplayRule) {
        const cleanedRule = structuredClone(rule);
        const iconDetails = cleanedRule.iconDetails as any;
        for (const key in iconDetails) {
            if (iconDetails[key] === '' || iconDetails[key] === null) {
                delete cleanedRule.iconDetails[key];
            }
        }
        const pathOptions = cleanedRule.pathOptions as any;
        for (const key in pathOptions) {
            if (
                pathOptions[key] === '' ||
                pathOptions[key] === null ||
                pathOptions[key] === 0
            ) {
                delete (cleanedRule.pathOptions as any)[key];
            }
        }
        const badgeOptions = cleanedRule.badgeOptions as any;
        for (const key in badgeOptions) {
            if (badgeOptions[key] === '' || badgeOptions[key] === null) {
                delete (cleanedRule.badgeOptions as any)[key];
            }
        }
        return cleanedRule;
    }

    function sanityCheck(rule: DisplayRule) {
        let ok = true;
        // Check the user didn't ruin the preset rule
        if (displayRule.preset != rule.preset) ok = false;
        if (rule.preset && rule.query != '') ok = false;
        // Check no JSON errors
        if (invalidJson) ok = false;
        return ok;
    }

    async function save() {
        const shrunkRule = shrinkDisplayRule(ruleCopy);
        onSave(shrunkRule);
        close();
    }
</script>

{#snippet fieldName(name: string, tooltip: string)}
    <span>
        {name}
        <span title={tooltip} style="width: 1.5em; height: 1.5em;">
            {@html getIcon('circle-help').outerHTML}
        </span>
    </span>
{/snippet}

<div class="map-element-rules-dialog">
    <div class="scrollable">
        <div class="section">
            <div class="setting-item-info">
                <div class="setting-item-name">标记图标属性</div>
                <div class="setting-item-description">
                    参见 Font Awesome 参考 <a
                        href="https://fontawesome.com/search?ic=free">这里</a
                    >
                    和表情符号参考
                    <a href="https://emojipedia.org/">这里</a>。
                </div>
            </div>
            <div class="rule-group">
                <div class="rule-input">
                    {@render fieldName('图标', 'FontAwesome 图标或表情符号')}
                    <input
                        type="text"
                        bind:value={ruleCopy.iconDetails.icon}
                        class="rule-input"
                    />
                </div>
                <div class="rule-input">
                    {@render fieldName(
                        '标记颜色',
                        "十六进制颜色或以下之一：'red', 'darkred', 'orange', 'green', 'darkgreen', 'blue', 'purple', 'darkpurple', 'cadetblue'",
                    )}
                    <input
                        type="text"
                        bind:value={ruleCopy.iconDetails.markerColor}
                        class="rule-input"
                    />
                </div>
                <div class="rule-input">
                    {@render fieldName('图标颜色', '任何颜色名称或十六进制值')}
                    <input
                        type="text"
                        bind:value={ruleCopy.iconDetails.iconColor}
                        class="rule-input"
                    />
                </div>
                <div class="rule-input">
                    {@render fieldName(
                        '形状',
                        'circle, square, star, penta, simple-circle',
                    )}
                    <input
                        type="text"
                        bind:value={ruleCopy.iconDetails.shape}
                        class="rule-input"
                    />
                </div>
                <div class="rule-input">
                    {@render fieldName(
                        '透明度',
                        '0（完全透明）到 1（完全不透明）之间的值',
                    )}
                    <input
                        type="text"
                        bind:value={ruleCopy.iconDetails.opacity}
                        class="rule-input"
                    />
                </div>
            </div>
        </div>

        {#if !displayRule.preset}
            <div class="section">
                <div class="setting-item-info">
                    <div class="setting-item-name">标记徽章</div>
                    <div class="setting-item-description">
                        参见文档 <a
                            href="https://esm7.github.io/obsidian-map-view/display-rules#marker-badges"
                            >这里</a
                        >。
                    </div>
                </div>
                <div class="rule-group">
                    <div class="rule-input">
                        {@render fieldName('符号', '表情符号或最多 2 个字符')}
                        <input
                            type="text"
                            bind:value={ruleCopy.badgeOptions.badge}
                            class="rule-input"
                        />
                    </div>
                    <div class="rule-input">
                        {@render fieldName(
                            '文字颜色',
                            '任何颜色名称或十六进制值',
                        )}
                        <input
                            type="text"
                            bind:value={ruleCopy.badgeOptions.textColor}
                            class="rule-input"
                        />
                    </div>
                    <div class="rule-input">
                        {@render fieldName(
                            '背景颜色',
                            '任何颜色名称或十六进制值',
                        )}
                        <input
                            type="text"
                            bind:value={ruleCopy.badgeOptions.backColor}
                            class="rule-input"
                        />
                    </div>
                    <div class="rule-input">
                        {@render fieldName(
                            '边框',
                            "CSS 'border' 值，例如 '1px solid black'",
                        )}
                        <input
                            type="text"
                            bind:value={ruleCopy.badgeOptions.border}
                            class="rule-input"
                        />
                    </div>
                </div>
            </div>
        {/if}

        <div class="section">
            <div class="setting-item-info">
                <div class="setting-item-name">路径属性</div>
                <div class="setting-item-description">
                    参见文档 <a
                        href="https://esm7.github.io/obsidian-map-view/display-rules#path-properties"
                        >这里</a
                    >。
                </div>
            </div>
            <div class="rule-group">
                <div class="rule-input">
                    {@render fieldName('颜色', '任何颜色名称或十六进制值')}
                    <input
                        type="text"
                        bind:value={ruleCopy.pathOptions.color}
                        class="rule-input"
                    />
                </div>
                <div class="rule-input">
                    {@render fieldName('粗细', '线条粗细（像素）')}
                    <input
                        type="number"
                        bind:value={ruleCopy.pathOptions.weight}
                        class="rule-input"
                    />
                </div>
                <div class="rule-input">
                    {@render fieldName('透明度', '0 到 1 之间')}
                    <input
                        type="number"
                        bind:value={ruleCopy.pathOptions.opacity}
                        placeholder="透明度"
                        class="rule-input"
                    />
                </div>
                <!-- TODO make this a toggle class -->
                <!--            <div class="rule-input"> -->
                <!--                {@render fieldName('Fill', 'true or false')} -->
                <!-- <div -->
                <!-- 	class="checkbox-container" -->
                <!-- 	onclick={() => { -->
                <!-- 		ruleCopy.pathOptions.fill = !ruleCopy.pathOptions.fill; -->
                <!-- 	}} -->
                <!-- > -->
                <!-- 	<input -->
                <!-- 		type="checkbox" -->
                <!-- 		checked={ruleCopy.pathOptions.fill} -->
                <!-- 		id="rule-path-fill" -->
                <!-- 	/> -->
                <!-- </div> -->
                <!-- <label class="rule-path-fill-label" for="rule-path-fill" -->
                <!-- 	>Filled</label -->
                <!-- > -->
                <!--            </div> -->
            </div>
        </div>

        <div class="section icon-preview">
            {@html makePreview(ruleCopy).outerHTML}
        </div>

        <div class="section">
            <ViewCollapsibleSection headerText="高级">
                <p>
                    直接以 JSON 格式编辑规则，这允许更广泛的高级选项。参见 <a
                        href="https://github.com/coryasilva/Leaflet.ExtraMarkers#properties"
                        >这里</a
                    > 了解完整的属性列表。
                </p>
                <textarea
                    class="json-editor"
                    class:json-error={invalidJson}
                    bind:value={rulesCopyFormatted}
                    oninput={(e) => {
                        try {
                            const parsed = JSON.parse(e.currentTarget.value);
                            ruleCopy = parsed;
                            invalidJson = false;
                        } catch (error) {
                            invalidJson = true;
                        }
                    }}
                    rows="10"
                    style="width: 100%; font-family: monospace;"
                ></textarea>
            </ViewCollapsibleSection>
        </div>
    </div>

    <div class="modal-button-container">
        {#if !allOk}
            <div
                class="warning-sign"
                title="一个或多个规则格式错误或包含非法查询。"
            >
                {@html getIcon('circle-alert').outerHTML}
            </div>
        {/if}
        <button class="mod-warning" onclick={close}>取消</button>
        <button class="mod-cta" onclick={save} disabled={!allOk}
            >保存并关闭</button
        >
    </div>
</div>

<style>
    /* This is a patch after for some reason I was unable to make just the 'scroller' div scrollable and the buttons fixed. */
    :global(.modal.mod-settings .modal-content:has(.map-element-rules-dialog)) {
        overflow-y: auto;
    }

    .map-element-rules-dialog {
        gap: 10px;
        display: flex;
        flex-direction: column;
        height: 100%;
        max-height: var(--dialog-max-height);
    }

    .scrollable {
        flex: 1;
    }

    .setting-item-name {
        font-weight: bold;
    }

    .setting-item-description {
        padding-bottom: 5px;
    }

    .section {
        padding-bottom: 20px;
        padding-right: 5px;
        padding-inline-start: var(--size-4-4);
        padding-inline-end: var(--size-4-4);
    }

    .rule-group {
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: auto auto;
        gap: 8px;
    }

    .rule-input {
        min-width: 30px;
        width: 100%;
        margin: 0;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .rule-input span {
        font-size: 0.8em;
        opacity: 0.8;
        vertical-align: middle;
    }

    .rule-input input {
        width: 100%;
    }

    .icon-preview {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        min-width: 24px;
        min-height: 24px;
        margin: 0 5px 0 5px;
    }

    .json-error {
        border-color: red;
    }

    .warning-sign {
        color: var(--text-error);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-inline-end: 0;
    }

    :global(.icon-preview .leaflet-marker-icon) {
        margin: 0;
        position: relative;
    }
</style>
