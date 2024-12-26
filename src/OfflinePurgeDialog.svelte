<script lang="ts">
	import { purgeOldTiles } from 'src/offlineTiles.svelte';
	import { Notice } from 'obsidian';

    let { 
		urlTemplate,
		close,
		beforeClose
    } = $props<{
		urlTemplate: string,
		close: () => void;
		beforeClose: () => void;
	}>();

	let maxAgeMonths = $state(6);

	async function purge() {
		const purged = await purgeOldTiles(urlTemplate, maxAgeMonths);
		if (purged > 0) {
			new Notice(`Purged ${purged} old tiles.`)
			beforeClose();
		}
		else
			new Notice(`No tiles older than ${maxAgeMonths} months found in this layer.`)
		close();
	}
</script>

<div class="purge-tiles">
	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name"><b>Purge Old Tiles</b></div>
			<div class="setting-item-description">
				<p>Purge old tiles of '{new URL(urlTemplate).hostname}'.</p>
				<p>There is currently no way to differentiate between tiles downloaded explicitly via the dialog or automatic cache.</p>
			</div>
		</div>
	</div>
	<div class="setting-item">
		<div class="setting-item-info">
			<div class="setting-item-name">
				Delete older than...
			</div>
		</div>

		<div class="setting-item-control">
			<select 
				class="dropdown"
				bind:value={maxAgeMonths}
			>
				<option value={1/24/30}>1 hour</option>
				<option value={1}>1 month</option>
				<option value={3}>3 months</option>
				<option value={6}>6 months</option>
				<option value={12}>1 year</option>
			</select>
		</div>
	</div>

    <div class="setting-item modal-button-container">
        <button class="mod-cta" onclick={close}>
            Cancel
        </button>
        <button class="mod-warning" onclick={purge}>
			Purge
        </button>
    </div>
</div>
