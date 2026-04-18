<script lang="ts">
    import { untrack } from 'svelte';
    import { type TileLayerOffline } from 'leaflet.offline';
    import * as leaflet from 'leaflet';
    import { calculateTilesToDownload } from '../offlineTiles.svelte';
    import type { TileInfo } from 'leaflet.offline';

    let { onStart, close, map, tileLayer } = $props<{
        onStart: (tiles: TileInfo[], requestsPerSecond: number) => void;
        close: () => void;
        map: leaflet.Map;
        tileLayer: TileLayerOffline;
    }>();

    const MAX_TILES_TO_DOWNLOAD = 1000000;
    let displayedZoom = $state(map.getZoom());
    const MIN_ALLOWED_ZOOM = Math.min(6, displayedZoom);
    const MAX_ALLOWED_ZOOM = Math.max(20, displayedZoom);
    let minZoom = $state(displayedZoom - 1);
    let maxZoom = $state(displayedZoom + 1);
    let maxRequestsPerSecond = $state(10);
    let numTilesToDownload = $state(0);
    let skipExisting = $state(false);
    let estimationRunning = $state(0);
    let tileList: TileInfo[] = [];

    function handleSubmit() {
        onStart(tileList, maxRequestsPerSecond);
        close();
    }

    let tileCountCalculation: AbortController | null = null;

    $effect(() => {
        async function updateTileCount() {
            try {
                // Abort previous calculation if it is running
                tileCountCalculation?.abort();
                tileCountCalculation = new AbortController();
                // untrack is used here and below to avoid a recursive effect update
                estimationRunning = untrack(() => estimationRunning) + 1;
                tileList = await calculateTilesToDownload(
                    map,
                    tileLayer,
                    minZoom,
                    maxZoom,
                    skipExisting,
                    MAX_TILES_TO_DOWNLOAD,
                    tileCountCalculation.signal,
                );
                numTilesToDownload = tileList.length;
            } finally {
                estimationRunning = untrack(() => estimationRunning) - 1;
            }
        }
        updateTileCount();
    });
</script>

<div class="offline-new-job">
    <div class="setting-item">
        <div class="setting-item-info">
            <div class="setting-item-name">
                <b>下载瓦片以供离线使用</b>
            </div>
            <div class="setting-item-description">
                <p>基于当前视图和您选择的缩放级别范围添加地图瓦片下载任务。</p>
                <p>请负责任地使用，确保不违反瓦片提供商的服务条款。</p>
            </div>
        </div>
    </div>
    <div class="setting-item">
        <div class="setting-item-info">
            <div class="setting-item-name">最小缩放级别</div>
            <div class="setting-item-description">要下载的最近缩放级别</div>
        </div>
        <div class="setting-item-control">
            <div class="slider-container">
                <input
                    type="range"
                    bind:value={minZoom}
                    min={MIN_ALLOWED_ZOOM}
                    max={displayedZoom}
                    class="slider"
                />
                <div class="slider-value">{minZoom}</div>
            </div>
        </div>
    </div>

    <div class="setting-item">
        <div class="setting-item-info">
            <div class="setting-item-name">当前缩放级别</div>
            <div class="setting-item-description">地图当前显示的缩放级别。</div>
        </div>
        <div class="setting-item-control">
            <div class="slider-value"><b>{displayedZoom}</b></div>
        </div>
    </div>

    <div class="setting-item">
        <div class="setting-item-info">
            <div class="setting-item-name">最大缩放级别</div>
            <div class="setting-item-description">要下载的最远缩放级别</div>
        </div>
        <div class="setting-item-control">
            <div class="slider-container">
                <input
                    type="range"
                    bind:value={maxZoom}
                    min={displayedZoom}
                    max={MAX_ALLOWED_ZOOM}
                    class="slider"
                />
                <div class="slider-value">{maxZoom}</div>
            </div>
        </div>
    </div>

    <div class="setting-item mod-toggle">
        <div class="setting-item-info">
            <div class="setting-item-name">跳过已有瓦片</div>
            <div class="setting-item-description">
                仅下载缓存中尚不存在的瓦片。<br />
                使用此选项继续先前的下载，或关闭以刷新旧瓦片。<br />
                （启用时，由于数据库查询，计算要下载的瓦片需要更长时间。）
            </div>
        </div>
        <div class="setting-item-control">
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div
                class="checkbox-container"
                class:is-enabled={skipExisting}
                onclick={() => (skipExisting = !skipExisting)}
            >
                <input type="checkbox" checked={skipExisting} />
            </div>
        </div>
    </div>

    <div class="setting-item">
        <div class="setting-item-info">
            <div class="setting-item-name">每秒最大请求数</div>
            <div class="setting-item-description">限制瓦片下载速率</div>
        </div>
        <div class="setting-item-control">
            <input
                type="number"
                bind:value={maxRequestsPerSecond}
                min="1"
                max="50"
                class="text-input-inline"
            />
        </div>
    </div>

    <div class="setting-item tiles-info-container">
        <div class="setting-item-info">
            <div class="setting-item-name">
                <b>此任务要下载的瓦片数：{numTilesToDownload}</b>
            </div>
            <div class="setting-item-description">
                {#if numTilesToDownload === MAX_TILES_TO_DOWNLOAD}
                    <p>
                        <b>这是单个任务最多可下载的瓦片数。</b> 要下载更多，请完成此任务并开启"跳过已有瓦片"后开始新任务。
                    </p>
                {/if}
                <p>开始下载前，请确保在瓦片提供商的账户配额范围内。</p>
                <p>
                    预计时间：{(
                        numTilesToDownload /
                        maxRequestsPerSecond /
                        60
                    ).toFixed(1)} 分钟。
                </p>
            </div>
        </div>
        {#if estimationRunning > 0}
            <div class="loading-overlay">
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                    <span>
                        <b>正在计算要下载的瓦片...</b>
                        {#if skipExisting}
                            <br />（"跳过已有瓦片"计算需要更长时间）
                        {/if}
                    </span>
                </div>
            </div>
        {/if}
    </div>

    <div class="setting-item modal-button-container">
        <button
            class="mod-cta"
            onclick={handleSubmit}
            disabled={numTilesToDownload <= 0 || estimationRunning > 0}
        >
            开始下载
        </button>
        <button class="mod-warning" onclick={close}> 取消 </button>
    </div>
</div>

<style>
    .slider-container {
        display: flex;
        align-items: center;
        gap: var(--size-4-2);
    }

    .loading-container {
        display: flex;
        align-items: center;
        gap: var(--size-4-2);
    }

    .loading-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid var(--background-modifier-border);
        border-top-color: var(--interactive-accent);
        border-radius: 50%;
        animation: loading-spinner 0.8s linear infinite;
    }

    @keyframes loading-spinner {
        to {
            transform: rotate(360deg);
        }
    }

    .tiles-info-container {
        position: relative;
        min-height: 100px;
    }

    .loading-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(--background-primary);
        display: flex;
        align-items: center;
        justify-content: center;
    }
</style>
