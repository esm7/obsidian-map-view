import * as leaflet from 'leaflet';
import { type TileSource } from './settings';

const a = 6378245.0;
const ee = 0.00669342162296594323;

function outOfChina(lat: number, lon: number): boolean {
    if (lon < 72.004 || lon > 137.8347) return true;
    if (lat < 0.8293 || lat > 55.8271) return true;
    return false;
}

function transformLat(x: number, y: number): number {
    let ret =
        -100.0 +
        2.0 * x +
        3.0 * y +
        0.2 * y * y +
        0.1 * x * y +
        0.2 * Math.sqrt(Math.abs(x));
    ret +=
        ((20.0 * Math.sin(6.0 * x * Math.PI) +
            20.0 * Math.sin(2.0 * x * Math.PI)) *
            2.0) /
        3.0;
    ret +=
        ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) *
            2.0) /
        3.0;
    ret +=
        ((160.0 * Math.sin((y / 12.0) * Math.PI) +
            320 * Math.sin((y * Math.PI) / 30.0)) *
            2.0) /
        3.0;
    return ret;
}

function transformLon(x: number, y: number): number {
    let ret =
        300.0 +
        x +
        2.0 * y +
        0.1 * x * x +
        0.1 * x * y +
        0.1 * Math.sqrt(Math.abs(x));
    ret +=
        ((20.0 * Math.sin(6.0 * x * Math.PI) +
            20.0 * Math.sin(2.0 * x * Math.PI)) *
            2.0) /
        3.0;
    ret +=
        ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) *
            2.0) /
        3.0;
    ret +=
        ((150.0 * Math.sin((x / 12.0) * Math.PI) +
            300.0 * Math.sin((x / 30.0) * Math.PI)) *
            2.0) /
        3.0;
    return ret;
}

function wgs84ToGcj02(wgLat: number, wgLon: number): [number, number] {
    if (outOfChina(wgLat, wgLon)) {
        return [wgLat, wgLon];
    }
    let dLat = transformLat(wgLon - 105.0, wgLat - 35.0);
    let dLon = transformLon(wgLon - 105.0, wgLat - 35.0);
    let radLat = (wgLat / 180.0) * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    let sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
    dLon = (dLon * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);
    return [wgLat + dLat, wgLon + dLon];
}

function gcj02ToWgs84(gcjLat: number, gcjLon: number): [number, number] {
    if (outOfChina(gcjLat, gcjLon)) {
        return [gcjLat, gcjLon];
    }
    let dLat = transformLat(gcjLon - 105.0, gcjLat - 35.0);
    let dLon = transformLon(gcjLon - 105.0, gcjLat - 35.0);
    let radLat = (gcjLat / 180.0) * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    let sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
    dLon = (dLon * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);
    return [gcjLat - dLat, gcjLon - dLon];
}

export function isAutoNaviMapSource(mapSource: TileSource): boolean {
    if (!mapSource) return false;
    const name = mapSource.name?.toLowerCase() || '';
    const urlLight = mapSource.urlLight?.toLowerCase() || '';
    const urlDark = mapSource.urlDark?.toLowerCase() || '';
    return (
        name.includes('高德') ||
        name.includes('autonavi') ||
        name.includes('gaode') ||
        urlLight.includes('autonavi.com') ||
        urlDark.includes('autonavi.com')
    );
}

export function transformToDisplay(
    location: leaflet.LatLng,
    mapSource: TileSource,
): leaflet.LatLng {
    if (!isAutoNaviMapSource(mapSource)) return location;
    const [lat, lng] = wgs84ToGcj02(location.lat, location.lng);
    return new leaflet.LatLng(lat, lng);
}

export function transformFromDisplay(
    location: leaflet.LatLng,
    mapSource: TileSource,
): leaflet.LatLng {
    if (!isAutoNaviMapSource(mapSource)) return location;
    const [lat, lng] = gcj02ToWgs84(location.lat, location.lng);
    return new leaflet.LatLng(lat, lng);
}

function transformGeoJsonCoords(
    geojson: any,
    direction: 'forward' | 'reverse',
): any {
    if (!geojson) return geojson;
    const result = JSON.parse(JSON.stringify(geojson));

    const transformCoords = (coords: any): any => {
        if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
            const lat = coords[1];
            const lon = coords[0];
            if (outOfChina(lat, lon)) return [coords[0], coords[1]];
            const [tLat, tLon] =
                direction === 'forward'
                    ? wgs84ToGcj02(lat, lon)
                    : gcj02ToWgs84(lat, lon);
            return [tLon, tLat];
        } else if (Array.isArray(coords[0])) {
            return coords.map(transformCoords);
        }
        return coords;
    };

    const processGeometry = (geometry: any) => {
        if (geometry && geometry.coordinates) {
            geometry.coordinates = transformCoords(geometry.coordinates);
        }
    };

    if (result.type === 'Feature') {
        processGeometry(result.geometry);
    } else if (result.type === 'FeatureCollection') {
        result.features?.forEach((feature: any) => {
            processGeometry(feature.geometry);
        });
    } else {
        processGeometry(result);
    }

    return result;
}

export function transformGeoJsonToDisplay(
    geojson: any,
    mapSource: TileSource,
): any {
    if (!isAutoNaviMapSource(mapSource)) return geojson;
    return transformGeoJsonCoords(geojson, 'forward');
}

export function transformGeoJsonFromDisplay(
    geojson: any,
    mapSource: TileSource,
): any {
    if (!isAutoNaviMapSource(mapSource)) return geojson;
    return transformGeoJsonCoords(geojson, 'reverse');
}
