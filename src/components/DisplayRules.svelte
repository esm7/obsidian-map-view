<script lang="ts">
    import { type PluginSettings, type DisplayRule } from '../settings';
    import MapViewPlugin from '../main';
    import { App, getIcon } from 'obsidian';
    import DisplayRuleLine from './DisplayRuleLine.svelte';
    import { Query } from '../query';

    let { close, app, plugin, settings } = $props<{
        close: () => void;
        app: App;
        plugin: MapViewPlugin;
        settings: PluginSettings;
    }>();

    let rulesCopy: DisplayRule[] = $state(
        structuredClone(settings.displayRules),
    );
    let rulesCopyFormatted: string = $state('');
    let allOk: boolean = $derived(sanityCheck(rulesCopy));
    let invalidJson: boolean = $state(false);

    $effect(() => {
        rulesCopyFormatted = JSON.stringify(rulesCopy, null, 2);
    });

    async function save() {
        settings.displayRules = rulesCopy;
        plugin.displayRulesCache.build(settings.displayRules);
        await plugin.saveSettings();
        plugin.refreshAllMapViews();
        close();
    }

    function sanityCheck(rules: DisplayRule[]) {
        let ok = true;
        // Check the first rule is a preset and an empty query
        if (!rules[0].preset || rules[0].query != '') ok = false;
        // Check no other rule is defined a preset
        if (rules.filter((rule) => rule.preset === true).length !== 1)
            ok = false;
        // Check no JSON errors
        if (invalidJson) ok = false;
        // Check no errors inside rules
        try {
            for (const rule of rules) {
                const queryObject = new Query(app, rule.query);
                for (const layer of plugin.layerCache.values()) {
                    queryObject.testMarker(layer);
                }
            }
        } catch (e) {
            ok = false;
        }
        return ok;
    }
</script>

<div class="map-element-rules-dialog" style="overflow: auto; width: 100%;">
    <div class="setting-item with-padding">
        <div class="setting-item-info">
            <div class="setting-item-name"><b>Marker Rules</b></div>
            <div class="setting-item-description">
                <p>Description.</p>
            </div>
        </div>
    </div>
    <div class="with-padding rules-group">
        {#each rulesCopy as rule}
            <div class="setting-item" style="padding: 5px; border-top: none;">
                <DisplayRuleLine
                    displayRule={rule}
                    allRules={rulesCopy}
                    {app}
                    {plugin}
                />
            </div>
        {/each}
    </div>

    <div class="setting-item with-padding">
        <div class="setting-item-info">
            <div class="setting-item-name">
                Edit display rules as JSON (advanced)
            </div>
            <div class="setting-item-description">
                <p>Description.</p>
            </div>
        </div>
        <div class="setting-item-control">
            <textarea
                class="json-editor"
                class:json-error={invalidJson}
                bind:value={rulesCopyFormatted}
                oninput={(e) => {
                    try {
                        const parsed = JSON.parse(e.currentTarget.value);
                        if (Array.isArray(parsed)) {
                            rulesCopy = parsed;
                            invalidJson = false;
                        } else invalidJson = true;
                    } catch (error) {
                        invalidJson = true;
                    }
                }}
                rows="10"
                style="width: 100%; font-family: monospace;"
            ></textarea>
        </div>
    </div>

    <div class="setting-item modal-button-container">
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
        padding-top: var(--size-4-8);
        padding-bottom: var(--size-4-16);
    }

    .with-padding {
        padding-right: 5px;
        padding-inline-start: var(--size-4-12);
        padding-inline-end: var(--size-4-12);
    }

    .rules-group {
        max-height: 30vh;
        overflow-y: auto;
        overflow-x: auto;
    }

    .warning-sign {
        color: var(--text-error);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-inline-end: 0;
    }

    .json-error {
        border-color: red;
    }
</style>
