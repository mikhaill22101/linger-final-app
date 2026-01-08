import L, { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import type { GeoLocation, ImpulseLocation, MapAdapter, MapInstance } from '../types/map';

// Leaflet CSS подключен в src/index.css

export const osmMapAdapter: MapAdapter = {
  async initMap(container: HTMLDivElement, center: GeoLocation): Promise<MapInstance> {
    const map: LeafletMap = L.map(container).setView([center.lat, center.lng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    let markers: LeafletMarker[] = [];

    const instance: MapInstance = {
      destroy() {
        markers.forEach((m) => m.remove());
        markers = [];
        map.remove();
      },
      setMarkers(impulses: ImpulseLocation[], onClick) {
        markers.forEach((m) => m.remove());
        markers = [];

        impulses.forEach((impulse) => {
          const marker = L.marker([impulse.location_lat, impulse.location_lng]).addTo(map);
          marker.on('click', () => onClick(impulse));
          markers.push(marker);
        });
      },
    };

    return instance;
  },
};
