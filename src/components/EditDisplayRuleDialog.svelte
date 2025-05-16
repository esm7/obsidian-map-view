<script lang="ts">
    import { App } from 'obsidian';
    import MapViewPlugin from '../main';
    import {
        type PluginSettings,
        type DisplayRule,
        EMPTY_DISPLAY_RULE,
    } from '../settings';
    import { getIcon } from 'obsidian';
    import { getIconFromOptions } from '../markerIcons';
    import ViewCollapsibleSection from './ViewCollapsibleSection.svelte';

    let { close, displayRule, allRules, plugin, app, onSave } = $props<{
        close: () => void;
        displayRule: DisplayRule;
        allRules: DisplayRule[];
        plugin: MapViewPlugin;
        app: App;
        onSave: (newRule: DisplayRule) => void;
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
        for (const key in cleanedRule.iconDetails) {
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
        return cleanedRule;
    }

    function makePreview(ruleToPreview: DisplayRule) {
        const defaultRule = allRules.find(
            (rule: DisplayRule) => rule.preset === true,
        );
        if (!defaultRule) throw new Error("Can't find default rule");
        let options = Object.assign(
            {},
            defaultRule.iconDetails,
            shrinkDisplayRule(ruleToPreview).iconDetails,
        );
        const compiledIcon = getIconFromOptions(options, plugin.iconFactory);
        const iconElement = compiledIcon.createIcon();
        // The marker icons library generates the icons with margins meant for map display. We have to override this
        // programatically here, and not by a style, as it's set directly to the element style.
        iconElement.style.marginLeft = '';
        iconElement.style.marginTop = '';
        return iconElement;
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
    <div class="section">
        <p><b>Marker Icon Properties</b></p>
        <p>
            See Font Awesome reference <a
                href="https://fontawesome.com/search?ic=free">here</a
            >
            and emoji reference <a href="https://emojipedia.org/">here</a>.
        </p>
        <div class="rule-group">
            <div class="rule-input">
                {@render fieldName('Icon', 'A FontAwesome icon or an emoji')}
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
        </div>
    </div>

    <div class="section">
        <p><b>Path Properties</b></p>
        <div class="rule-group">
            <div class="rule-input">
                {@render fieldName('Color', 'Any color name or a hex value')}
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
        </div>
    </div>

    <div class="section icon-preview">
        {@html makePreview(ruleCopy).outerHTML}
    </div>

    <div class="section">
        <ViewCollapsibleSection headerText="Advanced">
            <p>
                Edit the rule directly as JSON, which allows a wider range of
                advanced options. See <a
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
    .map-element-rules-dialog {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .section {
        padding-bottom: 10px;
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
