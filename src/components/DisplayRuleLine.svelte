<script lang="ts">
    import { App } from 'obsidian';
    import MapViewPlugin from '../main';
    import { type PluginSettings, type DisplayRule } from '../settings';
    import { getIcon } from 'obsidian';
    import QueryTextField from './QueryTextField.svelte';

    let {
        displayRule = $bindable(),
        plugin,
        app,
        settings,
    } = $props<{
        displayRule: DisplayRule;
        plugin: MapViewPlugin;
        app: App;
        settings: PluginSettings;
    }>();

    // TODO mark red in query error
    let queryError: boolean = $state(false);
</script>

<div class="rule-line-container">
    <div class="rule-line">
        {#if !displayRule.preset}
            <QueryTextField
                {plugin}
                {app}
                {settings}
                bind:query={displayRule.query}
                bind:queryError
            />
        {:else}
            <input
                type="text"
                placeholder="Default"
                title="The default icon and base for all other rules"
                class="rule-input"
                disabled
            />
        {/if}
        <input
            type="text"
            bind:value={displayRule.iconDetails.icon}
            placeholder="Icon"
            title="A FontAwesome icon name or an emoji"
            class="rule-input"
        />
        <input
            type="text"
            bind:value={displayRule.iconDetails.markerColor}
            placeholder="Color"
            class="rule-input"
        />
        <input
            type="text"
            bind:value={displayRule.iconDetails.shape}
            placeholder="Shape"
            class="rule-input"
        />
        {#if !displayRule.preset}
            <button class="settings-dense-button">Delete</button>
        {/if}
        <button class="settings-dense-button">
            {@html getIcon('arrow-up').outerHTML}
        </button>
        <button class="settings-dense-button">
            {@html getIcon('arrow-down').outerHTML}
        </button>
    </div>
</div>

<style>
    .rule-line-container {
        width: 100%;
    }

    .rule-line {
        display: flex;
        flex-wrap: nowrap;
        min-width: min-content;
        white-space: nowrap;
    }

    .rule-input {
        min-width: 30px;
        flex-shrink: 1;
    }

    .settings-dense-button {
        flex-shrink: 0;
    }
</style>
