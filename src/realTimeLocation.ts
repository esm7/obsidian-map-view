import * as leaflet from 'leaflet';
import { PluginSettings } from 'src/settings';
import { Notice } from 'obsidian';
import { exec } from 'child_process';

export type RealTimeLocationSource =
    | 'url'
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

// Should be the same between obsidian-map-view and obsidian-geo-helper
type GeoHelperAction = 'locate';
type MapViewGpsAction =
    | 'showonmap'
    | 'newnotehere'
    | 'addtocurrentnotefm'
    | 'addtocurrentnoteinline'
    | 'copyinlinelocation';

// Should be the same between obsidian-map-view and obsidian-geo-helper
type Params = {
    // Action required by Geohelper
    geoaction?: GeoHelperAction | null;
    // Action required by Map View when it receives the location
    mvaction?: MapViewGpsAction | null;
    // Additional context Map View may want to receive
    mvcontext?: string | null;
};

export function askForLocation(
    settings: PluginSettings,
    geoaction: GeoHelperAction = 'locate',
    mvaction: MapViewGpsAction = 'showonmap',
    mvcontext = ''
): boolean {
    if (!settings.supportRealTimeGeolocation) return false;
    const geoHelperType = settings.geoHelperType;
    switch (geoHelperType) {
        case 'url': {
            const url =
                settings.geoHelperUrl +
                `?geoaction=${geoaction}&mvaction=${mvaction}&mvcontext=${mvcontext}`;
            new Notice('Asking GeoHelper URL for location');
            open(url);
            return true;
        }
        case 'app': {
            open(
                'geohelper://locate' +
                    `?geoaction=${geoaction}&mvaction=${mvaction}&mvcontext=${mvcontext}`
            );
            new Notice('Asking GeoHelper App for location');
            return true;
        }
        case 'commandline': {
            // We call in the format `command "url?params"`
            const url =
                settings.geoHelperCommand +
                ` "${settings.geoHelperUrl}?geoaction=${geoaction}&mvaction=${mvaction}&mvcontext=${mvcontext}"`;
            exec(url);
        }
    }
}
