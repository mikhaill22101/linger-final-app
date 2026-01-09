import L, { Map as LeafletMap, Marker as LeafletMarker, DivIcon } from 'leaflet';
import type { GeoLocation, ImpulseLocation, MapAdapter, MapInstance } from '../types/map';
import { categoryColors } from './categoryColors';

// Leaflet CSS подключен в src/index.css

// Функция создания иконки маркера (яркие с градиентным свечением и эффектом левитации)
function createMarkerIcon(color: string, isActive: boolean, isNearest: boolean = false, size: number = 20): DivIcon {
  // Маленькие маркеры по умолчанию, крупные только при клике
  const baseSize = isActive ? size : 12; // 12px для обычных, 20px для активных
  const shadowSize = isActive ? 25 : 10;
  const activeClass = isActive ? 'marker-active active-glow' : '';
  const nearestClass = isNearest ? 'marker-nearest pulse-glow' : '';
  
  // Градиентное свечение в зависимости от категории
  const glowColor = color;
  const glowIntensity = isActive ? 1.5 : 0.8;
  
  return L.divIcon({
    className: `custom-marker ${activeClass} ${nearestClass}`,
    html: `
      <div class="${activeClass} ${nearestClass}" style="
        width: ${baseSize}px;
        height: ${baseSize}px;
        background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.9), ${color});
        border: ${isActive ? '3px solid white' : '2px solid rgba(255, 255, 255, 0.9)'};
        border-radius: 50%;
        box-shadow: 
          0 0 ${shadowSize * glowIntensity}px ${glowColor},
          0 0 ${shadowSize * 1.5 * glowIntensity}px ${glowColor},
          0 0 ${shadowSize * 2 * glowIntensity}px ${glowColor},
          0 4px 12px rgba(0, 0, 0, 0.3);
        transition: all 0.3s ease;
        position: relative;
        cursor: pointer;
        transform: translateY(-2px);
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
      "></div>
    `,
    iconSize: [baseSize, baseSize],
    iconAnchor: [baseSize / 2, baseSize / 2],
  });
}

export const osmMapAdapter: MapAdapter = {
  async initMap(container: HTMLDivElement, center: GeoLocation, zoom: number = 14): Promise<MapInstance> {
    // Создаем карту без кнопок масштаба (только жесты)
    const map: LeafletMap = L.map(container, {
      center: [center.lat, center.lng],
      zoom: zoom,
      zoomControl: false, // Убираем кнопки масштаба
      doubleClickZoom: true, // Двойной клик для зума
      scrollWheelZoom: true, // Колесико мыши для зума
      touchZoom: true, // Жесты для зума на мобильных
    });

    // Haptic feedback при перемещении карты
    let moveTimeout: NodeJS.Timeout | null = null;
    map.on('moveend', () => {
      if (moveTimeout) {
        clearTimeout(moveTimeout);
      }
      moveTimeout = setTimeout(() => {
        if (window.Telegram?.WebApp?.HapticFeedback) {
          try {
            window.Telegram.WebApp.HapticFeedback.selectionChanged();
          } catch (e) {
            // Игнорируем ошибки haptic feedback
          }
        }
      }, 300); // Небольшая задержка, чтобы не спамить
    });

    // Добавляем стандартные тайлы OpenStreetMap с POI (магазины, рестораны и т.д.)
    // CSS фильтры увеличат яркость и насыщенность для сохранения яркого стиля
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
      setMarkers(impulses: ImpulseLocation[], onClick, activeCategory?: string | null, nearestEventId?: number) {
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
          const isNearest = nearestEventId === impulse.id;
          const color = categoryColors[categoryName] || '#3498db';
          
          const icon = createMarkerIcon(color, isActive, isNearest);
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
            map.flyTo([lat, lng], map.getZoom() > 15 ? map.getZoom() : 16);

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
