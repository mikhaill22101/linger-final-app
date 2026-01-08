import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import WebApp from '@twa-dev/sdk';
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

// Резервная локация: Озеро Разлив, Сестрорецк, Санкт-Петербург
const DEFAULT_LOCATION: GeoLocation = {
  lat: 60.0975,
  lng: 29.9783,
};

// Функция получения геопозиции пользователя
function getUserLocation(): Promise<GeoLocation> {
  return new Promise((resolve) => {
    let resolved = false;

    // Пробуем через Telegram WebApp LocationManager
    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.LocationManager) {
      try {
        window.Telegram.WebApp.LocationManager.requestLocation((location) => {
          if (location && !resolved) {
            resolved = true;
            console.log('[getUserLocation] Получена геопозиция через Telegram:', location);
            resolve({
              lat: location.latitude,
              lng: location.longitude,
            });
            return;
          }
        });
      } catch (e) {
        console.warn('[getUserLocation] Ошибка Telegram LocationManager:', e);
      }
    }

    // Пробуем через navigator.geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!resolved) {
            resolved = true;
            console.log('[getUserLocation] Получена геопозиция через navigator:', position.coords);
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          }
        },
        (error) => {
          if (!resolved) {
            resolved = true;
            console.warn('[getUserLocation] Ошибка получения геопозиции:', error);
            console.log('[getUserLocation] Используем резервную локацию:', DEFAULT_LOCATION);
            resolve(DEFAULT_LOCATION);
          }
        },
        { timeout: 5000, maximumAge: 60000, enableHighAccuracy: true }
      );
    } else {
      if (!resolved) {
        resolved = true;
        console.warn('[getUserLocation] Геолокация недоступна, используем резервную локацию');
        resolve(DEFAULT_LOCATION);
      }
    }

    // Таймаут на случай, если ничего не сработало
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn('[getUserLocation] Таймаут, используем резервную локацию');
        resolve(DEFAULT_LOCATION);
      }
    }, 6000);
  });
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

// Функция получения адреса по координатам
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
      if (parts.length > 0) {
        return parts.join(', ');
      }
      if (data.display_name) {
        return data.display_name.split(',')[0];
      }
    }
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  } catch (error) {
    console.warn('[getAddress] Ошибка получения адреса:', error);
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
}

async function loadImpulses(): Promise<ImpulseLocation[]> {
  try {
    console.log('[loadImpulses] Запрос данных из Supabase...');
    const { data, error } = await supabase
      .from('impulses')
      .select('id, content, category, creator_id, created_at, location_lat, location_lng')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[loadImpulses] Ошибка Supabase:', error);
      return [];
    }

    if (!data || data.length === 0) {
      console.log('[loadImpulses] Нет данных в базе');
      return [];
    }

    const rows = data as ImpulseRow[];
    console.log(`[loadImpulses] Получено ${rows.length} записей из базы`);

    // Фильтруем только записи с валидными координатами
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

    console.log(`[loadImpulses] ${withLocation.length} записей с валидными координатами`);

    if (withLocation.length === 0) {
      return [];
    }

    // Загружаем имена авторов
    const creatorIds = [...new Set(withLocation.map((r) => r.creator_id))];
    let profilesMap = new Map<number, string>();

    if (creatorIds.length > 0) {
      try {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', creatorIds);

        if (!profilesError && profiles) {
          profilesMap = new Map(
            profiles.map((p: { id: number; full_name: string | null }) => [p.id, p.full_name ?? ''])
          );
        }
      } catch (profileError) {
        console.warn('[loadImpulses] Исключение при загрузке профилей:', profileError);
      }
    }

    // Загружаем адреса для всех импульсов
    const impulsesWithAddress = await Promise.all(
      withLocation.map(async (row) => {
        const address = await getAddress(row.location_lat as number, row.location_lng as number);
        return {
          id: row.id,
          content: row.content,
          category: row.category,
          author_name: profilesMap.get(row.creator_id) || undefined,
          location_lat: row.location_lat as number,
          location_lng: row.location_lng as number,
          created_at: row.created_at,
          address,
        };
      })
    );

    console.log(`[loadImpulses] Возвращаем ${impulsesWithAddress.length} импульсов с геолокацией`);
    return impulsesWithAddress;
  } catch (error) {
    console.error('[loadImpulses] Критическая ошибка:', error);
    return [];
  }
}

interface MapScreenProps {
  activeCategory?: string | null;
  onCategoryChange?: (category: string | null) => void;
}

const MapScreen: React.FC<MapScreenProps> = ({ activeCategory, onCategoryChange }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<MapInstance | null>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [selectedImpulse, setSelectedImpulse] = useState<ImpulseLocation | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [impulses, setImpulses] = useState<ImpulseLocation[]>([]);
  const initAttemptsRef = useRef(0);
  const maxInitAttempts = 5;

  // Инициализация карты с защитным механизмом
  const initializeMap = useCallback(async () => {
    // КРИТИЧЕСКАЯ ПРОВЕРКА: если ref не привязан, выходим
    if (!mapRef.current) {
      initAttemptsRef.current++;
      console.warn(`[MapScreen] mapRef.current is null, attempt ${initAttemptsRef.current}/${maxInitAttempts}`);
      
      if (initAttemptsRef.current >= maxInitAttempts) {
        console.error('[MapScreen] mapRef.current is null after max attempts');
        setStatus('error');
        setErrorMessage('Контейнер карты не найден. Проверьте консоль для деталей.');
        return;
      }
      
      // Повторная попытка через 100мс
      setTimeout(() => {
        initializeMap();
      }, 100);
      return;
    }

    // Проверяем, что карта еще не инициализирована
    if (mapInstanceRef.current) {
      console.log('[MapScreen] Map already initialized, skipping...');
      return;
    }

    try {
      console.log('[MapScreen] Начало инициализации карты...');
      
      // Получаем геопозицию пользователя
      console.log('[MapScreen] Запрос геопозиции пользователя...');
      const userLocation = await getUserLocation();
      const isDefaultLocation = userLocation.lat === DEFAULT_LOCATION.lat && userLocation.lng === DEFAULT_LOCATION.lng;
      const center: GeoLocation = userLocation;
      const zoom = isDefaultLocation ? 13 : 15; // zoom 15 для GPS, 13 для резервной локации

      console.log('[MapScreen] Создание карты с центром:', center, 'zoom:', zoom);
      
      // Финальная проверка перед инициализацией
      if (!mapRef.current) {
        throw new Error('mapRef.current is null перед инициализацией');
      }

      const map = await osmMapAdapter.initMap(mapRef.current, center, zoom);
      mapInstanceRef.current = map;

      console.log('[MapScreen] Загрузка импульсов из Supabase...');
      const loadedImpulses = await loadImpulses();
      setImpulses(loadedImpulses);
      
      console.log(`[MapScreen] Загружено ${loadedImpulses.length} импульсов`);
      
      // Отображаем все маркеры
      if (loadedImpulses.length > 0) {
        map.setMarkers(loadedImpulses, (impulse) => {
          setSelectedImpulse(impulse);
          
          // Вибрация при клике на маркер
          if (WebApp.HapticFeedback) {
            try {
              WebApp.HapticFeedback.impactOccurred('medium');
            } catch (e) {
              console.warn('[MapScreen] Haptic feedback error:', e);
            }
          }
        }, activeCategory || null);
      } else {
        console.log('[MapScreen] Нет импульсов, показываем пустую карту');
      }

      setStatus('ready');
      console.log('[MapScreen] Карта успешно инициализирована');
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      const msg = error.message || 'Не удалось инициализировать карту';
      console.error('[MapScreen] Ошибка инициализации:', error);
      setErrorMessage(msg);
      setStatus('error');
      try {
        if (WebApp.showAlert) {
          WebApp.showAlert(`Ошибка карты: ${msg}`);
        }
      } catch {
        // ignore
      }
    }
  }, [activeCategory]);

  // useLayoutEffect для гарантии готовности DOM
  useLayoutEffect(() => {
    if (mapRef.current) {
      console.log('[MapScreen] DOM готов, mapRef привязан через useLayoutEffect');
      initializeMap();
    } else {
      console.warn('[MapScreen] DOM не готов в useLayoutEffect, будет повторная попытка');
    }
  }, [initializeMap]);

  // useEffect как fallback с защитным механизмом
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!mapInstanceRef.current && mapRef.current) {
        console.log('[MapScreen] Fallback инициализация через useEffect');
        initializeMap();
      }
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [initializeMap]);

  // Обновляем маркеры при изменении активной категории
  useEffect(() => {
    if (mapInstanceRef.current && impulses.length > 0) {
      console.log('[MapScreen] Обновление маркеров с активной категорией:', activeCategory);
      mapInstanceRef.current.setMarkers(impulses, (impulse) => {
        setSelectedImpulse(impulse);
        
        if (WebApp.HapticFeedback) {
          try {
            WebApp.HapticFeedback.impactOccurred('medium');
          } catch (e) {
            console.warn('[MapScreen] Haptic feedback error:', e);
          }
        }
      }, activeCategory || null);
    }
  }, [activeCategory, impulses]);

  // Cleanup при размонтировании
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.destroy();
        } catch (e) {
          console.error('[MapScreen] Ошибка при уничтожении карты:', e);
        }
        mapInstanceRef.current = null;
      }
    };
  }, []);

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
      if (WebApp.HapticFeedback) {
        try {
          WebApp.HapticFeedback.impactOccurred('medium');
        } catch (e) {
          // ignore
        }
      }
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-white/60 mb-2">Загрузка карты...</div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-xl mb-4">⚠️ Ошибка загрузки карты</div>
          <div className="text-white/80 text-sm mb-4 break-words">{errorMessage || 'Неизвестная ошибка'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-black">
      {/* Контейнер карты с явными стилями */}
      <div 
        id="map" 
        ref={mapRef} 
        style={{ 
          width: '100%', 
          height: '100%',
          minHeight: '100vh',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }} 
      />
      
      {/* Баллун с детальной информацией об импульсе */}
      <AnimatePresence>
        {selectedImpulse && (
          <div className="absolute bottom-0 left-0 right-0 p-4 z-50">
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
              
              <button
                onClick={handleFlyToMarker}
                className="w-full mt-2 px-4 py-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity"
              >
                📍 Найти на карте
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MapScreen;
