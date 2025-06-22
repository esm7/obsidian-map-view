<script lang="ts">
    import { SimpleInputSuggest } from '../simpleInputSuggest';
    import { onMount } from 'svelte';
    import { App } from 'obsidian';

    let { label, description, existingText, close, onOk, suggestions, app } =
        $props<{
            label: string;
            description: string | undefined;
            existingText: string;
            close: () => void;
            onOk: (text: string) => void;
            suggestions: string[] | undefined;
            // Required only when using suggestor
            app: App | undefined;
        }>();

    let text = $state(existingText);
    let inputComponent: HTMLInputElement;

    function handleSubmit(event: Event) {
        event.preventDefault();
        onOk(text);
        close();
    }

    function handleKeyDown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
        }
    }

    onMount(() => {
        if (suggestions && suggestions.length > 0) {
            new SimpleInputSuggest(
                app,
                inputComponent,
                suggestions,
                (selection: string) => {
                    text = selection;
                },
            );
        }
    });
</script>

<div class="mv-text-box-dialog">
    <form onsubmit={handleSubmit}>
        <p class="label">
            {label}
            {#if description}
                <br />
                <span class="description">{description}</span>
            {/if}
        </p>
        <div class="input-container">
            <input
                type="text"
                bind:this={inputComponent}
                bind:value={text}
                onkeydown={handleKeyDown}
            />
        </div>

        <div class="modal-button-container">
            <button type="button" class="mod-cta" onclick={close}>
                Cancel
            </button>
            <button type="submit" class="mod-warning"> Ok </button>
        </div>
    </form>
</div>

<style>
    .mv-text-box-dialog p.label {
        font-weight: bold;
    }

    .mv-text-box-dialog span.description {
        color: var(--text-muted);
        font-size: var(--font-ui-smaller);
    }

    .input-container input {
        width: 100%;
    }

    form {
        margin: 0;
    }
</style>
