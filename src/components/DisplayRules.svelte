<script lang="ts">
    import { Notice } from 'obsidian';
    import { type PluginSettings } from '../settings';
    import MapViewPlugin from '../main';
    import { App } from 'obsidian';
    import DisplayRuleLine from './DisplayRuleLine.svelte';

    let { close, app, plugin, settings } = $props<{
        close: () => void;
        app: App;
        plugin: MapViewPlugin;
        settings: PluginSettings;
    }>();

    function save() {
        // TODO disallow rules with the same name
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
        {#each settings.displayRules as rule}
            <div class="setting-item" style="padding: 5px; border-top: none;">
                <DisplayRuleLine displayRule={rule} {settings} {app} {plugin} />
            </div>
        {/each}
    </div>

    <div class="setting-item modal-button-container">
        <button class="mod-warning" onclick={close}> Cancel </button>
        <button class="mod-cta" onclick={save}> Save & Close </button>
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
</style>
