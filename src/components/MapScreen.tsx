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
  const [impulses, setImpulses] = useState<Impulse[]>([]);
  const [selectedImpulse, setSelectedImpulse] = useState<Impulse | null>(null);

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();

    const initMap = async () => {
      if (!mapRef.current) return;

      // Ждем загрузки Yandex Maps API
      if (!window.ymaps3) {
        // Проверяем каждые 100ms, пока API не загрузится
        const checkInterval = setInterval(() => {
          if (window.ymaps3) {
            clearInterval(checkInterval);
            initMap();
          }
        }, 100);
        return;
      }

      try {
        await window.ymaps3.ready;

        // Импортируем необходимые модули
        const ymaps3 = window.ymaps3;
        const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer } = await ymaps3.import('@yandex/ymaps3-controls@0.0.1');
        const { YMapMarker } = await ymaps3.import('@yandex/ymaps3-markers@0.0.1');

        // Получаем геолокацию пользователя
        const getUserLocation = (): Promise<{ lat: number; lng: number } | null> => {
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
                // Если геолокация недоступна, используем Москву по умолчанию
                resolve({ lat: 55.7558, lng: 37.6173 });
              },
              { timeout: 5000 }
            );
          });
        };

        const userLocation = await getUserLocation();
        const center = userLocation || { lat: 55.7558, lng: 37.6173 };

        // Создаем карту
        const map = new YMap(
          mapRef.current,
          {
            location: {
              center: [center.lng, center.lat],
              zoom: 12,
            },
          }
        );

        // Добавляем слои
        map.addChild(new YMapDefaultSchemeLayer());
        map.addChild(new YMapDefaultFeaturesLayer());

        mapInstanceRef.current = map;
        (window as any).ymaps3Markers = YMapMarker;

        // Загружаем импульсы
        await loadImpulses();
      } catch (error) {
        console.error('Error initializing map:', error);
        setIsLoading(false);
      }
    };

    initMap();

    return () => {
      // Очистка при размонтировании
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.destroy();
        } catch (e) {
          console.error('Error destroying map:', e);
        }
      }
    };
  }, []);

  const loadImpulses = async () => {
    try {
      const { data, error } = await supabase
        .from('impulse_with_author')
        .select('*')
        .not('location_lat', 'is', null)
        .not('location_lng', 'is', null);

      if (error) {
        console.error('Error loading impulses:', error);
      } else {
        setImpulses(data || []);
        addMarkersToMap(data || []);
      }
    } catch (err) {
      console.error('Failed to load impulses:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const addMarkersToMap = async (impulsesData: Impulse[]) => {
    if (!mapInstanceRef.current || !window.ymaps3) return;

    try {
      const YMapMarker = (window as any).ymaps3Markers;
      if (!YMapMarker) {
        const { YMapMarker: Marker } = await window.ymaps3.import('@yandex/ymaps3-markers@0.0.1');
        (window as any).ymaps3Markers = Marker;
      }

      // Удаляем старые маркеры
      markersRef.current.forEach((marker) => {
        try {
          mapInstanceRef.current.removeChild(marker);
        } catch (e) {
          console.error('Error removing marker:', e);
        }
      });
      markersRef.current = [];

      const MarkerClass = (window as any).ymaps3Markers || YMapMarker;

      // Добавляем новые маркеры
      impulsesData.forEach((impulse) => {
        if (!impulse.location_lat || !impulse.location_lng) return;

        try {
          // Создаем маркер
          const marker = new MarkerClass({
            coordinates: [impulse.location_lng, impulse.location_lat],
            mapFollowsOnClick: false,
            onClick: () => {
              showBalloon(impulse);
            },
          });

          mapInstanceRef.current.addChild(marker);
          markersRef.current.push(marker);
        } catch (error) {
          console.error('Error adding marker:', error);
        }
      });
    } catch (error) {
      console.error('Error loading markers module:', error);
    }
  };

  const showBalloon = (impulse: Impulse) => {
    setSelectedImpulse(impulse);
    WebApp.HapticFeedback.impactOccurred('light');
  };

  const hideBalloon = () => {
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
