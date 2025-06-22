<script lang="ts">
    import { getIcon } from 'obsidian';

    let { chips = $bindable() } = $props<{
        chips: string[];
    }>();

    function remove(chipName: string) {
        const index = chips.indexOf(chipName);
        chips.splice(index, 1);
    }
</script>

<!-- Class used for Obsidian chips container -->
<div class="setting-command-hotkeys">
    {#each chips as chipName}
        <span class="setting-hotkey mv-edit-tag-name">
            {chipName}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <span
                class="setting-hotkey-icon"
                onclick={() => {
                    remove(chipName);
                }}
            >
                {@html getIcon('x').outerHTML}
            </span>
        </span>
    {/each}
</div>

<style>
    .mv-edit-tag-name {
        font-family: inherit;
    }
</style>
