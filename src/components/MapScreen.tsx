import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import type { GeoLocation, ImpulseLocation, MapInstance } from '../types/map';
import { osmMapAdapter } from '../lib/osmMap';

interface ImpulseRow {
  id: number;
  content: string;
  category: string;
  creator_id: number;
  created_at: string;
  location_lat: number | null;
  location_lng: number | null;
}

type MapStatus = 'loading' | 'ready' | 'error';

// Резервная локация: Озеро Разлив, Сестрорецк
const DEFAULT_LOCATION: GeoLocation = {
  lat: 60.0712,
  lng: 29.9694,
};

// Функция получения геопозиции с таймаутом 3 секунды
function getUserLocation(): Promise<GeoLocation> {
  return new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log('[getUserLocation] Таймаут 3 секунды, используем резервную локацию:', DEFAULT_LOCATION);
        resolve(DEFAULT_LOCATION);
      }
    }, 3000);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            console.log('[getUserLocation] Получена геопозиция:', position.coords);
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          }
        },
        (error) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            console.warn('[getUserLocation] Ошибка геопозиции:', error);
            resolve(DEFAULT_LOCATION);
          }
        },
        { timeout: 3000, maximumAge: 60000, enableHighAccuracy: false }
      );
    } else {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve(DEFAULT_LOCATION);
      }
    }
  });
}

// Функция расчета расстояния между двумя точками (Haversine formula)
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Радиус Земли в километрах
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Расстояние в километрах
}

// Функция форматирования времени
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  if (hours < 24) return `${hours} ч назад`;
  if (days < 7) return `${days} дн назад`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Функция форматирования расстояния
function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} м`;
  }
  return `${km.toFixed(1)} км`;
}

// Функция получения адреса (вызывается по требованию)
async function getAddress(lat: number, lng: number): Promise<string> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'LingerApp/1.0',
        },
      }
    );
    const data = await response.json();
    if (data.address) {
      const parts = [];
      if (data.address.road) parts.push(data.address.road);
      if (data.address.house_number) parts.push(data.address.house_number);
      if (parts.length > 0) return parts.join(', ');
      if (data.display_name) return data.display_name.split(',')[0];
    }
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  } catch (error) {
    console.warn('[getAddress] Ошибка:', error);
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
}

// Оптимизированная загрузка импульсов: limit(50) и без адресов на старте
async function loadImpulses(): Promise<ImpulseLocation[]> {
  try {
    console.log('[loadImpulses] Запрос данных из Supabase (limit 50)...');
    const { data, error } = await supabase
      .from('impulses')
      .select('id, content, category, creator_id, created_at, location_lat, location_lng')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[loadImpulses] Ошибка:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    const rows = data as ImpulseRow[];
    const withLocation = rows.filter((row) => {
      return (
        typeof row.location_lat === 'number' &&
        typeof row.location_lng === 'number' &&
        !isNaN(row.location_lat) &&
        !isNaN(row.location_lng) &&
        row.location_lat >= -90 && row.location_lat <= 90 &&
        row.location_lng >= -180 && row.location_lng <= 180
      );
    });

    if (withLocation.length === 0) {
      return [];
    }

    // Загружаем имена авторов
    const creatorIds = [...new Set(withLocation.map((r) => r.creator_id))];
    let profilesMap = new Map<number, string>();

    if (creatorIds.length > 0) {
      try {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', creatorIds);

        if (profiles) {
          profilesMap = new Map(
            profiles.map((p: { id: number; full_name: string | null }) => [p.id, p.full_name ?? ''])
          );
        }
      } catch (e) {
        console.warn('[loadImpulses] Ошибка загрузки профилей:', e);
      }
    }

    // Возвращаем импульсы БЕЗ адресов на старте (адреса загружаются при клике)
    const impulses = withLocation.map((row) => ({
      id: row.id,
      content: row.content,
      category: row.category,
      author_name: profilesMap.get(row.creator_id) || undefined,
      location_lat: row.location_lat as number,
      location_lng: row.location_lng as number,
      created_at: row.created_at,
      address: undefined,
    }));

    console.log(`[loadImpulses] Возвращаем ${impulses.length} импульсов (без адресов)`);
    return impulses;
  } catch (error) {
    console.error('[loadImpulses] Критическая ошибка:', error);
    return [];
  }
}

interface MapScreenProps {
  activeCategory?: string | null;
  onCategoryChange?: (category: string | null) => void;
  refreshTrigger?: number; // При изменении этого значения карта обновляет данные
  isSelectionMode?: boolean; // Режим выбора точки на карте
  onLocationSelected?: (location: GeoLocation) => void; // Коллбэк при выборе точки
}

const MapScreen: React.FC<MapScreenProps> = ({ activeCategory, refreshTrigger, isSelectionMode, onLocationSelected }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<MapInstance | null>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [selectedImpulse, setSelectedImpulse] = useState<ImpulseLocation | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [impulses, setImpulses] = useState<ImpulseLocation[]>([]);
  const [nearbyEvents, setNearbyEvents] = useState<Array<ImpulseLocation & { distance: number }>>([]);
  const [userLocation, setUserLocation] = useState<GeoLocation | null>(null);
  const loadingTimeoutRef = useRef<number | null>(null);
  const initAttemptedRef = useRef(false);
  const addressCacheRef = useRef<Map<string, string>>(new Map());

  // Защита от зависания: таймаут на 10 секунд
  useEffect(() => {
    loadingTimeoutRef.current = window.setTimeout(() => {
      if (status === 'loading') {
        console.error('[MapScreen] Таймаут загрузки 10 секунд');
        setStatus('error');
        setErrorMessage('Ошибка сети. Нажмите, чтобы попробовать снова');
      }
    }, 10000);

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [status]);

  // ГАРАНТИРОВАННАЯ ИНИЦИАЛИЗАЦИЯ: только useEffect с requestAnimationFrame
  useEffect(() => {
    if (initAttemptedRef.current) {
      return;
    }

    // Используем requestAnimationFrame для гарантии отрисовки DOM
    requestAnimationFrame(() => {
      // Дополнительный setTimeout для Telegram Mini App
      setTimeout(() => {
        const initMap = async () => {
          // КРИТИЧЕСКАЯ ПРОВЕРКА: контейнер должен существовать
          if (!mapRef.current) {
            console.error('[MapScreen] mapRef.current is null после ожидания');
            setStatus('error');
            setErrorMessage('Контейнер карты не найден');
            return;
          }

          initAttemptedRef.current = true;

          try {
            console.log('[MapScreen] Начало инициализации карты...');
            
            // Получаем геопозицию (максимум 3 секунды, резерв Сестрорецк)
            const currentUserLocation = await getUserLocation();
            setUserLocation(currentUserLocation);
            const isDefaultLocation = currentUserLocation.lat === DEFAULT_LOCATION.lat && currentUserLocation.lng === DEFAULT_LOCATION.lng;
            const zoom = isDefaultLocation ? 13 : 15;

            console.log('[MapScreen] Создание карты:', currentUserLocation, 'zoom:', zoom);
            
            if (!mapRef.current) {
              throw new Error('mapRef.current is null перед инициализацией');
            }

            // Инициализируем карту
            const map = await osmMapAdapter.initMap(mapRef.current, currentUserLocation, zoom);
            mapInstanceRef.current = map;

            // ПРИНУДИТЕЛЬНЫЙ Resize для Leaflet (сразу после создания)
            if (mapInstanceRef.current.invalidateSize) {
              mapInstanceRef.current.invalidateSize();
              // Дополнительный вызов через небольшой таймаут для надежности
              setTimeout(() => {
                if (mapInstanceRef.current?.invalidateSize) {
                  mapInstanceRef.current.invalidateSize();
                }
              }, 100);
            }

            // Плавное перемещение к локации (только для резервной локации)
            if (isDefaultLocation) {
              setTimeout(() => {
                map.flyTo(currentUserLocation, zoom);
              }, 200);
            }

            // Загружаем данные из Supabase после отрисовки карты
            console.log('[MapScreen] Загрузка импульсов из Supabase...');
            const loadedImpulses = await loadImpulses();
            setImpulses(loadedImpulses);
            
            console.log(`[MapScreen] Загружено ${loadedImpulses.length} импульсов`);
            
            // Отображаем маркеры БЫСТРО (без адресов)
            if (loadedImpulses.length > 0) {
              // Рассчитываем близлежащие события
              if (currentUserLocation) {
                const eventsWithDistance = loadedImpulses
                  .map(impulse => ({
                    ...impulse,
                    distance: calculateDistance(
                      currentUserLocation.lat,
                      currentUserLocation.lng,
                      impulse.location_lat,
                      impulse.location_lng
                    ),
                  }))
                  .sort((a, b) => a.distance - b.distance)
                  .slice(0, 3); // Только 3 ближайших
                setNearbyEvents(eventsWithDistance);
              }

              map.setMarkers(loadedImpulses, async (impulse) => {
                // Загружаем адрес при клике, если его еще нет
                let impulseWithAddress = impulse;
                if (!impulse.address) {
                  const cacheKey = `${impulse.location_lat},${impulse.location_lng}`;
                  if (!addressCacheRef.current.has(cacheKey)) {
                    const address = await getAddress(impulse.location_lat, impulse.location_lng);
                    addressCacheRef.current.set(cacheKey, address);
                    impulseWithAddress = { ...impulse, address };
                    // Обновляем импульс в списке
                    setImpulses(prev => prev.map(i => 
                      i.id === impulse.id ? impulseWithAddress : i
                    ));
                  } else {
                    impulseWithAddress = { ...impulse, address: addressCacheRef.current.get(cacheKey) };
                  }
                }
                
                setSelectedImpulse(impulseWithAddress);
                
                // Вибрация при клике на маркер
                if (window.Telegram?.WebApp?.HapticFeedback) {
                  try {
                    window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                  } catch (e) {
                    console.warn('[MapScreen] Haptic error:', e);
                  }
                }
              }, activeCategory || null);
            }

            // Очищаем таймаут и устанавливаем статус ready
            if (loadingTimeoutRef.current) {
              clearTimeout(loadingTimeoutRef.current);
              loadingTimeoutRef.current = null;
            }
            setStatus('ready');
            console.log('[MapScreen] Карта успешно инициализирована');
          } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            console.error('[MapScreen] Ошибка инициализации:', error);
            
            if (loadingTimeoutRef.current) {
              clearTimeout(loadingTimeoutRef.current);
              loadingTimeoutRef.current = null;
            }
            
            setStatus('error');
            setErrorMessage('Ошибка сети. Нажмите, чтобы попробовать снова');
          }
        };

        initMap();
      }, 150); // Дополнительная задержка для Telegram Mini App
    });
  }, []);

  // Обновляем данные при изменении refreshTrigger
  useEffect(() => {
    if (status === 'ready' && refreshTrigger && refreshTrigger > 0) {
      console.log('[MapScreen] Обновление данных по refreshTrigger:', refreshTrigger);
      const reloadData = async () => {
        const loadedImpulses = await loadImpulses();
        setImpulses(loadedImpulses);
        
        // Обновляем близлежащие события
        if (userLocation) {
          const eventsWithDistance = loadedImpulses
            .map(impulse => ({
              ...impulse,
              distance: calculateDistance(
                userLocation.lat,
                userLocation.lng,
                impulse.location_lat,
                impulse.location_lng
              ),
            }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 3);
          setNearbyEvents(eventsWithDistance);
        }
        
        if (mapInstanceRef.current && loadedImpulses.length > 0 && !isSelectionMode) {
          mapInstanceRef.current.setMarkers(loadedImpulses, async (impulse) => {
            let impulseWithAddress = impulse;
            if (!impulse.address) {
              const cacheKey = `${impulse.location_lat},${impulse.location_lng}`;
              if (!addressCacheRef.current.has(cacheKey)) {
                const address = await getAddress(impulse.location_lat, impulse.location_lng);
                addressCacheRef.current.set(cacheKey, address);
                impulseWithAddress = { ...impulse, address };
                setImpulses(prev => prev.map(i => 
                  i.id === impulse.id ? impulseWithAddress : i
                ));
              } else {
                impulseWithAddress = { ...impulse, address: addressCacheRef.current.get(cacheKey) };
              }
            }
            
            setSelectedImpulse(impulseWithAddress);
            
            if (window.Telegram?.WebApp?.HapticFeedback) {
              try {
                window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
              } catch (e) {
                console.warn('[MapScreen] Haptic error:', e);
              }
            }
          }, activeCategory || null);
        }
      };
      reloadData();
    }
  }, [refreshTrigger, status, activeCategory, userLocation, isSelectionMode]);

  // Обработчик режима выбора точки на карте
  useEffect(() => {
    if (mapInstanceRef.current && status === 'ready' && mapInstanceRef.current.setLocationSelectMode) {
      mapInstanceRef.current.setLocationSelectMode(
        isSelectionMode || false,
        (location: GeoLocation) => {
          if (onLocationSelected) {
            onLocationSelected(location);
          }
          if (window.Telegram?.WebApp?.HapticFeedback) {
            try {
              window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
            } catch (e) {
              console.warn('[MapScreen] Haptic error:', e);
            }
          }
        }
      );
    }
  }, [isSelectionMode, status, onLocationSelected]);

  // Обновляем маркеры при изменении активной категории
  useEffect(() => {
    if (mapInstanceRef.current && impulses.length > 0 && status === 'ready' && !isSelectionMode) {
      mapInstanceRef.current.setMarkers(impulses, async (impulse) => {
        // Загружаем адрес при клике, если его еще нет
        let impulseWithAddress = impulse;
        if (!impulse.address) {
          const cacheKey = `${impulse.location_lat},${impulse.location_lng}`;
          if (!addressCacheRef.current.has(cacheKey)) {
            const address = await getAddress(impulse.location_lat, impulse.location_lng);
            addressCacheRef.current.set(cacheKey, address);
            impulseWithAddress = { ...impulse, address };
            setImpulses(prev => prev.map(i => 
              i.id === impulse.id ? impulseWithAddress : i
            ));
          } else {
            impulseWithAddress = { ...impulse, address: addressCacheRef.current.get(cacheKey) };
          }
        }
        
        setSelectedImpulse(impulseWithAddress);
        
        // Вибрация при клике на маркер
        if (window.Telegram?.WebApp?.HapticFeedback) {
          try {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
          } catch (e) {
            console.warn('[MapScreen] Haptic error:', e);
          }
        }
      }, activeCategory || null);
    }
  }, [activeCategory, impulses, status, isSelectionMode]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.destroy();
        } catch (e) {
          console.error('[MapScreen] Ошибка уничтожения:', e);
        }
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const handleRetry = () => {
    setStatus('loading');
    setErrorMessage(null);
    initAttemptedRef.current = false;
    mapInstanceRef.current = null;
    addressCacheRef.current.clear();
    
    // Перезапускаем инициализацию
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (mapRef.current) {
          const initMap = async () => {
            try {
              const currentUserLocation = await getUserLocation();
              setUserLocation(currentUserLocation);
              const isDefaultLocation = currentUserLocation.lat === DEFAULT_LOCATION.lat && currentUserLocation.lng === DEFAULT_LOCATION.lng;
              const zoom = isDefaultLocation ? 13 : 15;

              if (mapRef.current) {
                const map = await osmMapAdapter.initMap(mapRef.current, currentUserLocation, zoom);
                mapInstanceRef.current = map;

                // Принудительный Resize
                if (mapInstanceRef.current.invalidateSize) {
                  mapInstanceRef.current.invalidateSize();
                  setTimeout(() => {
                    if (mapInstanceRef.current?.invalidateSize) {
                      mapInstanceRef.current.invalidateSize();
                    }
                  }, 100);
                }

                if (isDefaultLocation) {
                  setTimeout(() => {
                    map.flyTo(currentUserLocation, zoom);
                  }, 200);
                }

                const loadedImpulses = await loadImpulses();
                setImpulses(loadedImpulses);
                
                // Обновляем близлежащие события
                if (userLocation) {
                  const eventsWithDistance = loadedImpulses
                    .map(impulse => ({
                      ...impulse,
                      distance: calculateDistance(
                        userLocation.lat,
                        userLocation.lng,
                        impulse.location_lat,
                        impulse.location_lng
                      ),
                    }))
                    .sort((a, b) => a.distance - b.distance)
                    .slice(0, 3);
                  setNearbyEvents(eventsWithDistance);
                }
                
                if (loadedImpulses.length > 0) {
                  map.setMarkers(loadedImpulses, async (impulse) => {
                    let impulseWithAddress = impulse;
                    if (!impulse.address) {
                      const cacheKey = `${impulse.location_lat},${impulse.location_lng}`;
                      if (!addressCacheRef.current.has(cacheKey)) {
                        const address = await getAddress(impulse.location_lat, impulse.location_lng);
                        addressCacheRef.current.set(cacheKey, address);
                        impulseWithAddress = { ...impulse, address };
                        setImpulses(prev => prev.map(i => 
                          i.id === impulse.id ? impulseWithAddress : i
                        ));
                      } else {
                        impulseWithAddress = { ...impulse, address: addressCacheRef.current.get(cacheKey) };
                      }
                    }
                    
                    setSelectedImpulse(impulseWithAddress);
                    if (window.Telegram?.WebApp?.HapticFeedback) {
                      try {
                        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                      } catch (e) {}
                    }
                  }, activeCategory || null);
                }

                setStatus('ready');
              }
            } catch (e) {
              setStatus('error');
              setErrorMessage('Ошибка сети. Нажмите, чтобы попробовать снова');
            }
          };
          initMap();
        }
      }, 150);
    });
  };

  const hideBalloon = () => {
    setSelectedImpulse(null);
  };

  const handleFlyToMarker = () => {
    if (selectedImpulse && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(
        { lat: selectedImpulse.location_lat, lng: selectedImpulse.location_lng },
        15
      );
      
      // Вибрация
      if (window.Telegram?.WebApp?.HapticFeedback) {
        try {
          window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
        } catch (e) {}
      }
    }
  };

  // КОНТЕЙНЕР КАРТЫ ВСЕГДА В DOM (просто скрыт во время загрузки)
  return (
    <div className="relative w-full h-screen bg-black">
      {/* Контейнер карты ВСЕГДА в DOM, скрыт во время загрузки */}
      <div 
        id="map" 
        ref={mapRef} 
        className="map-container"
        style={{
          opacity: status === 'ready' ? 1 : 0,
          visibility: status === 'ready' ? 'visible' : 'hidden',
          transition: 'opacity 0.3s ease-in-out',
        }}
      />
      
      {/* Индикатор загрузки */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-50">
          <div className="text-center">
            <div className="text-white/60 mb-2">Загрузка карты...</div>
          </div>
        </div>
      )}

      {/* Экран ошибки */}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-50 p-4">
          <div className="text-center max-w-md">
            <div className="text-red-500 text-xl mb-4">⚠️ Ошибка загрузки</div>
            <div className="text-white/80 text-sm mb-4 break-words">{errorMessage || 'Неизвестная ошибка'}</div>
            <button
              onClick={handleRetry}
              className="px-6 py-3 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
            >
              Попробовать снова
            </button>
          </div>
        </div>
      )}
      
      {/* Индикатор режима выбора точки */}
      {isSelectionMode && status === 'ready' && (
        <div className="absolute top-4 left-4 right-4 z-[1000]">
          <div className="bg-blue-500/90 backdrop-blur-xl border border-blue-400/50 rounded-2xl p-4 text-center">
            <p className="text-white text-sm font-medium">
              Кликните на карте, чтобы выбрать место
            </p>
          </div>
        </div>
      )}

      {/* Виджет близлежащих событий */}
      {!isSelectionMode && !selectedImpulse && status === 'ready' && nearbyEvents.length > 0 && (
        <div className="absolute bottom-4 left-0 right-0 z-[900] px-4">
          <div className="bg-black/90 backdrop-blur-xl border border-white/20 rounded-2xl p-3">
            <h3 className="text-xs text-white/70 mb-2 px-2">Ближайшие события</h3>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {nearbyEvents.map((event) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={() => {
                    if (mapInstanceRef.current) {
                      mapInstanceRef.current.flyTo(
                        { lat: event.location_lat, lng: event.location_lng },
                        15
                      );
                      setSelectedImpulse(event);
                      if (window.Telegram?.WebApp?.HapticFeedback) {
                        try {
                          window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                        } catch (e) {}
                      }
                    }
                  }}
                  className="flex-shrink-0 w-[280px] bg-white/5 border border-white/10 rounded-xl p-3 cursor-pointer hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-[10px] text-purple-400 px-2 py-0.5 bg-purple-400/10 rounded-full">
                      {event.category}
                    </span>
                    <span className="text-[10px] text-white/50">{formatDistance(event.distance)}</span>
                  </div>
                  <p className="text-xs text-white/90 leading-relaxed line-clamp-2 mb-2">
                    {event.content}
                  </p>
                  {event.created_at && (
                    <div className="flex items-center gap-1 text-[10px] text-white/50">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1"/>
                        <path d="M6 3v3l2 1" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                      </svg>
                      <span>{formatTime(event.created_at)}</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Баллун с детальной информацией об импульсе */}
      <AnimatePresence>
        {selectedImpulse && status === 'ready' && !isSelectionMode && (
          <div className="absolute bottom-0 left-0 right-0 p-4 z-[1000]">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="bg-black/95 backdrop-blur-xl border border-white/20 rounded-2xl p-4 max-h-[300px] overflow-y-auto"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-xs font-semibold text-purple-400 px-2 py-1 bg-purple-400/10 rounded-full">
                  {selectedImpulse.category}
                </span>
                <button
                  onClick={hideBalloon}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              
              <h3 className="text-base font-semibold text-white mb-2">Событие</h3>
              
              <p className="text-sm text-white/90 leading-relaxed mb-3">
                {selectedImpulse.content}
              </p>
              
              {selectedImpulse.created_at && (
                <div className="flex items-center gap-2 text-xs text-white/60 mb-2">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1"/>
                    <path d="M6 3v3l2 1" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                  </svg>
                  <span>{formatTime(selectedImpulse.created_at)}</span>
                </div>
              )}
              
              {selectedImpulse.address && (
                <div className="flex items-center gap-2 text-xs text-white/60 mb-3">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1C4.34 1 3 2.34 3 4c0 2.5 3 6 3 6s3-3.5 3-6c0-1.66-1.34-3-3-3z" stroke="currentColor" strokeWidth="1" fill="none"/>
                    <circle cx="6" cy="4" r="1" fill="currentColor"/>
                  </svg>
                  <span>{selectedImpulse.address}</span>
                </div>
              )}
              
              {selectedImpulse.author_name && (
                <p className="text-xs text-white/50 mb-3">
                  — {selectedImpulse.author_name}
                </p>
              )}
              
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleFlyToMarker}
                  className="flex-1 px-4 py-2 bg-white/10 border border-white/20 text-white text-xs font-semibold rounded-xl hover:bg-white/20 transition-colors"
                >
                  📍 Найти на карте
                </button>
                <button
                  onClick={() => {
                    // Вибрация
                    if (window.Telegram?.WebApp?.HapticFeedback) {
                      try {
                        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                      } catch (e) {}
                    }
                    // Показываем alert для теста
                    if (window.Telegram?.WebApp?.showAlert) {
                      window.Telegram.WebApp.showAlert('Вы присоединились!');
                    } else {
                      alert('Вы присоединились!');
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity"
                >
                  ✋ Присоединиться
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MapScreen;
