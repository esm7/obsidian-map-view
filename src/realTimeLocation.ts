import * as leaflet from 'leaflet';

export type RealTimeLocationSource = 'geohelper';
export type RealTimeLocation = {
	center: leaflet.LatLng;
	accuracy: number;
	source: RealTimeLocationSource;
	timestamp: number;
};

export function isSame(loc1: RealTimeLocation, loc2: RealTimeLocation) {
	if (loc1 === null && loc2 === null)
		return true;
	if (loc1 === null || loc2 === null)
		return false;
	return loc1.center.distanceTo(loc2.center) < 1 && loc1.accuracy == loc2.accuracy;
}
