import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { GeoLocation, ImpulseLocation, MapInstance } from '../types/map';
import { osmMapAdapter } from '../lib/osmMap';
import { getSmartIcon } from '../lib/smartIcon';

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
  if (km === Infinity || isNaN(km)) return '';
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
    // Проверка подключения к Supabase
    if (!isSupabaseConfigured) {
      console.warn('⚠️ [loadImpulses] Supabase не настроен, пропускаем загрузку импульсов');
      return [];
    }

    console.log('[loadImpulses] Запрос данных из Supabase (limit 50)...');
    const { data, error } = await supabase
      .from('impulses')
      .select('id, content, category, creator_id, created_at, location_lat, location_lng')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('❌ [loadImpulses] Ошибка Supabase:', error);
      console.error('  Code:', error.code);
      console.error('  Message:', error.message);
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
  onEventSelected?: (impulse: ImpulseLocation | null) => void; // Коллбэк при выборе события (для скрытия таб-бара)
  onBack?: () => void; // Коллбэк для возврата на главную
  onNavigateToFeed?: () => void; // Коллбэк для перехода на экран "Все события"
}

const MapScreen: React.FC<MapScreenProps> = ({ activeCategory, refreshTrigger, isSelectionMode, onLocationSelected, onEventSelected, onBack, onNavigateToFeed }) => {
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

  // ГАРАНТИРОВАННАЯ ИНИЦИАЛИЗАЦИЯ: useEffect с setTimeout для Telegram WebView
  useEffect(() => {
    if (initAttemptedRef.current) {
      return;
    }

    // Даем Telegram WebView время отрендерить DOM
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
            const finalZoom = isDefaultLocation ? 13 : 15;
            const initialZoom = 2.5; // Начальный zoom для эффекта полета (как в Zenly)

            console.log('[MapScreen] Создание карты:', currentUserLocation, 'final zoom:', finalZoom);
            
            if (!mapRef.current) {
              throw new Error('mapRef.current is null перед инициализацией');
            }

            // Инициализируем карту с большим zoom для эффекта полета
            const map = await osmMapAdapter.initMap(mapRef.current, currentUserLocation, initialZoom);
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

            // Эффект плавного полета камеры (Zenly Style): от большого zoom к текущей позиции
            setTimeout(() => {
              if (mapInstanceRef.current) {
                // Плавный полет к текущей позиции с финальным zoom за 1.8 секунды
                mapInstanceRef.current.flyTo(currentUserLocation, finalZoom);
                
                // Haptic feedback при завершении "приземления" камеры
                setTimeout(() => {
                  if (window.Telegram?.WebApp?.HapticFeedback) {
                    try {
                      window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                    } catch (e) {
                      console.warn('[MapScreen] Haptic error:', e);
                    }
                  }
                }, 1800); // Через 1.8 секунды (время анимации flyTo)
              }
            }, 300); // Небольшая задержка перед началом полета

            // Загружаем данные из Supabase после отрисовки карты
            console.log('[MapScreen] Загрузка импульсов из Supabase...');
            const loadedImpulses = await loadImpulses();
            setImpulses(loadedImpulses);
            
            console.log(`[MapScreen] Загружено ${loadedImpulses.length} импульсов`);
            
            // Отображаем маркеры БЫСТРО (без адресов)
            if (loadedImpulses.length > 0) {
              // Рассчитываем близлежащие события
              let nearestEventId: number | undefined;
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
                nearestEventId = eventsWithDistance.length > 0 ? eventsWithDistance[0].id : undefined;
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
                
                // Вибрация при клике на маркер (selectionChanged для переключения между событиями)
                if (window.Telegram?.WebApp?.HapticFeedback) {
                  try {
                    window.Telegram.WebApp.HapticFeedback.selectionChanged();
                  } catch (e) {
                    // Fallback на impactOccurred если selectionChanged не поддерживается
                    try {
                      window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                    } catch (e2) {
                      console.warn('[MapScreen] Haptic error:', e2);
                    }
                  }
                }
              }, activeCategory || null, nearestEventId);
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
      }, 150); // Задержка для Telegram WebView
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
          // Определяем ближайшее событие для анимации пульсации
          const nearestEventIdForRefresh = nearbyEvents.length > 0 ? nearbyEvents[0].id : undefined;
          
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
          }, activeCategory || null, nearestEventIdForRefresh);
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
      // Определяем ближайшее событие для анимации пульсации
      const nearestEventIdForCategory = nearbyEvents.length > 0 ? nearbyEvents[0].id : undefined;
      
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
        
        // Вибрация при клике на маркер (selectionChanged для переключения между событиями)
        if (window.Telegram?.WebApp?.HapticFeedback) {
          try {
            window.Telegram.WebApp.HapticFeedback.selectionChanged();
          } catch (e) {
            // Fallback на impactOccurred если selectionChanged не поддерживается
            try {
              window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
            } catch (e2) {
              console.warn('[MapScreen] Haptic error:', e2);
            }
          }
        }
      }, activeCategory || null, nearestEventIdForCategory);
    }
  }, [activeCategory, impulses, status, isSelectionMode, nearbyEvents]);

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
                
                // Обновляем близлежащие события и определяем ближайшее для анимации
                let nearestEventIdForRetry: number | undefined;
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
                  nearestEventIdForRetry = eventsWithDistance.length > 0 ? eventsWithDistance[0].id : undefined;
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
                        window.Telegram.WebApp.HapticFeedback.selectionChanged();
        } catch (e) {
                        // Fallback на impactOccurred если selectionChanged не поддерживается
                        try {
                          window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                        } catch (e2) {}
                      }
                    }
                  }, activeCategory || null, nearestEventIdForRetry);
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
    if (onEventSelected) {
      onEventSelected(null);
    }
  };

  // Уведомляем родительский компонент об изменении выбранного события
  useEffect(() => {
    if (onEventSelected) {
      onEventSelected(selectedImpulse);
    }
  }, [selectedImpulse, onEventSelected]);


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
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">
                        {getSmartIcon(event.content, event.category).emoji}
                      </span>
                      <span className="text-[10px] text-purple-400 px-2 py-0.5 bg-purple-400/10 rounded-full">
                        {event.category}
                      </span>
                    </div>
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

      {/* Кнопка "Назад" - ярко-белая и глянцевая */}
      {status === 'ready' && !isSelectionMode && (
        <button
          onClick={() => {
            if (onBack) {
              onBack();
            }
            hideBalloon();
            if (window.Telegram?.WebApp?.HapticFeedback) {
              try {
                window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
              } catch (e) {
                console.warn('[MapScreen] Haptic error:', e);
              }
            }
          }}
          className="absolute top-4 left-4 z-[1001] w-11 h-11 rounded-full flex items-center justify-center hover:scale-110 transition-all shadow-lg"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          }}
        >
          <ChevronLeft size={22} className="text-gray-800" strokeWidth={2.5} />
        </button>
      )}

      {/* Умное окно событий в стиле Zenly - Compact Glass, высота 60-70px */}
      <AnimatePresence>
        {selectedImpulse && status === 'ready' && !isSelectionMode && (
          <div className="absolute bottom-0 left-0 right-0 p-2 z-[1000]">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              onAnimationStart={() => {
                // Haptic feedback при появлении карточки
                if (window.Telegram?.WebApp?.HapticFeedback) {
                  try {
                    window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                  } catch (e) {
                    console.warn('[MapScreen] Haptic error:', e);
                  }
                }
              }}
              onClick={() => {
                // Мгновенный переход на экран "Все события" при клике на любое место окна
                if (onNavigateToFeed) {
                  if (window.Telegram?.WebApp?.HapticFeedback) {
                    try {
                      window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                    } catch (e) {
                      console.warn('[MapScreen] Haptic error:', e);
                    }
                  }
                  onNavigateToFeed();
                }
              }}
              className="rounded-xl px-3 py-2.5 flex items-center gap-2 cursor-pointer hover:bg-white/10 transition-all active:scale-95"
              style={{
                height: '65px',
                backgroundColor: 'rgba(255, 255, 255, 0.4)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.15)',
              }}
            >
              {/* Все данные в одну строку: Интеллектуальная иконка + Название категории + Дистанция */}
              <span className="text-base leading-none">
                {getSmartIcon(selectedImpulse.content, selectedImpulse.category).emoji}
              </span>
              <span className="text-sm font-semibold text-gray-900 flex-shrink-0 leading-tight" style={{ textShadow: '0 1px 2px rgba(255, 255, 255, 0.8)' }}>
                  {selectedImpulse.category}
                </span>
              {userLocation && selectedImpulse.location_lat && selectedImpulse.location_lng && (
                <>
                  <span className="text-gray-600 text-sm leading-none">•</span>
                  <span className="text-xs font-medium text-gray-700 flex-shrink-0 leading-tight" style={{ textShadow: '0 1px 2px rgba(255, 255, 255, 0.8)' }}>
                    {formatDistance(calculateDistance(
                      userLocation.lat,
                      userLocation.lng,
                      selectedImpulse.location_lat,
                      selectedImpulse.location_lng
                    ))}
                  </span>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MapScreen;
