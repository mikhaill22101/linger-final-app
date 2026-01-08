import type { GeoLocation, ImpulseLocation, MapAdapter, MapInstance } from '../types/map';

// Глобальный объект 2ГИС
declare global {
  interface Window {
    DG?: any;
  }
}

function load2GisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.DG) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[src*="maps.api.2gis"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load 2GIS script')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://maps.api.2gis.ru/2.0/loader.js?pkg=full';
    script.async = true;
    script.onload = () => {
      if (!window.DG) {
        reject(new Error('2GIS DG object not available after script load'));
        return;
      }
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load 2GIS script'));
    document.head.appendChild(script);
  });
}

export const twoGisMapAdapter: MapAdapter = {
  async initMap(container: HTMLDivElement, center: GeoLocation): Promise<MapInstance> {
    await load2GisScript();

    return new Promise<MapInstance>((resolve, reject) => {
      if (!window.DG) {
        reject(new Error('2GIS DG object is not available'));
        return;
      }

      window.DG.then((DG: any) => {
        const map = DG.map(container, {
          center: [center.lat, center.lng],
          zoom: 13,
        });

        let markers: any[] = [];

        const instance: MapInstance = {
          destroy() {
            markers.forEach((m) => m.remove());
            markers = [];
            map.remove();
          },
          setMarkers(impulses: ImpulseLocation[], onClick) {
            // очистка старых маркеров
            markers.forEach((m) => m.remove());
            markers = [];

            impulses.forEach((impulse) => {
              const marker = DG.marker([impulse.location_lat, impulse.location_lng]).addTo(map);
              marker.on('click', () => onClick(impulse));
              markers.push(marker);
            });
          },
        };

        resolve(instance);
      }).catch((err: unknown) => {
        reject(err instanceof Error ? err : new Error('Unknown 2GIS init error'));
      });
    });
  },
};
