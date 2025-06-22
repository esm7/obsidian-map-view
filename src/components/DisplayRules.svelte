<script lang="ts">
    import { type PluginSettings, type DisplayRule } from '../settings';
    import MapViewPlugin from '../main';
    import { App, getIcon } from 'obsidian';
    import DisplayRuleLine from './DisplayRuleLine.svelte';
    import { Query } from '../query';
    import { DisplayRulesCache } from '../displayRulesCache';
    import { getIconFromOptions } from '../markerIcons';
    import { tick } from 'svelte';

    let { close, app, plugin, settings } = $props<{
        close: () => void;
        app: App;
        plugin: MapViewPlugin;
        settings: PluginSettings;
    }>();

    let rulesCopy: DisplayRule[] = $state(
        structuredClone(settings.displayRules),
    );
    let allOk: boolean = $derived(sanityCheck(rulesCopy));
    let previewLayerName: string = $state('');
    let rulesGroup: HTMLElement = $state();

    async function save() {
        plugin.settings.displayRules = rulesCopy;
        await plugin.saveSettings();
        plugin.refreshDisplayRules();
        plugin.refreshAllMapViews();
        close();
    }

    async function newRule() {
        rulesCopy.push({ query: '', preset: false });
        await tick();
        if (rulesGroup) {
            rulesGroup.scrollTop = rulesGroup.scrollHeight;
        }
    }

    function sanityCheck(rules: DisplayRule[]) {
        let ok = true;
        // Check the first rule is a preset and an empty query
        if (!rules[0].preset || rules[0].query != '') ok = false;
        // Check no other rule is defined a preset
        if (rules.filter((rule) => rule.preset === true).length !== 1)
            ok = false;
        // Only the default rule is alowed an empty query
        if (rules.filter((rule) => rule.query.trim() === '').length !== 1)
            ok = false;
        // Check no errors inside rules
        try {
            for (const rule of rules) {
                const queryObject = new Query(app, rule.query);
                for (const layer of plugin.layerCache.map.values()) {
                    queryObject.testMarker(layer);
                }
            }
        } catch (e) {
            ok = false;
        }
        return ok;
    }

    function doDelete(toDelete: DisplayRule) {
        rulesCopy = rulesCopy.filter((rule) => rule !== toDelete);
    }

    function doMove(rule: DisplayRule, direction: 'up' | 'down') {
        const ruleIndex = rulesCopy.findIndex((r) => r === rule);
        if (direction === 'up' && ruleIndex > 0) {
            // Move up - swap with the previous element
            [rulesCopy[ruleIndex], rulesCopy[ruleIndex - 1]] = [
                rulesCopy[ruleIndex - 1],
                rulesCopy[ruleIndex],
            ];
        } else if (direction === 'down' && ruleIndex < rulesCopy.length - 1) {
            // Move down - swap with the next element
            [rulesCopy[ruleIndex], rulesCopy[ruleIndex + 1]] = [
                rulesCopy[ruleIndex + 1],
                rulesCopy[ruleIndex],
            ];
        }
    }

    function layerPreview(name: string) {
        const layer = plugin.layerCache.findName(name);
        if (!layer) return null;
        const rulesCache = new DisplayRulesCache(app);
        rulesCache.build(rulesCopy);
        const [iconOptions, pathOptions, badgeOptions] =
            rulesCache.runOn(layer);
        const compiledIcon = getIconFromOptions(
            iconOptions,
            badgeOptions,
            plugin.iconFactory,
        );
        const iconElement = compiledIcon.createIcon();
        // The marker icons library generates the icons with margins meant for map display. We have to override this
        // programatically here, and not by a style, as it's set directly to the element style.
        iconElement.style.marginLeft = '';
        iconElement.style.marginTop = '';
        return iconElement;
    }
</script>

<div class="map-element-rules-dialog" style="overflow: auto">
    <div class="setting-item with-padding">
        <div class="setting-item-info">
            <div class="setting-item-name"><b>Display Rules</b></div>
            <div class="setting-item-description">
                <p>
                    Each marker or path starts from the default setting, then
                    matched by order, potentially overwriting some properties on
                    every rule match. See <a
                        href="https://github.com/esm7/obsidian-map-view?tab=readme-ov-file#marker-icons"
                        >here</a
                    > for details and examples.
                </p>
            </div>
        </div>
    </div>
    <div class="with-padding rules-group" bind:this={rulesGroup}>
        {#each rulesCopy as rule}
            <div class="setting-item" style="padding: 5px; border-top: none;">
                <DisplayRuleLine
                    displayRule={rule}
                    allRules={rulesCopy}
                    {app}
                    {plugin}
                    doDelete={() => doDelete(rule)}
                    {doMove}
                />
            </div>
        {/each}
    </div>

    <div class="modal-button-container" style="padding-bottom: 15px;">
        <button onclick={newRule}>New Rule</button>
    </div>

    <div class="setting-item with-padding">
        <div class="setting-item-info">
            <div class="setting-item-name">Rule Tester</div>
            <div class="setting-item-description">
                Select a marker or a path to test.
            </div>
        </div>
        <div class="setting-item-control">
            <input
                class="input"
                type="text"
                list="layerSuggestions"
                bind:value={previewLayerName}
                contenteditable="true"
            />
            <datalist id="layerSuggestions">
                {#each plugin.layerCache.layers as layer}
                    <option>{layer.extraName ?? layer.file.basename}</option>
                {/each}
            </datalist>
            <div class="icon-preview">
                {@html layerPreview(previewLayerName)?.outerHTML}
            </div>
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
    }

    .with-padding {
        padding-right: 5px;
        padding-inline-start: var(--size-4-4);
        padding-inline-end: var(--size-4-4);
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

    .icon-preview {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        min-width: 35px;
        min-height: 45px;
        margin: 0 5px 0 5px;
    }
</style>
