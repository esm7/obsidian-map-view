import * as leaflet from 'leaflet';

// Stub for leaflet-extra-markers - extends leaflet with ExtraMarkers namespace
// Use try-catch in case ExtraMarkers was already defined as non-configurable
const extraMarkersStub = {
    icon: (options: any) => ({
        createIcon: () => null,
        createShadow: () => null,
        options,
    }),
};

try {
    (leaflet as any).ExtraMarkers = extraMarkersStub;
} catch {
    // Already defined as non-writable; ignore
}

export default {};
