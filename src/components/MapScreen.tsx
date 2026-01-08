import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import WebApp from '@twa-dev/sdk';
import { motion, AnimatePresence } from 'framer-motion';

interface Impulse {
  id: number;
  content: string;
  category: string;
  creator_id: number;
  created_at: string;
  author_name?: string;
  location_lat?: number;
  location_lng?: number;
}

declare global {
  interface Window {
    ymaps3?: any;
  }
}

const MapScreen: React.FC = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [, setImpulses] = useState<Impulse[]>([]); // Используется только через setImpulses
  const [selectedImpulse, setSelectedImpulse] = useState<Impulse | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    console.log('[MapScreen] Component mounted');
    WebApp.ready();
    WebApp.expand();

    const initMap = async () => {
      console.log('[MapScreen] initMap called');
      
      if (!mapRef.current) {
        console.warn('[MapScreen] mapRef.current is null, retrying on next tick');
        setTimeout(initMap, 0);
        return;
      }

      // Устанавливаем таймаут на 5 секунд
      timeoutRef.current = setTimeout(() => {
        console.error('[MapScreen] Map initialization timeout (5 seconds)');
        setIsLoading(false);
        WebApp.showAlert('Ошибка: Карта не загрузилась за 5 секунд. Проверьте подключение к интернету.');
      }, 5000);

      // Ждем загрузки Yandex Maps API
      if (!window.ymaps3) {
        console.log('[MapScreen] Waiting for ymaps3 API to load...');
        let checkCount = 0;
        const maxChecks = 50; // 5 секунд максимум (50 * 100ms)
        
        const checkInterval = setInterval(() => {
          checkCount++;
          console.log(`[MapScreen] Checking for ymaps3... (${checkCount}/${maxChecks})`);
          
          if (window.ymaps3) {
            console.log('[MapScreen] ymaps3 API loaded!');
            clearInterval(checkInterval);
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            initMap();
          } else if (checkCount >= maxChecks) {
            console.error('[MapScreen] ymaps3 API not loaded after max checks');
            clearInterval(checkInterval);
            setIsLoading(false);
            WebApp.showAlert('Ошибка: Yandex Maps API не загрузился. Проверьте подключение к интернету.');
          }
        }, 100);
        return;
      }

      try {
        console.log('[MapScreen] Waiting for ymaps3.ready...');
        await window.ymaps3.ready;
        console.log('[MapScreen] ymaps3.ready resolved');

        // Импортируем необходимые модули
        console.log('[MapScreen] Importing YMap modules...');
        const ymaps3 = window.ymaps3;
        
        let YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapMarker;
        
        try {
          const mapModule = await ymaps3.import('@yandex/ymaps3-controls@0.0.1');
          YMap = mapModule.YMap;
          YMapDefaultSchemeLayer = mapModule.YMapDefaultSchemeLayer;
          YMapDefaultFeaturesLayer = mapModule.YMapDefaultFeaturesLayer;
          console.log('[MapScreen] YMap modules imported successfully');
        } catch (error) {
          console.error('[MapScreen] Error importing YMap modules:', error);
          // Попробуем использовать глобальные объекты
          if (window.ymaps3.YMap) {
            YMap = window.ymaps3.YMap;
            YMapDefaultSchemeLayer = window.ymaps3.YMapDefaultSchemeLayer;
            YMapDefaultFeaturesLayer = window.ymaps3.YMapDefaultFeaturesLayer;
            console.log('[MapScreen] Using global YMap objects');
          } else {
            throw new Error('YMap modules not available');
          }
        }

        try {
          const markersModule = await ymaps3.import('@yandex/ymaps3-markers@0.0.1');
          YMapMarker = markersModule.YMapMarker;
          console.log('[MapScreen] YMapMarker module imported successfully');
        } catch (error) {
          console.error('[MapScreen] Error importing YMapMarker module:', error);
          // Попробуем использовать глобальный объект
          if (window.ymaps3.YMapMarker) {
            YMapMarker = window.ymaps3.YMapMarker;
            console.log('[MapScreen] Using global YMapMarker');
          } else {
            console.warn('[MapScreen] YMapMarker not available, markers will not be shown');
          }
        }

        // Получаем геолокацию пользователя
        console.log('[MapScreen] Getting user location...');
        const getUserLocation = (): Promise<{ lat: number; lng: number } | null> => {
          return new Promise((resolve) => {
            if (!navigator.geolocation) {
              console.log('[MapScreen] Geolocation not available');
              resolve(null);
              return;
            }

            navigator.geolocation.getCurrentPosition(
              (position) => {
                console.log('[MapScreen] User location obtained:', position.coords.latitude, position.coords.longitude);
                resolve({
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                });
              },
              (error) => {
                console.log('[MapScreen] Geolocation error:', error);
                // Если геолокация недоступна, используем Москву по умолчанию
                resolve({ lat: 55.7558, lng: 37.6173 });
              },
              { timeout: 5000 }
            );
          });
        };

        const userLocation = await getUserLocation();
        const center = userLocation || { lat: 55.7558, lng: 37.6173 };
        console.log('[MapScreen] Map center:', center);

        // Создаем карту
        console.log('[MapScreen] Creating YMap instance...');
        const map = new YMap(
          mapRef.current,
          {
            location: {
              center: [center.lng, center.lat],
              zoom: 12,
            },
          }
        );
        console.log('[MapScreen] YMap instance created');

        // Добавляем слои (ОБЯЗАТЕЛЬНО!)
        console.log('[MapScreen] Adding YMapDefaultSchemeLayer...');
        map.addChild(new YMapDefaultSchemeLayer());
        console.log('[MapScreen] YMapDefaultSchemeLayer added');

        console.log('[MapScreen] Adding YMapDefaultFeaturesLayer...');
        map.addChild(new YMapDefaultFeaturesLayer());
        console.log('[MapScreen] YMapDefaultFeaturesLayer added');

        mapInstanceRef.current = map;
        (window as any).ymaps3YMap = YMap;
        (window as any).ymaps3Markers = YMapMarker;

        console.log('[MapScreen] Map initialized successfully');

        // Очищаем таймаут
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        // Загружаем импульсы
        console.log('[MapScreen] Loading impulses from Supabase...');
        await loadImpulses();
      } catch (error) {
        console.error('[MapScreen] Error initializing map:', error);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setIsLoading(false);
        WebApp.showAlert(`Ошибка инициализации карты: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
      }
    };

    initMap();

    return () => {
      console.log('[MapScreen] Component unmounting, cleaning up...');
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      // Очистка при размонтировании
      if (mapInstanceRef.current) {
        try {
          console.log('[MapScreen] Destroying map instance...');
          mapInstanceRef.current.destroy();
        } catch (e) {
          console.error('[MapScreen] Error destroying map:', e);
        }
      }
    };
  }, []);

  const loadImpulses = async () => {
    try {
      console.log('[MapScreen] loadImpulses: Querying Supabase...');
      const { data, error } = await supabase
        .from('impulses')
        .select('id, content, category, creator_id, created_at, location_lat, location_lng')
        .not('location_lat', 'is', null)
        .not('location_lng', 'is', null);

      if (error) {
        console.error('[MapScreen] loadImpulses: Supabase error:', error);
        WebApp.showAlert(`Ошибка загрузки данных: ${error.message}`);
      } else {
        console.log(`[MapScreen] loadImpulses: Loaded ${data?.length || 0} impulses with location`);
        setImpulses(data || []);
        
        // Загружаем имена авторов
        if (data && data.length > 0) {
          console.log('[MapScreen] loadImpulses: Loading author names...');
          const creatorIds = [...new Set(data.map(i => i.creator_id))];
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', creatorIds);
          
          const profilesMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
          const impulsesWithAuthors = data.map(impulse => ({
            ...impulse,
            author_name: profilesMap.get(impulse.creator_id) || undefined,
          }));
          
          setImpulses(impulsesWithAuthors);
          console.log('[MapScreen] loadImpulses: Author names loaded');
          addMarkersToMap(impulsesWithAuthors);
        } else {
          addMarkersToMap(data || []);
        }
      }
    } catch (err) {
      console.error('[MapScreen] loadImpulses: Exception:', err);
      WebApp.showAlert(`Ошибка загрузки данных: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
    } finally {
      setIsLoading(false);
      console.log('[MapScreen] loadImpulses: Finished');
    }
  };

  const addMarkersToMap = async (impulsesData: Impulse[]) => {
    console.log(`[MapScreen] addMarkersToMap: Adding ${impulsesData.length} markers...`);
    
    if (!mapInstanceRef.current || !window.ymaps3) {
      console.error('[MapScreen] addMarkersToMap: Map instance or ymaps3 not available');
      return;
    }

    try {
      let YMapMarker = (window as any).ymaps3Markers;
      
      if (!YMapMarker) {
        console.log('[MapScreen] addMarkersToMap: YMapMarker not cached, importing...');
        try {
          const markersModule = await window.ymaps3.import('@yandex/ymaps3-markers@0.0.1');
          YMapMarker = markersModule.YMapMarker;
          (window as any).ymaps3Markers = YMapMarker;
          console.log('[MapScreen] addMarkersToMap: YMapMarker imported');
        } catch (error) {
          console.error('[MapScreen] addMarkersToMap: Error importing YMapMarker:', error);
          if (window.ymaps3.YMapMarker) {
            YMapMarker = window.ymaps3.YMapMarker;
            console.log('[MapScreen] addMarkersToMap: Using global YMapMarker');
          } else {
            console.error('[MapScreen] addMarkersToMap: YMapMarker not available');
            return;
          }
        }
      }

      // Удаляем старые маркеры
      console.log(`[MapScreen] addMarkersToMap: Removing ${markersRef.current.length} old markers...`);
      markersRef.current.forEach((marker, index) => {
        try {
          mapInstanceRef.current.removeChild(marker);
          console.log(`[MapScreen] addMarkersToMap: Removed marker ${index + 1}`);
        } catch (e) {
          console.error(`[MapScreen] addMarkersToMap: Error removing marker ${index + 1}:`, e);
        }
      });
      markersRef.current = [];

      // Добавляем новые маркеры
      console.log('[MapScreen] addMarkersToMap: Adding new markers...');
      impulsesData.forEach((impulse, index) => {
        if (!impulse.location_lat || !impulse.location_lng) {
          console.warn(`[MapScreen] addMarkersToMap: Impulse ${impulse.id} has no location, skipping`);
          return;
        }

        try {
          console.log(`[MapScreen] addMarkersToMap: Creating marker ${index + 1} for impulse ${impulse.id} at [${impulse.location_lng}, ${impulse.location_lat}]`);
          
          // Создаем маркер
          const marker = new YMapMarker({
            coordinates: [impulse.location_lng, impulse.location_lat],
            mapFollowsOnClick: false,
            onClick: () => {
              console.log(`[MapScreen] Marker clicked for impulse ${impulse.id}`);
              showBalloon(impulse);
            },
          });

          mapInstanceRef.current.addChild(marker);
          markersRef.current.push(marker);
          console.log(`[MapScreen] addMarkersToMap: Marker ${index + 1} added successfully`);
        } catch (error) {
          console.error(`[MapScreen] addMarkersToMap: Error adding marker ${index + 1}:`, error);
        }
      });
      
      console.log(`[MapScreen] addMarkersToMap: Successfully added ${markersRef.current.length} markers`);
    } catch (error) {
      console.error('[MapScreen] addMarkersToMap: Exception:', error);
    }
  };

  const showBalloon = (impulse: Impulse) => {
    console.log('[MapScreen] showBalloon: Showing balloon for impulse', impulse.id);
    setSelectedImpulse(impulse);
    WebApp.HapticFeedback.impactOccurred('light');
  };

  const hideBalloon = () => {
    console.log('[MapScreen] hideBalloon: Hiding balloon');
    setSelectedImpulse(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-white/60 mb-2">Загрузка карты...</div>
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
