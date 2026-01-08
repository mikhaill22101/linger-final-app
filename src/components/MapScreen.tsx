import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import WebApp from '@twa-dev/sdk';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import type { GeoLocation, ImpulseLocation, MapInstance } from '../types/map';
import { osmMapAdapter } from '../lib/osmMap';
import { getMapProvider } from '../lib/region';

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

function getUserLocation(): Promise<GeoLocation | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        resolve(null);
      },
      { timeout: 5000, maximumAge: 60000 }
    );
  });
}

async function loadImpulses(): Promise<ImpulseLocation[]> {
  try {
    console.log('[loadImpulses] Запрос данных из Supabase...');
    const { data, error } = await supabase
      .from('impulses')
      .select('id, content, category, creator_id, created_at, location_lat, location_lng');

    if (error) {
      console.error('[loadImpulses] Ошибка Supabase:', error);
      try {
        if (WebApp.showAlert) {
          WebApp.showAlert(`Ошибка загрузки данных: ${error.message}`);
        }
      } catch {
        // ignore
      }
      // Возвращаем пустой массив вместо ошибки - показываем пустую карту
      return [];
    }

    // Обработка пустых данных
    if (!data || data.length === 0) {
      console.log('[loadImpulses] Нет данных в базе, возвращаем пустой массив');
      return [];
    }

    const rows = data as ImpulseRow[];
    console.log(`[loadImpulses] Получено ${rows.length} записей из базы`);

    // Фильтруем только записи с валидными координатами
    const withLocation = rows.filter((row) => {
      const hasValidCoords = 
        typeof row.location_lat === 'number' &&
        typeof row.location_lng === 'number' &&
        !isNaN(row.location_lat) &&
        !isNaN(row.location_lng) &&
        row.location_lat >= -90 && row.location_lat <= 90 &&
        row.location_lng >= -180 && row.location_lng <= 180;
      
      if (!hasValidCoords && row.location_lat !== null && row.location_lng !== null) {
        console.warn(`[loadImpulses] Запись ${row.id} имеет невалидные координаты:`, row.location_lat, row.location_lng);
      }
      
      return hasValidCoords;
    });

    console.log(`[loadImpulses] ${withLocation.length} записей с валидными координатами`);

    if (withLocation.length === 0) {
      console.log('[loadImpulses] Нет записей с геолокацией, возвращаем пустой массив');
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

        if (profilesError) {
          console.warn('[loadImpulses] Ошибка загрузки профилей:', profilesError);
        } else if (profiles) {
          profilesMap = new Map(
            profiles.map((p: { id: number; full_name: string | null }) => [p.id, p.full_name ?? ''])
          );
          console.log(`[loadImpulses] Загружено ${profilesMap.size} профилей`);
        }
      } catch (profileError) {
        console.warn('[loadImpulses] Исключение при загрузке профилей:', profileError);
        // Продолжаем без профилей
      }
    }

    const result = withLocation.map((row) => ({
      id: row.id,
      content: row.content,
      category: row.category, // Используем категорию как есть из базы
      author_name: profilesMap.get(row.creator_id) || undefined,
      location_lat: row.location_lat as number,
      location_lng: row.location_lng as number,
    }));

    console.log(`[loadImpulses] Возвращаем ${result.length} импульсов с геолокацией`);
    return result;
  } catch (error) {
    console.error('[loadImpulses] Критическая ошибка:', error);
    // Возвращаем пустой массив вместо ошибки - показываем пустую карту
    return [];
  }
}

interface MapScreenProps {
  activeCategory?: string | null;
  onCategoryChange?: (category: string | null) => void;
  key?: string | number; // Добавляем key для принудительного ремонтирования
}

const MapScreen: React.FC<MapScreenProps> = ({ activeCategory, onCategoryChange }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<MapInstance | null>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [selectedImpulse, setSelectedImpulse] = useState<ImpulseLocation | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [impulses, setImpulses] = useState<ImpulseLocation[]>([]);
  const initAttemptRef = useRef(0);

  // Инициализация Telegram WebApp
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
        WebApp.ready();
        WebApp.expand();
        console.log('Telegram WebApp initialized');
      } else {
        console.warn('Telegram WebApp not available, running in browser mode');
      }
    } catch (e) {
      console.error('Error initializing WebApp:', e);
    }
  }, []);

  // Функция для детального отчета о состоянии DOM
  const logDOMState = useCallback(() => {
    console.error('=== DOM STATE REPORT ===');
    console.error('mapRef.current:', mapRef.current);
    console.error('mapRef.current?.parentElement:', mapRef.current?.parentElement);
    console.error('document.getElementById("map"):', document.getElementById('map'));
    console.error('document.querySelector("#map"):', document.querySelector('#map'));
    console.error('document.querySelector("[ref=mapRef]"):', document.querySelector('[ref=mapRef]'));
    console.error('document.body.children:', Array.from(document.body.children));
    console.error('document.getElementById("root"):', document.getElementById('root'));
    if (document.getElementById('root')) {
      console.error('root children:', Array.from(document.getElementById('root')!.children));
    }
    console.error('=== END DOM REPORT ===');
  }, []);

  // Железобетонная инициализация карты с useCallback
  const initializeMap = useCallback(async () => {
    // КРИТИЧЕСКАЯ ПРОВЕРКА: если ref не привязан, выходим
    if (!mapRef.current) {
      initAttemptRef.current++;
      console.warn(`[MapScreen] mapRef.current is null, attempt ${initAttemptRef.current}`);
      
      if (initAttemptRef.current >= 3) {
        console.error('[MapScreen] mapRef.current is null after 3 attempts');
        logDOMState();
        setStatus('error');
        setErrorMessage('Контейнер карты не найден. Проверьте консоль для деталей.');
        return;
      }
      
      // Пробуем еще раз через небольшую задержку
      setTimeout(() => {
        initializeMap();
      }, 200);
      return;
    }

    // Проверяем, что карта еще не инициализирована
    if (mapInstanceRef.current) {
      console.log('[MapScreen] Map already initialized, skipping...');
      return;
    }

    try {
      console.log('[MapScreen] Инициализация карты OpenStreetMap...');
      
      // Проверяем, что getMapProvider возвращает 'osm'
      const testProvider = getMapProvider(null);
      if (testProvider !== 'osm') {
        console.warn(`[MapScreen] getMapProvider вернул ${testProvider}, ожидался 'osm'`);
      }
      
      // Финальная проверка перед инициализацией
      if (!mapRef.current) {
        throw new Error('mapRef.current is null перед инициализацией карты');
      }

      const userLocation = await getUserLocation();
      const center: GeoLocation = userLocation ?? { lat: 55.7558, lng: 37.6173 };

      console.log('[MapScreen] Создание карты с центром:', center);
      const map = await osmMapAdapter.initMap(mapRef.current, center);
      mapInstanceRef.current = map;

      console.log('[MapScreen] Загрузка импульсов из Supabase...');
      const loadedImpulses = await loadImpulses();
      setImpulses(loadedImpulses);
      
      console.log(`[MapScreen] Загружено ${loadedImpulses.length} импульсов`);
      
      if (loadedImpulses.length > 0) {
        map.setMarkers(loadedImpulses, (impulse) => {
          setSelectedImpulse(impulse);
          // Вибрация при клике на маркер
          if (WebApp.HapticFeedback) {
            try {
              WebApp.HapticFeedback.impactOccurred('medium');
            } catch (e) {
              console.warn('Haptic feedback error:', e);
            }
          }
        }, activeCategory || null);
      } else {
        console.log('[MapScreen] Нет импульсов с геолокацией, показываем пустую карту');
      }

      setStatus('ready');
      console.log('[MapScreen] Карта успешно инициализирована');
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      const msg = error.message || 'Не удалось инициализировать карту';
      console.error('[MapScreen] Ошибка инициализации карты:', error);
      logDOMState();
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
  }, [activeCategory, logDOMState]);

  // useLayoutEffect для гарантии готовности DOM
  useLayoutEffect(() => {
    if (mapRef.current) {
      console.log('[MapScreen] DOM готов, mapRef привязан');
      initializeMap();
    } else {
      console.warn('[MapScreen] DOM не готов, mapRef не привязан');
    }
  }, [initializeMap]);

  // useEffect как fallback для инициализации
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
        // Вибрация при клике на маркер
        if (WebApp.HapticFeedback) {
          try {
            WebApp.HapticFeedback.impactOccurred('medium');
          } catch (e) {
            console.warn('Haptic feedback error:', e);
          }
        }
      }, activeCategory || null);
    }
  }, [activeCategory, impulses]);

  // Cleanup при размонтировании
  useEffect(() => {
    return () => {
      console.log('[MapScreen] Cleanup: уничтожение карты');
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

  // Обновляем маркеры при изменении активной категории
  useEffect(() => {
    if (mapInstanceRef.current && impulses.length > 0) {
      console.log('Updating markers with active category:', activeCategory);
      mapInstanceRef.current.setMarkers(impulses, (impulse) => {
        setSelectedImpulse(impulse);
        // Вибрация при клике на маркер
        if (WebApp.HapticFeedback) {
          try {
            WebApp.HapticFeedback.impactOccurred('medium');
          } catch (e) {
            console.warn('Haptic feedback error:', e);
          }
        }
      }, activeCategory || null);
    }
  }, [activeCategory, impulses]);

  const hideBalloon = () => {
    setSelectedImpulse(null);
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
          <div className="text-white/40 text-xs">Проверьте консоль браузера для деталей</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-black">
      <div id="map" ref={mapRef} style={{ width: '100%', height: '100vh' }} />
      
      {/* Баллун с информацией об импульсе */}
      <AnimatePresence>
        {selectedImpulse && (
          <div className="absolute bottom-0 left-0 right-0 p-4 z-50">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="bg-black/90 backdrop-blur-xl border border-white/20 rounded-2xl p-4 max-h-[200px] overflow-y-auto"
            >
              <div className="flex items-start justify-between mb-2">
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
              <p className="text-sm text-white/90 leading-relaxed mb-2">
                {selectedImpulse.content}
              </p>
              {selectedImpulse.author_name && (
                <p className="text-xs text-white/50">
                  — {selectedImpulse.author_name}
                </p>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MapScreen;
