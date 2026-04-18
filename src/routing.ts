import { MapContainer } from 'src/mapContainer';
import MapViewPlugin from 'src/main';
import { type PluginSettings } from 'src/settings';
import * as leaflet from 'leaflet';
import { request, Notice } from 'obsidian';
import { type GeoJSON } from 'geojson';

type RoutingProvider = 'graphhopper';

export type RoutingParams = {
    profile: string;
};

export type RoutingResult = {
    profileUsed: string;
    distanceMeters: number;
    timeMinutes: number;
    totalAscentMeters: number;
    totalDescentMeters: number;
    path: GeoJSON;
};

export async function calcRoute(
    from: leaflet.LatLng,
    to: leaflet.LatLng,
    provider: RoutingProvider,
    params: RoutingParams,
    settings: PluginSettings,
): Promise<RoutingResult> {
    if (!settings.routingGraphHopperApiKey) {
        throw new Error(
            'No GraphHopper API key configured in Map View settings.',
        );
    }
    const requestBody = {
        profile: params.profile,
        points: [
            [from.lng, from.lat],
            [to.lng, to.lat],
        ],
        instructions: false,
        points_encoded: false,
        elevation: true,
        ...settings.routingGraphHopperExtra,
    };
    const resultContent: any = await request({
        url: `https://graphhopper.com/api/1/route?key=${settings.routingGraphHopperApiKey}`,
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
            'Content-Type': 'application/json',
        },
    });
    const result = JSON.parse(resultContent);
    if (
        !result?.paths ||
        result.paths.length === 0 ||
        !result.paths[0]?.points
    ) {
        console.error('Routing result:', result);
        throw new Error('Empty or invalid routing result from provider.');
    }
    const path: any = result.paths[0];
    return {
        profileUsed: params.profile,
        distanceMeters: path?.distance,
        timeMinutes: path?.time / 1000 / 60,
        totalAscentMeters: path?.ascend,
        totalDescentMeters: path?.descend,
        path: path.points as GeoJSON,
    };
}

export async function doRouting(
    from: leaflet.LatLng,
    to: leaflet.LatLng,
    provider: RoutingProvider,
    params: RoutingParams,
    map: MapContainer,
    settings: PluginSettings,
) {
    if (!settings.routingGraphHopperApiKey) {
        new Notice(
            'You must first provide a GraphHopper API key in the settings.',
        );
        return;
    }
    try {
        const routingResult = await calcRoute(
            from,
            to,
            provider,
            params,
            settings,
        );
        map.addFloatingRoute(routingResult);
    } catch (e) {
        new Notice('Routing error, see log for more details.');
        console.error('Routing error:', e);
    }
}
