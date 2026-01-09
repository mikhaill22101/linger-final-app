import L, { Map as LeafletMap, Marker as LeafletMarker, DivIcon } from 'leaflet';
import type { GeoLocation, ImpulseLocation, MapAdapter, MapInstance } from '../types/map';
import { categoryColors } from './categoryColors';

// Leaflet CSS подключен в src/index.css

// Функция создания иконки маркера
function createMarkerIcon(color: string, isActive: boolean, size: number = 20): DivIcon {
  const baseSize = size;
  const shadowSize = isActive ? 20 : 10;
  const activeClass = isActive ? 'marker-active active-glow' : '';
  
  return L.divIcon({
    className: `custom-marker ${activeClass}`,
    html: `
      <div class="${activeClass}" style="
        width: ${baseSize}px;
        height: ${baseSize}px;
        background-color: ${color};
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 0 ${shadowSize}px ${color}, 0 0 ${shadowSize * 1.5}px ${color};
        transition: all 0.3s ease;
        position: relative;
        color: ${color};
      "></div>
    `,
    iconSize: [baseSize, baseSize],
    iconAnchor: [baseSize / 2, baseSize / 2],
  });
}

export const osmMapAdapter: MapAdapter = {
  async initMap(container: HTMLDivElement, center: GeoLocation, zoom: number = 14): Promise<MapInstance> {
    // Создаем карту
    const map: LeafletMap = L.map(container, {
      center: [center.lat, center.lng],
      zoom: zoom,
      zoomControl: true,
    });

    // Добавляем тайлы OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    let markers: LeafletMarker[] = [];
    let currentActiveCategory: string | null = null;
    let currentImpulses: ImpulseLocation[] = [];
    let currentOnClick: ((impulse: ImpulseLocation) => void) | null = null;
    let selectionMarker: LeafletMarker | null = null;
    let locationSelectCallback: ((location: GeoLocation) => void) | null = null;
    let isSelectionMode = false;

    const instance: MapInstance = {
      destroy() {
        markers.forEach((m) => m.remove());
        markers = [];
        map.remove();
      },
      setMarkers(impulses: ImpulseLocation[], onClick, activeCategory?: string | null) {
        // Сохраняем данные
        currentImpulses = impulses;
        currentOnClick = onClick;
        currentActiveCategory = activeCategory || null;

        // Фильтруем по категории, если выбрана
        const filteredImpulses = currentActiveCategory
          ? impulses.filter(impulse => impulse.category === currentActiveCategory)
          : impulses;

        // Удаляем старые маркеры
        markers.forEach((m) => m.remove());
        markers = [];

        // Создаем новые маркеры
        filteredImpulses.forEach((impulse) => {
          const categoryName = impulse.category;
          const isActive = currentActiveCategory === categoryName;
          const color = categoryColors[categoryName] || '#3498db';
          
          const icon = createMarkerIcon(color, isActive);
          const marker = L.marker([impulse.location_lat, impulse.location_lng], { icon }).addTo(map);
          
          marker.on('click', () => {
            if (currentOnClick) {
              currentOnClick(impulse);
            }
          });
          markers.push(marker);
        });
      },
      flyTo(location: GeoLocation, zoom: number = 15) {
        map.flyTo([location.lat, location.lng], zoom, {
          duration: 1.0,
          easeLinearity: 0.25,
        });
      },
      getBounds() {
        const bounds = map.getBounds();
        if (bounds) {
          return {
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest(),
          };
        }
        return null;
      },
      invalidateSize() {
        // Принудительный пересчет размеров карты Leaflet
        map.invalidateSize();
      },
      setLocationSelectMode(enabled: boolean, onSelect: (location: GeoLocation) => void) {
        isSelectionMode = enabled;
        locationSelectCallback = enabled ? onSelect : null;

        if (enabled) {
          // Включаем режим выбора
          map.doubleClickZoom.disable();
          map.on('click', (e) => {
            const { lat, lng } = e.latlng;
            const location: GeoLocation = { lat, lng };

            // Удаляем предыдущий маркер выбора
            if (selectionMarker) {
              selectionMarker.remove();
            }

            // Создаем новый маркер выбора (временный)
            const selectionIcon = L.divIcon({
              className: 'selection-marker',
              html: `
                <div style="
                  width: 24px;
                  height: 24px;
                  background-color: #f44336;
                  border: 3px solid white;
                  border-radius: 50%;
                  box-shadow: 0 0 20px rgba(244, 67, 54, 0.8);
                  animation: pulse 1.5s ease-in-out infinite;
                "></div>
              `,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            });

            selectionMarker = L.marker([lat, lng], { icon: selectionIcon }).addTo(map);
            map.flyTo([lat, lng], map.getZoom() > 15 ? map.getZoom() : 15);

            // Вызываем коллбэк
            if (locationSelectCallback) {
              locationSelectCallback(location);
            }
          });
        } else {
          // Отключаем режим выбора
          map.doubleClickZoom.enable();
          map.off('click');
          if (selectionMarker) {
            selectionMarker.remove();
            selectionMarker = null;
          }
          locationSelectCallback = null;
        }
      },
    };

    return instance;
  },
};
