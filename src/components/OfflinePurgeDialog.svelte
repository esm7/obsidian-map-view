<script lang="ts">
    import { purgeOldTiles } from '../offlineTiles.svelte';
    import { Notice } from 'obsidian';

    let { urlTemplate, close, beforeClose } = $props<{
        urlTemplate: string;
        close: () => void;
        beforeClose: () => void;
    }>();

    let maxAgeMonths = $state(6);

    async function purge() {
        const purged = await purgeOldTiles(urlTemplate, maxAgeMonths);
        if (purged > 0) {
            new Notice(`已清除 ${purged} 个旧瓦片。`);
            beforeClose();
        } else new Notice(`在此图层中未找到超过 ${maxAgeMonths} 个月的瓦片。`);
        close();
    }
</script>

<div class="purge-tiles">
    <div class="setting-item">
        <div class="setting-item-info">
            <div class="setting-item-name"><b>清除旧瓦片</b></div>
            <div class="setting-item-description">
                <p>清除 '{new URL(urlTemplate).hostname}' 的旧瓦片。</p>
                <p>目前无法区分通过对话框显式下载的瓦片和自动缓存的瓦片。</p>
            </div>
        </div>
    </div>
    <div class="setting-item">
        <div class="setting-item-info">
            <div class="setting-item-name">删除超过...的瓦片</div>
        </div>

        <div class="setting-item-control">
            <select class="dropdown" bind:value={maxAgeMonths}>
                <option value={1}>1 个月</option>
                <option value={3}>3 个月</option>
                <option value={6}>6 个月</option>
                <option value={12}>1 年</option>
            </select>
        </div>
    </div>

    <div class="setting-item modal-button-container">
        <button class="mod-cta" onclick={close}> 取消 </button>
        <button class="mod-warning" onclick={purge}> 清除 </button>
    </div>
</div>
