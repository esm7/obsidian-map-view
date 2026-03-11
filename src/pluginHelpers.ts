import { App, getAllTags } from 'obsidian';

import { BaseMapView } from './baseMapView';
import MapViewPlugin from 'src/main';
import * as consts from 'src/consts';

/**
 * Returns an open leaf of a map view type, if such exists.
 */
export function findOpenMapView(app: App) {
    const maps = app.workspace.getLeavesOfType(consts.MAP_VIEW_NAME);
    if (maps && maps.length > 0) return maps[0].view as BaseMapView;
}

export function getAllTagNames(app: App, plugin: MapViewPlugin): string[] {
    // Start from all the known tags by markers (which may be inline tags or Obsidian tags), and add to that all
    // the known Obsidian tags, so we can suggest them to the user too
    let tags = plugin.allTags;
    const allFiles = app.vault.getMarkdownFiles();
    for (const file of allFiles) {
        const fileCache = app.metadataCache.getFileCache(file);
        const fileTagNames = getAllTags(fileCache) || [];
        if (fileTagNames) fileTagNames.forEach((tag) => tags.add(tag));
    }
    const sortedTags = Array.from(tags).sort();
    return sortedTags;
}
