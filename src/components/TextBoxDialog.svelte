<script lang="ts">
    let { label, existingText, close, onOk } = $props<{
        label: string;
        existingText: string;
        close: () => void;
        onOk: (text: string) => void;
    }>();

    let text = $state(existingText);

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
</script>

<div class="mv-text-box-dialog">
    <form onsubmit={handleSubmit}>
        <p>{label}</p>
        <div class="input-container">
            <input type="text" bind:value={text} onkeydown={handleKeyDown} />
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
    .mv-text-box-dialog p {
        font-weight: bold;
    }

    .input-container input {
        width: 100%;
    }

    form {
        margin: 0;
    }
</style>
