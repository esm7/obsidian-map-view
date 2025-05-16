<script lang="ts">
    import { App } from 'obsidian';
    import MapViewPlugin from '../main';
    import { type PluginSettings, type DisplayRule } from '../settings';
    import { getIcon } from 'obsidian';
    import QueryTextField from './QueryTextField.svelte';
    import { getIconFromOptions } from '../markerIcons';
    import { Query } from '../query';
    import { SvelteModal } from 'src/svelte';
    import EditDisplayRuleDialog from './EditDisplayRuleDialog.svelte';

    let {
        displayRule = $bindable(),
        allRules,
        plugin,
        app,
        doDelete,
        doMove,
    } = $props<{
        displayRule: DisplayRule;
        allRules: DisplayRule[];
        plugin: MapViewPlugin;
        app: App;
        doDelete: (toDelete: DisplayRule) => void;
        doMove: (rule: DisplayRule, direction: 'up' | 'down') => void;
    }>();

    let queryError: boolean = $state(false);
    let zeroMatchWarning: boolean = $state(false);

    function openEdit() {
        const dialog = new SvelteModal(
            EditDisplayRuleDialog,
            app,
            plugin,
            plugin.settings,
            {
                displayRule,
                allRules,
                app,
                plugin,
                // TODO TEMP if this work explain why we do assign
                onSave: (newRule: DisplayRule) => {
                    Object.assign(displayRule, newRule);
                },
            },
            ['mod-settings'],
        );
        dialog.open();
    }

    function makePreview() {
        // TODO unify with the edit dialog
        const defaultRule = allRules.find(
            (rule: DisplayRule) => rule.preset === true,
        );
        if (!defaultRule) throw new Error("Can't find default rule");
        let options = Object.assign(
            {},
            defaultRule.iconDetails,
            displayRule.iconDetails,
        );
        const compiledIcon = getIconFromOptions(options, plugin.iconFactory);
        const iconElement = compiledIcon.createIcon();
        // The marker icons library generates the icons with margins meant for map display. We have to override this
        // programatically here, and not by a style, as it's set directly to the element style.
        iconElement.style.marginLeft = '';
        iconElement.style.marginTop = '';
        return iconElement;
    }

    $effect(() => {
        zeroMatchWarning = false;
        if (displayRule.query.length > 3 && plugin.layerCache) {
            try {
                const queryObject = new Query(app, displayRule.query);
                let matches = 0;
                for (const layer of plugin.layerCache.map.values()) {
                    if (queryObject.testMarker(layer)) matches += 1;
                }
                queryError = false;
                if (matches === 0) zeroMatchWarning = true;
            } catch (e) {
                queryError = true;
            }
        }
        if (!displayRule.preset && displayRule.query.trim().length === 0)
            queryError = true;
    });
</script>

<div class="rule-line-container">
    <div class="rule-line">
        {#if !displayRule.preset}
            {#if queryError}
                <div class="warning-sign" title="Malformed query.">
                    {@html getIcon('circle-alert').outerHTML}
                </div>
            {:else if zeroMatchWarning}
                <div
                    class="warning-sign"
                    title="This query seems legal but it matches no existing map items."
                >
                    {@html getIcon('file-question').outerHTML}
                </div>
            {/if}
            <QueryTextField
                {plugin}
                {app}
                bind:query={displayRule.query}
                bind:queryError
            />
        {:else}
            <div class="search-input-container">
                <input
                    type="text"
                    placeholder="Default"
                    title="The default icon and base for all other rules"
                    disabled
                />
            </div>
        {/if}
        <div class="icon-preview">
            {@html makePreview().outerHTML}
        </div>
        <button class="settings-dense-button" onclick={openEdit}>
            Edit...
        </button>
        <button
            class="settings-dense-button"
            disabled={displayRule.preset}
            onclick={() => doDelete(displayRule)}
        >
            Delete
        </button>
        <button
            class="settings-dense-button"
            disabled={displayRule == allRules[0] || displayRule.preset}
            onclick={() => doMove(displayRule, 'up')}
        >
            {@html getIcon('arrow-up').outerHTML}
        </button>
        <button
            class="settings-dense-button"
            disabled={displayRule == allRules[allRules.length - 1] ||
                displayRule.preset}
            onclick={() => doMove(displayRule, 'down')}
        >
            {@html getIcon('arrow-down').outerHTML}
        </button>
    </div>
</div>

<style>
    .rule-line-container {
        width: 100%;
        position: relative;
    }

    .rule-line {
        display: flex;
        flex-wrap: nowrap;
        min-width: min-content;
        white-space: nowrap;
        align-items: center;
    }

    .warning-sign {
        position: absolute;
        left: -24px;
        top: 50%;
        transform: translateY(-50%);
    }

    .settings-dense-button {
        flex-shrink: 0;
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

    :global(.icon-preview .leaflet-marker-icon) {
        margin: 0;
        position: relative;
    }
</style>
