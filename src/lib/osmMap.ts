import L, { Map as LeafletMap, Marker as LeafletMarker, Icon, DivIcon } from 'leaflet';
import type { GeoLocation, ImpulseLocation, MapAdapter, MapInstance } from '../types/map';
import { categoryColors } from './categoryColors';

// Leaflet CSS подключен в src/index.css

// Функция для создания кастомной иконки маркера с цветом и анимацией
function createMarkerIcon(color: string, isActive: boolean, size: number = 20): DivIcon {
  const baseSize = size;
  // Для активных маркеров используем CSS анимацию, размер контролируется через transform
  const shadowSize = isActive ? 20 : 10;
  
  return L.divIcon({
    className: `custom-marker ${isActive ? 'marker-active' : ''}`,
    html: `
      <div style="
        width: ${baseSize}px;
        height: ${baseSize}px;
        background-color: ${color};
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 0 ${shadowSize}px ${color}, 0 0 ${shadowSize * 1.5}px ${color};
        transition: transform 0.3s ease, box-shadow 0.3s ease;
        position: relative;
        color: ${color};
      "></div>
    `,
    iconSize: [baseSize, baseSize],
    iconAnchor: [baseSize / 2, baseSize / 2],
  });
}

export const osmMapAdapter: MapAdapter = {
  async initMap(container: HTMLDivElement, center: GeoLocation): Promise<MapInstance> {
    const map: LeafletMap = L.map(container).setView([center.lat, center.lng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    let markers: LeafletMarker[] = [];
    let currentActiveCategory: string | null = null;

    const instance: MapInstance = {
      destroy() {
        markers.forEach((m) => m.remove());
        markers = [];
        map.remove();
      },
      setMarkers(impulses: ImpulseLocation[], onClick, activeCategory?: string | null) {
        // Удаляем старые маркеры
        markers.forEach((m) => m.remove());
        markers = [];
        
        currentActiveCategory = activeCategory || null;

        // Создаем новые маркеры с цветами и анимацией
        impulses.forEach((impulse) => {
          const categoryName = impulse.category;
          const isActive = currentActiveCategory === categoryName;
          const color = categoryColors[categoryName] || '#3498db'; // Цвет по умолчанию
          
          const icon = createMarkerIcon(color, isActive);
          const marker = L.marker([impulse.location_lat, impulse.location_lng], { icon }).addTo(map);
          
          marker.on('click', () => onClick(impulse));
          markers.push(marker);
        });
      },
      setActiveCategory(category: string | null) {
        currentActiveCategory = category;
        // Обновляем все маркеры с новым состоянием активности
        markers.forEach((marker, index) => {
          // Находим соответствующий импульс (нужно хранить их отдельно)
          // Для упрощения, пересоздадим маркеры
        });
      },
    };

    return instance;
  },
};
