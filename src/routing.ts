import { MapContainer } from 'src/mapContainer';
import MapViewPlugin from 'src/main';
import { type PluginSettings } from 'src/settings';
import * as leaflet from 'leaflet';
import { request, Notice } from 'obsidian';
import { type GeoJSON } from 'geojson';

type RoutingProvider = 'graphhopper';

type RoutingParams = {
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

export async function doRouting(
    from: leaflet.LatLng,
    to: leaflet.LatLng,
    provider: RoutingProvider,
    params: RoutingParams,
    map: MapContainer,
    settings: PluginSettings,
) {
    if (!settings.routingGraphHopperApiKey) {
        new Notice('请先在设置中提供 GraphHopper API 密钥。');
        return;
    }
    try {
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
            !result.paths[0]?.points ||
            result.paths[0].points.length > 0
        ) {
            new Notice('路由结果为空');
            console.error('Routing result:', result);
            return;
        }
        const path: any = result.paths[0];
        const routingResult: RoutingResult = {
            profileUsed: params.profile,
            distanceMeters: path?.distance,
            timeMinutes: path?.time / 1000 / 60,
            totalAscentMeters: path?.ascend,
            totalDescentMeters: path?.descend,
            path: path.points as GeoJSON,
        };
        map.addFloatingRoute(routingResult);
    } catch (e) {
        new Notice('路由错误，详情请查看日志。');
        console.error('Routing error:', e);
    }
}
