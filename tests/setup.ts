import * as leaflet from 'leaflet';

// Set up global L (Leaflet) reference needed by leaflet-extra-markers and markerIcons.ts
(globalThis as any).L = leaflet;
