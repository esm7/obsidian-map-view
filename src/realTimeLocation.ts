import * as leaflet from 'leaflet';
import { type PluginSettings } from 'src/settings';
import { isMobile } from 'src/utils';
import { App, Notice } from 'obsidian';
import { exec } from 'child_process';
import { MapContainer } from 'src/mapContainer';
import { REAL_TIME_LOCATION_STALE_MS } from 'src/consts';

export type RealTimeLocation = {
    center: leaflet.LatLng;
    accuracy: number;
    direction: number;
    timestamp: number;
};

let initialized = false;
let stopTrying = false;
let containers: MapContainer[] = [];
let watchId = 0;
let lastLocation: RealTimeLocation = null;
let stalenessCheckInterval: number | null = null;
let everReceivedLocation = false;

export function isSame(loc1: RealTimeLocation, loc2: RealTimeLocation) {
    if (loc1 === null && loc2 === null) return true;
    if (loc1 === null || loc2 === null) return false;
    return (
        loc1.center.distanceTo(loc2.center) < 1 &&
        loc1.accuracy == loc2.accuracy &&
        loc1.direction == loc2.direction
    );
}

function makeRealTimeLocation(position: GeolocationPosition) {
    const center = new leaflet.LatLng(
        position.coords.latitude,
        position.coords.longitude,
        position.coords.altitude,
    );
    return {
        center: center,
        accuracy: position.coords.accuracy,
        direction: position.coords.heading,
        timestamp: Date.now(),
    };
}

/* A single-time query for a location */
export async function askForLocation(
    app: App,
    settings: PluginSettings,
): Promise<RealTimeLocation | null> {
    if (!settings.supportRealTimeGeolocation) return null;
    return new Promise((resolve) => {
        new Notice('Waiting for location...');
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const location = makeRealTimeLocation(position);
                // Although this is not the continuous real-time update flow, and the actual goal of this function is to return a single location,
                // take the opportunity to update the open map containers about the location we established.
                onUpdate(position);
                resolve(location);
            },
            (error) => {
                new Notice('Map View failed to get location: ' + error.message);
                resolve(null);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 5000,
                timeout: 10000,
            },
        );
    });
}

export function initRealTimeLocation(
    app: App,
    settings: PluginSettings,
    mapContainer: MapContainer,
) {
    if (initialized || stopTrying) return;
    if (!navigator.geolocation) {
        console.log('Map View: this device does not support live geolocation.');
        return;
    }
    watchId = navigator.geolocation.watchPosition(onUpdate, onError, {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000,
    });

    initialized = true;
    startStalenessWatcher();
}

function onUpdate(position: GeolocationPosition) {
    const location = makeRealTimeLocation(position);
    lastLocation = location;
    everReceivedLocation = true;
    for (const container of containers) {
        container.setRealTimeLocation(location);
    }
}

function onError(error: GeolocationPositionError) {
    console.log('Map View real-time location error:', error.message);
    for (const container of containers) {
        container.setRealTimeLocation(null);
    }
    // If there's an error without we ever received a location, the platform is probably unable to provide the location
    // and we should not flood it with requests.
    // If it's a sporadic failure after a location existed previously, keep trying.
    if (!everReceivedLocation) {
        console.log(
            'Map View will stop querying the real-time location for this session.',
        );
        navigator.geolocation.clearWatch(watchId);
        stopTrying = true;
        stopStalenessWatcher();
    }
}

function startStalenessWatcher() {
    if (stalenessCheckInterval !== null) return;
    stalenessCheckInterval = window.setInterval(() => {
        if (lastLocation !== null) {
            const age = Date.now() - lastLocation.timestamp;
            if (age > REAL_TIME_LOCATION_STALE_MS) {
                console.log(
                    'Map View: Real-time location is stale, removing from all maps',
                );
                lastLocation = null;
                for (const container of containers) {
                    container.setRealTimeLocation(null);
                }
            }
        }
    }, 10000); // Check every 10 seconds
}

function stopStalenessWatcher() {
    if (stalenessCheckInterval !== null) {
        clearInterval(stalenessCheckInterval);
        stalenessCheckInterval = null;
    }
}

export function registerToLocationUpdates(
    app: App,
    settings: PluginSettings,
    mapContainer: MapContainer,
) {
    containers.push(mapContainer);
    initRealTimeLocation(app, settings, mapContainer);
    if (lastLocation) mapContainer.setRealTimeLocation(lastLocation);
}

export function unregisterLocationUpdates(mapContainer: MapContainer) {
    containers.remove(mapContainer);
    if (containers.length === 0) {
        if (watchId !== 0) {
            navigator.geolocation.clearWatch(watchId);
            initialized = false;
            stopStalenessWatcher();
        }
    }
}
