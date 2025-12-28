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
                <div class="setting-item-name">Marker Icon Properties</div>
                <div class="setting-item-description">
                    See Font Awesome reference <a
                        href="https://fontawesome.com/search?ic=free">here</a
                    >
                    and emoji reference
                    <a href="https://emojipedia.org/">here</a>.
                </div>
            </div>
            <div class="rule-group">
                <div class="rule-input">
                    {@render fieldName(
                        'Icon',
                        'A FontAwesome icon or an emoji',
                    )}
                    <input
                        type="text"
                        bind:value={ruleCopy.iconDetails.icon}
                        class="rule-input"
                    />
                </div>
                <div class="rule-input">
                    {@render fieldName(
                        'Marker Color',
                        "A hex color or one of the following: 'red', 'darkred', 'orange', 'green', 'darkgreen', 'blue', 'purple', 'darkpurple', 'cadetblue'",
                    )}
                    <input
                        type="text"
                        bind:value={ruleCopy.iconDetails.markerColor}
                        class="rule-input"
                    />
                </div>
                <div class="rule-input">
                    {@render fieldName(
                        'Icon Color',
                        'Any color name or a hex value',
                    )}
                    <input
                        type="text"
                        bind:value={ruleCopy.iconDetails.iconColor}
                        class="rule-input"
                    />
                </div>
                <div class="rule-input">
                    {@render fieldName(
                        'Shape',
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
                        'Opacity',
                        'A value between 0 (fully transparent) and 1 (fully opaque)',
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
                    <div class="setting-item-name">Marker Badge</div>
                    <div class="setting-item-description">
                        See documentation <a
                            href="https://github.com/esm7/obsidian-map-view?tab=readme-ov-file#marker-badge"
                            >here</a
                        >.
                    </div>
                </div>
                <div class="rule-group">
                    <div class="rule-input">
                        {@render fieldName(
                            'Symbol',
                            'An emoji or up to 2 characters',
                        )}
                        <input
                            type="text"
                            bind:value={ruleCopy.badgeOptions.badge}
                            class="rule-input"
                        />
                    </div>
                    <div class="rule-input">
                        {@render fieldName(
                            'Text Color',
                            'Any color name or a hex value',
                        )}
                        <input
                            type="text"
                            bind:value={ruleCopy.badgeOptions.textColor}
                            class="rule-input"
                        />
                    </div>
                    <div class="rule-input">
                        {@render fieldName(
                            'Background color',
                            'Any color name or a hex value',
                        )}
                        <input
                            type="text"
                            bind:value={ruleCopy.badgeOptions.backColor}
                            class="rule-input"
                        />
                    </div>
                    <div class="rule-input">
                        {@render fieldName(
                            'Border',
                            "A CSS 'border' value, e.g. '1px solid black'",
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
                <div class="setting-item-name">Path Properties</div>
                <div class="setting-item-description">
                    See documentation <a
                        href="https://github.com/esm7/obsidian-map-view?tab=readme-ov-file#path-properties"
                        >here</a
                    >.
                </div>
            </div>
            <div class="rule-group">
                <div class="rule-input">
                    {@render fieldName(
                        'Color',
                        'Any color name or a hex value',
                    )}
                    <input
                        type="text"
                        bind:value={ruleCopy.pathOptions.color}
                        class="rule-input"
                    />
                </div>
                <div class="rule-input">
                    {@render fieldName('Weight', 'Line weight in pixels')}
                    <input
                        type="number"
                        bind:value={ruleCopy.pathOptions.weight}
                        class="rule-input"
                    />
                </div>
                <div class="rule-input">
                    {@render fieldName('Opacity', 'Between 0 to 1')}
                    <input
                        type="number"
                        bind:value={ruleCopy.pathOptions.opacity}
                        placeholder="Opacity"
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
            <ViewCollapsibleSection headerText="Advanced">
                <p>
                    Edit the rule directly as JSON, which allows a wider range
                    of advanced options. See <a
                        href="https://github.com/coryasilva/Leaflet.ExtraMarkers#properties"
                        >here</a
                    > for the complete list of properties.
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
                title="One or more rules are malformed or contain and illegal query."
            >
                {@html getIcon('circle-alert').outerHTML}
            </div>
        {/if}
        <button class="mod-warning" onclick={close}>Cancel</button>
        <button class="mod-cta" onclick={save} disabled={!allOk}
            >Save & Close</button
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
