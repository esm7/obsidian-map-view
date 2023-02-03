import * as leaflet from 'leaflet';
import { PluginSettings, GeoHelperType } from 'src/settings';
import { isMobile } from 'src/utils';
import { App, FileSystemAdapter } from 'obsidian';

import { existsSync } from 'fs';

export type RealTimeLocationSource =
    | 'geohelper-app'
    | 'geohelper-lite'
    | 'custom'
    | 'clear'
    | 'unknown';
export type RealTimeLocation = {
    center: leaflet.LatLng;
    accuracy: number;
    source: RealTimeLocationSource;
    timestamp: number;
};

export function isSame(loc1: RealTimeLocation, loc2: RealTimeLocation) {
    if (loc1 === null && loc2 === null) return true;
    if (loc1 === null || loc2 === null) return false;
    return (
        loc1.center.distanceTo(loc2.center) < 1 &&
        loc1.accuracy == loc2.accuracy
    );
}

export function getGeoHelperType(
    settings: PluginSettings,
    app: App
): GeoHelperType {
    let geoHelperType = settings.geoHelperType;
    if (geoHelperType === 'auto') {
        if (isMobile(app)) geoHelperType = 'app';
        else geoHelperType = 'lite';
    }
    return geoHelperType;
}

export function askForLocation(settings: PluginSettings, app: App): boolean {
    if (!settings.supportRealTimeGeolocation) return false;
    const geoHelperType = getGeoHelperType(settings, app);
    switch (geoHelperType) {
        case 'lite': {
            const geohelperLiteName =
                '.obsidian/plugins/obsidian-map-view/geohelper.html';
            if (app.vault.adapter instanceof FileSystemAdapter) {
                const path = app.vault.adapter.getFullPath(geohelperLiteName);
                if (existsSync(path)) {
                    open(`file:///${path}`);
                    return true;
                } else {
                    console.warn(
                        "Can't find Geo Helper Lite: file not found",
                        path
                    );
                    return false;
                }
            } else {
                console.warn(
                    "Can't use Geo Helper Lite: vault is not a FileSystemAdapter"
                );
                return false;
            }
        }
        case 'app': {
            open('geohelper://locate');
            return true;
        }
        case 'custom': {
            const path = settings.geoHelperFilePath;
            if (!path) {
                console.warn('Geo helper custom path is empty');
                return false;
            }
            if (!existsSync(path)) {
                console.warn('Geo helper custom path does not exist:', path);
                return false;
            }
            open(`${path}`);
            return true;
        }
    }
}
