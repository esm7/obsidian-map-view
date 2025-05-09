<script lang="ts">
    import MapViewPlugin from '../main';
    import { App } from 'obsidian';
    import { QuerySuggest } from '../query';

    let {
        plugin,
        app,
        query = $bindable(),
        queryError = $bindable(),
    } = $props<{
        plugin: MapViewPlugin;
        app: App;
        query: string;
        queryError: boolean;
    }>();

    let suggestor: QuerySuggest = null;
    let queryInputElement: HTMLInputElement = $state();

    function openQuerySuggest() {
        if (!suggestor) {
            suggestor = new QuerySuggest(app, plugin, queryInputElement);
            suggestor.open();
        }
    }
</script>

<!-- The classes here utilize Obsidian styling -->
<div class="search-input-container mv-map-control">
    <input
        type="text"
        placeholder="Query"
        bind:value={query}
        contenteditable="true"
        class:graph-control-error={queryError}
        bind:this={queryInputElement}
        onfocus={() => openQuerySuggest()}
        onfocusout={() => {
            if (suggestor) {
                suggestor.close();
                suggestor = null;
            }
        }}
    />
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="search-input-clear-button" onclick={() => (query = '')}></div>
</div>
