<script lang="ts">
    import { type Snippet } from 'svelte';
    let {
        headerText,
        children,
        expanded,
        afterToggle,
    }: {
        headerText: string;
        children?: Snippet;
        expanded?: boolean;
        afterToggle?: (expanded: boolean) => void;
    } = $props();

    const uniqueId = `collapsible-${crypto.randomUUID()}`;
</script>

<div class="collapsible" class:open={expanded}>
    <input
        type="checkbox"
        id={uniqueId}
        class="toggle"
        bind:checked={expanded}
        onchange={() => {
            afterToggle?.(expanded);
        }}
    />
    <label for={uniqueId}>
        <svg class="triangle" viewBox="0 0 10 10" fill="none">
            <path d="M2 2L8 5L2 8Z" fill="currentColor" />
        </svg>
        <span>{headerText}</span>
    </label>

    <div class="contents" hidden={!expanded}>
        {@render children?.()}
    </div>
</div>

<style>
    .collapsible {
        border: none;
        padding: 1px;
        padding-right: 6px;
    }

    .collapsible.open {
        padding-bottom: 5px;
    }

    .toggle {
        display: none;
    }

    label {
        display: block;
        padding: 1px;
        color: var(--gray-darkest, #282828);
    }

    label span {
        vertical-align: middle;
    }

    .triangle {
        height: 0.7em;
        width: 0.7em;
        vertical-align: middle;
        margin-right: 3px;
        transition: transform 200ms ease;
        transform: rotate(0deg);
        display: inline-block;
    }

    .toggle:checked + label .triangle {
        transform: rotate(90deg);
    }
</style>
