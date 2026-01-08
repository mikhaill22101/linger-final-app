import { useEffect, useRef, useState } from 'react';
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
    const { data, error } = await supabase
      .from('impulses')
      .select('id, content, category, creator_id, created_at, location_lat, location_lng');

    if (error) {
      console.error('Supabase error loading impulses:', error);
      try {
        WebApp.showAlert(`Ошибка загрузки данных: ${error.message}`);
      } catch {
        // ignore
      }
      return [];
    }

  const rows = (data || []) as ImpulseRow[];

  const withLocation = rows.filter((row) => (
    typeof row.location_lat === 'number' &&
    typeof row.location_lng === 'number' &&
    row.location_lat >= -90 && row.location_lat <= 90 &&
    row.location_lng >= -180 && row.location_lng <= 180
  ));

  if (withLocation.length === 0) {
    return [];
  }

  const creatorIds = [...new Set(withLocation.map((r) => r.creator_id))];
  let profilesMap = new Map<number, string>();

  if (creatorIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', creatorIds);

    if (!profilesError && profiles) {
      profilesMap = new Map(
        profiles.map((p: { id: number; full_name: string | null }) => [p.id, p.full_name ?? ''])
      );
    }
  }

    return withLocation.map((row) => ({
      id: row.id,
      content: row.content,
      category: row.category,
      author_name: profilesMap.get(row.creator_id) || undefined,
      location_lat: row.location_lat as number,
      location_lng: row.location_lng as number,
    }));
  } catch (error) {
    console.error('Error in loadImpulses:', error);
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

  useEffect(() => {
    try {
      WebApp.ready();
      WebApp.expand();
    } catch (e) {
      console.error('Error initializing WebApp:', e);
    }

    let cancelled = false;

    const init = async () => {
      try {
        console.log('Используется бесплатная карта OpenStreetMap');
        
        // Проверяем, что getMapProvider возвращает 'osm'
        const testProvider = getMapProvider(null);
        if (testProvider !== 'osm') {
          console.warn(`getMapProvider вернул ${testProvider}, ожидался 'osm'`);
        }
        
        try {
          const userLocation = await getUserLocation();
          const center: GeoLocation = userLocation ?? { lat: 55.7558, lng: 37.6173 };

          if (!mapRef.current) {
            throw new Error('mapRef.current is null - контейнер карты не найден');
          }

          const map = await osmMapAdapter.initMap(mapRef.current, center);
          if (cancelled) {
            map.destroy();
            return;
          }
          mapInstanceRef.current = map;

          const loadedImpulses = await loadImpulses();
          if (!cancelled) {
            setImpulses(loadedImpulses);
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
            }
          }

          if (!cancelled) {
            setStatus('ready');
          }
        } catch (e) {
          console.error('Error in map initialization:', e);
          throw e; // Пробрасываем дальше для общего обработчика
        }
      } catch (e) {
        if (cancelled) return;
        const error = e instanceof Error ? e : new Error(String(e));
        const msg = error.message || 'Не удалось инициализировать карту';
        console.error('MapScreen initialization error:', error);
        setErrorMessage(msg);
        setStatus('error');
        try {
          WebApp.showAlert(`Ошибка карты: ${msg}`);
        } catch {
          // ignore
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.destroy();
        } catch (e) {
          console.error('Error destroying map:', e);
        }
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Обновляем маркеры при изменении активной категории
  useEffect(() => {
    if (mapInstanceRef.current && impulses.length > 0) {
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
