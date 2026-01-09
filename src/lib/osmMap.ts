import L, { Map as LeafletMap, Marker as LeafletMarker, DivIcon } from 'leaflet';
import type { GeoLocation, ImpulseLocation, MapAdapter, MapInstance } from '../types/map';
import { categoryColors } from './categoryColors';
import { getSmartIcon } from './smartIcon';

// Leaflet CSS подключен в src/index.css

// Функция создания иконки маркера (яркие с градиентным свечением, эффектом левитации и анимированной иконкой внутри)
function createMarkerIcon(
  color: string, 
  isActive: boolean, 
  isNearest: boolean = false, 
  iconEmoji: string = '✨', 
  size: number = 20,
  animationType: 'swing' | 'pulse' | 'beat' | 'flicker' | 'none' = 'none'
): DivIcon {
  // Маленькие маркеры по умолчанию, крупные только при клике
  const baseSize = isActive ? size : 16; // 16px для обычных (чтобы поместилась иконка), 20px для активных
  const shadowSize = isActive ? 25 : 10;
  const activeClass = isActive ? 'marker-active active-glow' : '';
  const nearestClass = isNearest ? 'marker-nearest pulse-glow' : '';
  
  // Градиентное свечение в зависимости от категории
  const glowColor = color;
  const glowIntensity = isActive ? 1.5 : 0.8;
  
  // Размер иконки внутри маркера
  const iconSize = isActive ? '14px' : '10px';
  
  // CSS анимация в зависимости от типа
  let animationCSS = '';
  switch (animationType) {
    case 'swing':
      animationCSS = 'animation: markerSwing 2s ease-in-out infinite;';
      break;
    case 'pulse':
      animationCSS = 'animation: markerPulse 1.5s ease-in-out infinite;';
      break;
    case 'beat':
      animationCSS = 'animation: markerBeat 1s ease-in-out infinite;';
      break;
    case 'flicker':
      animationCSS = 'animation: markerFlicker 2s ease-in-out infinite;';
      break;
    default:
      animationCSS = '';
  }
  
  // Zenly Style: круглые маркеры с яркой заливкой, белой обводкой и мягкой тенью
  return L.divIcon({
    className: `custom-marker zenly-marker ${activeClass} ${nearestClass} marker-animated-${animationType}`,
    html: `
      <div class="${activeClass} ${nearestClass}" style="
        width: ${baseSize}px;
        height: ${baseSize}px;
        background: ${color};
        border: ${isActive ? '3px solid white' : '2.5px solid white'};
        border-radius: 50%;
        box-shadow: 
          0 2px 8px rgba(0, 0, 0, 0.15),
          0 4px 16px rgba(0, 0, 0, 0.1),
          0 0 0 1px rgba(255, 255, 255, 0.3);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        cursor: pointer;
        transform: translateY(-2px);
        filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2));
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <span style="
          font-size: ${iconSize}; 
          line-height: 1; 
          filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
          display: inline-block;
          ${animationCSS}
        ">${iconEmoji}</span>
      </div>
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
    // Атрибуция отключена через CSS для скрытия флага Украины
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '', // Пустая атрибуция, так как она скрыта через CSS
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
          
          // Интеллектуальная иконка на основе текста события
          const smartIconData = getSmartIcon(impulse.content, categoryName);
          
          const icon = createMarkerIcon(color, isActive, isNearest, smartIconData.emoji, 20, smartIconData.animationType);
          const marker = L.marker([impulse.location_lat, impulse.location_lng], { icon }).addTo(map);
          
          marker.on('click', () => {
            if (currentOnClick) {
              currentOnClick(impulse);
            }
            // Тактильная отдача при клике на анимированный маркер
            if (window.Telegram?.WebApp?.HapticFeedback) {
              try {
                window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
              } catch (e) {
                // Игнорируем ошибки haptic feedback
              }
            }
          });
          markers.push(marker);
        });
      },
      flyTo(location: GeoLocation, zoom: number = 15, duration: number = 1.8) {
        // Zenly Style: плавный полет с кривой безье ease-in-out для максимальной плавности
        map.flyTo([location.lat, location.lng], zoom, {
          duration: duration, // 1.8 секунды для эффекта "как в кино"
          easeLinearity: 0.25, // Кривая безье для максимальной плавности (как в Zenly)
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
