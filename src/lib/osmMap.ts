import L, { Map as LeafletMap, Marker as LeafletMarker, DivIcon } from 'leaflet';
import Supercluster from 'supercluster';
import type { GeoLocation, ImpulseLocation, MapAdapter, MapInstance } from '../types/map';
import { categoryColors } from './categoryColors';
import { getSmartIcon } from './smartIcon';

// Leaflet CSS подключен в src/index.css

// Интерфейс для точек кластеризации
interface ClusterPoint {
  type: 'Feature';
  properties: {
    cluster?: boolean;
    cluster_id?: number;
    point_count?: number;
    point_count_abbreviated?: string;
    category?: string;
    impulse?: ImpulseLocation;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
}

// Функция создания иконки кластера (Glassmorphism стиль)
function createClusterIcon(
  pointCount: number,
  dominantCategory?: string
): DivIcon {
  const size = Math.min(50 + pointCount * 3, 80); // Размер кластера зависит от количества точек
  const iconSize = Math.max(16, Math.min(pointCount.toString().length * 8, 24));
  
  // Получаем иконку самой популярной категории
  let categoryIcon = '📍';
  if (dominantCategory) {
    const iconData = getSmartIcon(dominantCategory);
    categoryIcon = iconData.emoji;
  }
  
  return L.divIcon({
    className: 'custom-cluster-marker',
    html: `
      <div class="cluster-container" style="
        width: ${size}px;
        height: ${size}px;
        background: rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1.5px solid rgba(255, 255, 255, 0.4);
        border-radius: 50%;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        animation: clusterPulse 2s ease-in-out infinite;
      ">
        <!-- Фоновое изображение иконки категории (размытое) -->
        ${dominantCategory ? `
          <div style="
            position: absolute;
            font-size: ${size * 0.4}px;
            opacity: 0.15;
            filter: blur(2px);
            z-index: 0;
          ">${categoryIcon}</div>
        ` : ''}
        
        <!-- Число событий в кластере -->
        <div style="
          font-size: ${iconSize}px;
          font-weight: bold;
          color: white;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
          z-index: 1;
          position: relative;
        ">${pointCount > 99 ? '99+' : pointCount}</div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Функция создания анимированного маркера события с эффектом пульсации
function createPulseMarkerIcon(
  color: string,
  iconEmoji: string,
  isActive: boolean = false,
  animationType: 'swing' | 'pulse' | 'beat' | 'flicker' | 'none' = 'pulse'
): DivIcon {
  const baseSize = isActive ? 24 : 20;
  const iconSize = isActive ? '14px' : '12px';
  
  // CSS анимация для иконки
  let iconAnimationCSS = '';
  switch (animationType) {
    case 'swing':
      iconAnimationCSS = 'animation: markerSwing 2s ease-in-out infinite;';
      break;
    case 'pulse':
      iconAnimationCSS = 'animation: markerPulse 1.5s ease-in-out infinite;';
      break;
    case 'beat':
      iconAnimationCSS = 'animation: markerBeat 1s ease-in-out infinite;';
      break;
    case 'flicker':
      iconAnimationCSS = 'animation: markerFlicker 2s ease-in-out infinite;';
      break;
    default:
      iconAnimationCSS = '';
  }
  
  return L.divIcon({
    className: `custom-pulse-marker ${isActive ? 'marker-active' : ''}`,
    html: `
      <div class="pulse-marker-container" style="
        position: relative;
        width: ${baseSize}px;
        height: ${baseSize}px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        animation: markerFadeIn 0.5s ease-out;
      ">
        <!-- Расходящиеся круги пульсации -->
        <div class="pulse-ring pulse-ring-1" style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: ${baseSize}px;
          height: ${baseSize}px;
          border: 2px solid ${color};
          border-radius: 50%;
          opacity: 0.6;
          pointer-events: none;
        "></div>
        <div class="pulse-ring pulse-ring-2" style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: ${baseSize}px;
          height: ${baseSize}px;
          border: 2px solid ${color};
          border-radius: 50%;
          opacity: 0.4;
          pointer-events: none;
        "></div>
        <div class="pulse-ring pulse-ring-3" style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: ${baseSize}px;
          height: ${baseSize}px;
          border: 2px solid ${color};
          border-radius: 50%;
          opacity: 0.2;
          pointer-events: none;
        "></div>
        
        <!-- Основной маркер -->
        <div style="
          width: ${baseSize}px;
          height: ${baseSize}px;
          background: ${color};
          border: 2.5px solid white;
          border-radius: 50%;
          box-shadow: 
            0 2px 8px rgba(0, 0, 0, 0.2),
            0 4px 16px ${color}40;
          position: relative;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        " class="marker-core">
          <span style="
            font-size: ${iconSize}; 
            line-height: 1; 
            filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
            display: inline-block;
            ${iconAnimationCSS}
          ">${iconEmoji}</span>
        </div>
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
      doubleClickZoom: true,
      scrollWheelZoom: true,
      touchZoom: true,
    });

    // Haptic feedback при перемещении карты
    let moveTimeout: ReturnType<typeof setTimeout> | null = null;
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
      }, 300);
    });

    // Linger Map Style: пастельные сочные цвета (бирюзовая вода, салатовая зелень)
    // Используем стандартные тайлы OSM, но с CSS фильтрами для пастельного сочного стиля
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '', // Пустая атрибуция (скрыта через CSS)
      maxZoom: 19,
      tileSize: 256,
      zoomOffset: 0,
      detectRetina: true,
      updateWhenZooming: true,
      updateWhenIdle: true,
      keepBuffer: 2,
    }).addTo(map);

    // Инициализация Supercluster для кластеризации
    const supercluster = new Supercluster({
      radius: 60, // Радиус кластера в пикселях
      maxZoom: 17, // Максимальный зум для кластеризации
      minZoom: 0,
      minPoints: 2, // Минимум 2 точки для кластера
      extent: 512,
      nodeSize: 64,
    });

    let markers: (LeafletMarker | L.LayerGroup)[] = [];
    let currentImpulses: ImpulseLocation[] = [];
    let currentOnClick: ((impulse: ImpulseLocation) => void) | null = null;
    let currentActiveCategory: string | null = null;
    let currentOnLongPress: ((impulse: ImpulseLocation) => void) | null = null;
    let selectionMarker: LeafletMarker | null = null;
    let locationSelectCallback: ((location: GeoLocation) => void) | null = null;
    let userLocationMarker: LeafletMarker | null = null;

    // Функция обновления кластеров и маркеров
    const updateClusters = () => {
      // Удаляем старые маркеры
      markers.forEach((m) => {
        if (m instanceof L.LayerGroup) {
          map.removeLayer(m);
        } else {
          m.remove();
        }
      });
      markers = [];

      // Фильтруем импульсы по категории
      const filteredImpulses = currentActiveCategory
        ? currentImpulses.filter(impulse => impulse.category === currentActiveCategory)
        : currentImpulses;

      if (filteredImpulses.length === 0) return;

      // Преобразуем импульсы в точки для Supercluster
      const points: ClusterPoint[] = filteredImpulses.map(impulse => ({
        type: 'Feature',
        properties: {
          category: impulse.category,
          impulse: impulse,
        },
        geometry: {
          type: 'Point',
          coordinates: [impulse.location_lng, impulse.location_lat], // [lng, lat] для GeoJSON
        },
      }));

      // Загружаем точки в Supercluster
      supercluster.load(points);

      // Получаем границы карты
      const bounds = map.getBounds();
      const bbox: [number, number, number, number] = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ];

      // Получаем кластеры и точки для текущего зума
      const clusters = supercluster.getClusters(bbox, map.getZoom());

      // Создаем маркеры для кластеров и точек
      clusters.forEach((clusterPoint) => {
        const [lng, lat] = clusterPoint.geometry.coordinates;
        const properties = clusterPoint.properties;

        if (properties.cluster) {
          // Это кластер
          const pointCount = properties.point_count || 0;
          
          // Определяем самую популярную категорию в кластере
          const expandedPoints = supercluster.getLeaves(clusterPoint.id as number, Infinity);
          const categoryCounts: Record<string, number> = {};
          expandedPoints.forEach((point: any) => {
            const category = point.properties.category || 'unknown';
            categoryCounts[category] = (categoryCounts[category] || 0) + 1;
          });
          
          const dominantCategory = Object.entries(categoryCounts)
            .sort(([, a], [, b]) => b - a)[0]?.[0];
          const clusterIcon = createClusterIcon(pointCount, dominantCategory);
          const clusterMarker = L.marker([lat, lng], { icon: clusterIcon });
          
          // При клике на кластер - приближаемся (flyTo) до распада на отдельные маркеры
          clusterMarker.on('click', () => {
            const expansionZoom = Math.min(
              supercluster.getClusterExpansionZoom(clusterPoint.id as number),
              18
            );
            map.flyTo([lat, lng], expansionZoom, {
              duration: 1.2,
              easeLinearity: 0.25,
            });
            
            // Haptic feedback
            if (window.Telegram?.WebApp?.HapticFeedback) {
              try {
                window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
              } catch (e) {
                // Игнорируем ошибки
              }
            }
          });
          
          clusterMarker.addTo(map);
          markers.push(clusterMarker);
        } else {
          // Это одиночная точка
          const impulse = properties.impulse as ImpulseLocation;
          if (!impulse) return;
          
          const color = categoryColors[impulse.category] || '#3498db';
          const smartIconData = getSmartIcon(impulse.content, impulse.category);
          const isActive = currentActiveCategory === impulse.category;
          
          const markerIcon = createPulseMarkerIcon(
            color,
            smartIconData.emoji,
            isActive,
            smartIconData.animationType
          );
          
          const marker = L.marker([lat, lng], { icon: markerIcon });
          
          // Анимация появления при загрузке (fade-in + slide-up)
          const markerElement = marker.getElement();
          if (markerElement) {
            markerElement.style.opacity = '0';
            markerElement.style.transform = 'translateY(10px)';
            setTimeout(() => {
              markerElement.style.transition = 'opacity 0.4s ease-out, transform 0.4s ease-out';
              markerElement.style.opacity = '1';
              markerElement.style.transform = 'translateY(0)';
            }, Math.random() * 200); // Небольшая случайная задержка для эффекта каскада
          }
          
          // Обработка длительного нажатия
          let longPressTimer: ReturnType<typeof setTimeout> | null = null;
          let isLongPress = false;
          let clickHandled = false;
          
          const handleStart = () => {
            isLongPress = false;
            clickHandled = false;
            longPressTimer = setTimeout(() => {
              isLongPress = true;
              clickHandled = true;
              // Вызываем обработчик длительного нажатия, если есть
              if (currentOnLongPress) {
                currentOnLongPress(impulse);
                // Haptic feedback при длительном нажатии
                if (window.Telegram?.WebApp?.HapticFeedback) {
                  try {
                    window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                  } catch (e) {
                    // Игнорируем ошибки
                  }
                }
              }
            }, 600);
          };
          
          const handleEnd = () => {
            if (longPressTimer) {
              clearTimeout(longPressTimer);
              longPressTimer = null;
            }
          };
          
          // Обработка клика (только если не было длительного нажатия)
          marker.on('click', () => {
            if (!clickHandled && !isLongPress && currentOnClick) {
              currentOnClick(impulse);
              
              // Haptic feedback
              if (window.Telegram?.WebApp?.HapticFeedback) {
                try {
                  window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                } catch (e) {
                  // Игнорируем ошибки
                }
              }
            }
            // Сбрасываем флаги после обработки клика
            setTimeout(() => {
              isLongPress = false;
              clickHandled = false;
            }, 100);
          });
          
          marker.on('mousedown', handleStart);
          marker.on('mouseup', handleEnd);
          marker.on('mouseleave', handleEnd);
          
          // Для touch устройств
          if (markerElement) {
            markerElement.addEventListener('touchstart', handleStart, { passive: true });
            markerElement.addEventListener('touchend', handleEnd, { passive: true });
            markerElement.addEventListener('touchcancel', handleEnd, { passive: true });
          }
          
          // Плавное увеличение при наведении/нажатии (scale 1.2)
          if (markerElement) {
            const markerCore = markerElement.querySelector('.marker-core') as HTMLElement;
            
            markerElement.addEventListener('mouseenter', () => {
              if (markerCore) {
                markerCore.style.transform = 'scale(1.2)';
              }
            });
            
            markerElement.addEventListener('mouseleave', () => {
              if (markerCore) {
                markerCore.style.transform = 'scale(1)';
              }
            });
            
            // Для touch устройств
            markerElement.addEventListener('touchstart', () => {
              if (markerCore) {
                markerCore.style.transform = 'scale(1.2)';
              }
            }, { passive: true });
            
            markerElement.addEventListener('touchend', () => {
              if (markerCore) {
                markerCore.style.transform = 'scale(1)';
              }
            }, { passive: true });
          }
          
          marker.addTo(map);
          markers.push(marker);
        }
      });
    };

    // Обновляем кластеры при изменении зума и границ карты
    map.on('zoomend', updateClusters);
    map.on('moveend', updateClusters);

    const instance: MapInstance = {
      destroy() {
        markers.forEach((m) => {
          if (m instanceof L.LayerGroup) {
            map.removeLayer(m);
          } else {
            m.remove();
          }
        });
        markers = [];
        if (userLocationMarker) {
          userLocationMarker.remove();
          userLocationMarker = null;
        }
        if (selectionMarker) {
          selectionMarker.remove();
          selectionMarker = null;
        }
        map.remove();
      },
      setMarkers(impulses: ImpulseLocation[], onClick, activeCategory?: string | null, _nearestEventId?: number, onLongPress?: (impulse: ImpulseLocation) => void) {
        currentImpulses = impulses;
        currentOnClick = onClick;
        currentActiveCategory = activeCategory || null;
        currentOnLongPress = onLongPress || null;
        
        // Обновляем кластеры
        updateClusters();
      },
      flyTo(location: GeoLocation, zoom: number = 15, duration: number = 1.8) {
        map.flyTo([location.lat, location.lng], zoom, {
          duration: duration,
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
        map.invalidateSize();
      },
      setUserLocation(location: GeoLocation | null) {
        if (userLocationMarker) {
          userLocationMarker.remove();
          userLocationMarker = null;
        }
        
        if (location) {
          // Улучшенный индикатор текущего местоположения (яркая светящаяся синяя точка)
          const userLocationIcon = L.divIcon({
            className: 'user-location-marker-linger',
            html: `
              <div class="user-location-pulse-container" style="
                width: 24px;
                height: 24px;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
              ">
                <!-- Расходящиеся кольца пульсации для индикатора пользователя -->
                <div class="user-pulse-ring user-pulse-ring-1"></div>
                <div class="user-pulse-ring user-pulse-ring-2"></div>
                <div class="user-pulse-ring user-pulse-ring-3"></div>
                
                <!-- Основной индикатор -->
                <div style="
                  width: 24px;
                  height: 24px;
                  background: #3b82f6;
                  border: 3px solid white;
                  border-radius: 50%;
                  box-shadow: 
                    0 0 0 4px rgba(59, 130, 246, 0.5),
                    0 0 0 8px rgba(59, 130, 246, 0.3),
                    0 0 0 12px rgba(59, 130, 246, 0.2),
                    0 4px 20px rgba(59, 130, 246, 0.7);
                  position: relative;
                  z-index: 10;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                ">
                  <div style="
                    width: 10px;
                    height: 10px;
                    background: white;
                    border-radius: 50%;
                    box-shadow: 0 0 10px rgba(255, 255, 255, 0.9);
                  "></div>
                </div>
              </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });
          
          userLocationMarker = L.marker([location.lat, location.lng], {
            icon: userLocationIcon,
            interactive: false,
            zIndexOffset: 2000, // Всегда сверху всех маркеров и кластеров
            bubblingMouseEvents: false,
          }).addTo(map);
          
          // Добавляем haptic feedback при "приземлении" камеры
          setTimeout(() => {
            if (window.Telegram?.WebApp?.HapticFeedback) {
              try {
                window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
              } catch (e) {
                // Игнорируем ошибки
              }
            }
          }, 1800); // После завершения flyTo
        }
      },
      setLocationSelectMode(enabled: boolean, onSelect: (location: GeoLocation) => void) {
        locationSelectCallback = enabled ? onSelect : null;

        if (enabled) {
          map.doubleClickZoom.disable();
          map.on('click', (e) => {
            const { lat, lng } = e.latlng;
            const location: GeoLocation = { lat, lng };

            if (selectionMarker) {
              selectionMarker.remove();
            }

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

            if (locationSelectCallback) {
              locationSelectCallback(location);
            }
          });
        } else {
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
