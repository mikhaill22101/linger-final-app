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
    console.log('[MapScreen] ✅ Component mounted');
    WebApp.ready();
    WebApp.expand();

    // Проверяем наличие скрипта в DOM
    const scriptTag = document.querySelector('script[src*="api-maps.yandex.ru"]');
    if (scriptTag) {
      console.log('[MapScreen] ✅ Скрипт Яндекс Карт найден в DOM:', (scriptTag as HTMLScriptElement).src);
      const scriptSrc = (scriptTag as HTMLScriptElement).src;
      if (scriptSrc.includes('apikey=') && !scriptSrc.includes('ВАШ_API_КЛЮЧ')) {
        console.log('[MapScreen] ✅ API ключ присутствует в скрипте');
      } else {
        console.error('[MapScreen] ❌ API ключ отсутствует или является заглушкой!');
      }
      if (scriptSrc.includes('lang=ru_RU')) {
        console.log('[MapScreen] ✅ Язык установлен: ru_RU');
      } else {
        console.warn('[MapScreen] ⚠️ Язык не установлен или отличается от ru_RU');
      }
    } else {
      console.error('[MapScreen] ❌ Скрипт Яндекс Карт не найден в DOM!');
    }

    const initMap = async () => {
      console.log('[MapScreen] 🚀 initMap called');
      
      if (!mapRef.current) {
        console.warn('[MapScreen] ⚠️ mapRef.current is null, retrying on next tick');
        setTimeout(initMap, 0);
        return;
      }

      let errorReason = 'Неизвестная ошибка';
      
      // Устанавливаем таймаут на 5 секунд
      timeoutRef.current = window.setTimeout(() => {
        console.error('[MapScreen] ❌ Map initialization timeout (5 seconds)');
        console.error('[MapScreen] Причина ошибки:', errorReason);
        setIsLoading(false);
        WebApp.showAlert(`Ошибка: Карта не загрузилась за 5 секунд.\nПричина: ${errorReason}`);
      }, 5000);

      // Ждем загрузки Yandex Maps API
      if (!window.ymaps3) {
        console.log('[MapScreen] ⏳ Waiting for ymaps3 API to load...');
        errorReason = 'Yandex Maps API скрипт не загрузился. Проверьте подключение к интернету и наличие скрипта в index.html.';
        let checkCount = 0;
        const maxChecks = 50; // 5 секунд максимум (50 * 100ms)
        
        const checkInterval = setInterval(() => {
          checkCount++;
          console.log(`[MapScreen] 🔍 Checking for ymaps3... (${checkCount}/${maxChecks})`);
          
          if (window.ymaps3) {
            console.log('[MapScreen] ✅ ymaps3 API loaded!');
            clearInterval(checkInterval);
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            initMap();
          } else if (checkCount >= maxChecks) {
            console.error('[MapScreen] ❌ ymaps3 API not loaded after max checks');
            clearInterval(checkInterval);
            setIsLoading(false);
            WebApp.showAlert(`Ошибка: Yandex Maps API не загрузился.\nПричина: ${errorReason}`);
          }
        }, 100);
        return;
      }

      console.log('[MapScreen] ✅ Скрипт найден, window.ymaps3 существует');

      try {
        console.log('[MapScreen] ⏳ Waiting for ymaps3.ready...');
        await window.ymaps3.ready;
        console.log('[MapScreen] ✅ API готов (ymaps3.ready resolved)');

        // Импортируем необходимые модули
        console.log('[MapScreen] 📦 Importing YMap modules...');
        const ymaps3 = window.ymaps3;
        
        let YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapMarker;
        
        // Пробуем разные варианты импорта для совместимости
        const importPaths = [
          '@yandex/ymaps3-controls',
          '@yandex/ymaps3-controls@0.0.1',
        ];
        
        let mapModuleImported = false;
        for (const importPath of importPaths) {
          try {
            console.log(`[MapScreen] 🔄 Trying to import: ${importPath}`);
            const mapModule = await ymaps3.import(importPath);
            YMap = mapModule.YMap;
            YMapDefaultSchemeLayer = mapModule.YMapDefaultSchemeLayer;
            YMapDefaultFeaturesLayer = mapModule.YMapDefaultFeaturesLayer;
            
            if (YMap && YMapDefaultSchemeLayer && YMapDefaultFeaturesLayer) {
              console.log(`[MapScreen] ✅ YMap modules imported successfully from ${importPath}`);
              mapModuleImported = true;
              break;
            }
          } catch (error) {
            console.warn(`[MapScreen] ⚠️ Failed to import from ${importPath}:`, error);
          }
        }
        
        if (!mapModuleImported) {
          errorReason = 'Не удалось импортировать модули YMap. Проверьте версию API и доступность модулей.';
          // Попробуем использовать глобальные объекты
          if (window.ymaps3.YMap) {
            YMap = window.ymaps3.YMap;
            YMapDefaultSchemeLayer = window.ymaps3.YMapDefaultSchemeLayer;
            YMapDefaultFeaturesLayer = window.ymaps3.YMapDefaultFeaturesLayer;
            console.log('[MapScreen] ✅ Using global YMap objects');
            mapModuleImported = true;
          } else {
            throw new Error(errorReason);
          }
        }

        // Импортируем маркеры
        const markerImportPaths = [
          '@yandex/ymaps3-markers',
          '@yandex/ymaps3-markers@0.0.1',
        ];
        
        let markerModuleImported = false;
        for (const importPath of markerImportPaths) {
          try {
            console.log(`[MapScreen] 🔄 Trying to import markers: ${importPath}`);
            const markersModule = await ymaps3.import(importPath);
            YMapMarker = markersModule.YMapMarker;
            
            if (YMapMarker) {
              console.log(`[MapScreen] ✅ YMapMarker module imported successfully from ${importPath}`);
              markerModuleImported = true;
              break;
            }
          } catch (error) {
            console.warn(`[MapScreen] ⚠️ Failed to import markers from ${importPath}:`, error);
          }
        }
        
        if (!markerModuleImported) {
          // Попробуем использовать глобальный объект
          if (window.ymaps3.YMapMarker) {
            YMapMarker = window.ymaps3.YMapMarker;
            console.log('[MapScreen] ✅ Using global YMapMarker');
            markerModuleImported = true;
          } else {
            console.warn('[MapScreen] ⚠️ YMapMarker not available, markers will not be shown');
            errorReason = 'Модуль YMapMarker не доступен. Маркеры не будут отображаться.';
          }
        }

        // Проверяем наличие всех необходимых классов
        if (!YMap) {
          errorReason = 'YMap класс не найден. Проверьте импорт модулей.';
          throw new Error(errorReason);
        }
        if (!YMapDefaultSchemeLayer) {
          errorReason = 'YMapDefaultSchemeLayer класс не найден. Без него карта будет серой.';
          throw new Error(errorReason);
        }
        if (!YMapDefaultFeaturesLayer) {
          errorReason = 'YMapDefaultFeaturesLayer класс не найден. Без него карта будет серой.';
          throw new Error(errorReason);
        }
        
        console.log('[MapScreen] ✅ Все необходимые классы проверены');

        // Получаем геолокацию пользователя
        console.log('[MapScreen] 📍 Getting user location...');
        const getUserLocation = (): Promise<{ lat: number; lng: number } | null> => {
          return new Promise((resolve) => {
            if (!navigator.geolocation) {
              console.log('[MapScreen] ⚠️ Geolocation not available');
              resolve(null);
              return;
            }

            navigator.geolocation.getCurrentPosition(
              (position) => {
                console.log('[MapScreen] ✅ User location obtained:', position.coords.latitude, position.coords.longitude);
                resolve({
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                });
              },
              (error) => {
                console.log('[MapScreen] ⚠️ Geolocation error:', error);
                // Если геолокация недоступна, используем Москву по умолчанию
                resolve({ lat: 55.7558, lng: 37.6173 });
              },
              { timeout: 5000 }
            );
          });
        };

        const userLocation = await getUserLocation();
        const center = userLocation || { lat: 55.7558, lng: 37.6173 };
        console.log('[MapScreen] 📍 Map center:', center);

        // Создаем карту
        console.log('[MapScreen] 🗺️ Creating YMap instance...');
        // @ts-ignore - ymaps3 типы могут быть недоступны
        const map = new YMap(
          mapRef.current,
          {
            location: {
              center: [center.lng, center.lat], // [longitude, latitude] - правильный формат для Яндекс Карт v3
              zoom: 12,
            },
          }
        );
        console.log('[MapScreen] ✅ YMap instance created');

        // Добавляем слои (ОБЯЗАТЕЛЬНО! Без них карта будет серой)
        console.log('[MapScreen] 🎨 Adding YMapDefaultSchemeLayer...');
        // @ts-ignore
        const schemeLayer = new YMapDefaultSchemeLayer();
        map.addChild(schemeLayer);
        console.log('[MapScreen] ✅ YMapDefaultSchemeLayer added - Слои добавлены');

        console.log('[MapScreen] 🎨 Adding YMapDefaultFeaturesLayer...');
        // @ts-ignore
        const featuresLayer = new YMapDefaultFeaturesLayer();
        map.addChild(featuresLayer);
        console.log('[MapScreen] ✅ YMapDefaultFeaturesLayer added - Слои добавлены');

        mapInstanceRef.current = map;
        (window as any).ymaps3YMap = YMap;
        (window as any).ymaps3Markers = YMapMarker;

        console.log('[MapScreen] ✅ Map initialized successfully');

        // Очищаем таймаут
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        // Загружаем импульсы
        console.log('[MapScreen] 📊 Loading impulses from Supabase...');
        await loadImpulses();
        console.log('[MapScreen] ✅ Данные из Supabase получены');
      } catch (error) {
        console.error('[MapScreen] ❌ Error initializing map:', error);
        errorReason = error instanceof Error ? error.message : JSON.stringify(error);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setIsLoading(false);
        const errorMessage = `Ошибка инициализации карты: ${errorReason}`;
        console.error('[MapScreen] Показываем alert:', errorMessage);
        WebApp.showAlert(errorMessage);
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
      console.log('[MapScreen] 📊 loadImpulses: Querying Supabase...');
      const { data, error } = await supabase
        .from('impulses')
        .select('id, content, category, creator_id, created_at, location_lat, location_lng')
        .not('location_lat', 'is', null)
        .not('location_lng', 'is', null);

      if (error) {
        console.error('[MapScreen] ❌ loadImpulses: Supabase error:', error);
        WebApp.showAlert(`Ошибка загрузки данных: ${error.message}`);
        return;
      }

      console.log(`[MapScreen] ✅ loadImpulses: Loaded ${data?.length || 0} impulses with location from Supabase`);
      
      // Логируем координаты для отладки
      if (data && data.length > 0) {
        data.forEach((impulse, index) => {
          console.log(`[MapScreen] 📍 Impulse ${index + 1} (ID: ${impulse.id}): lat=${impulse.location_lat}, lng=${impulse.location_lng}`);
        });
      }
      
      setImpulses(data || []);
      
      // Загружаем имена авторов
      if (data && data.length > 0) {
        console.log('[MapScreen] 👤 loadImpulses: Loading author names...');
        const creatorIds = [...new Set(data.map(i => i.creator_id))];
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', creatorIds);
        
        if (profilesError) {
          console.warn('[MapScreen] ⚠️ Error loading profiles:', profilesError);
        } else {
          console.log(`[MapScreen] ✅ Loaded ${profiles?.length || 0} profiles`);
        }
        
        const profilesMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);
        const impulsesWithAuthors = data.map(impulse => ({
          ...impulse,
          author_name: profilesMap.get(impulse.creator_id) || undefined,
        }));
        
        setImpulses(impulsesWithAuthors);
        console.log('[MapScreen] ✅ Author names loaded');
        console.log('[MapScreen] 📊 Данные из Supabase получены');
        addMarkersToMap(impulsesWithAuthors);
      } else {
        console.log('[MapScreen] ℹ️ No impulses with location found');
        addMarkersToMap(data || []);
      }
    } catch (err) {
      console.error('[MapScreen] ❌ loadImpulses: Exception:', err);
      WebApp.showAlert(`Ошибка загрузки данных: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
    } finally {
      setIsLoading(false);
      console.log('[MapScreen] ✅ loadImpulses: Finished');
    }
  };

  const addMarkersToMap = async (impulsesData: Impulse[]) => {
    console.log(`[MapScreen] 📍 addMarkersToMap: Adding ${impulsesData.length} markers...`);
    
    if (!mapInstanceRef.current) {
      console.error('[MapScreen] ❌ addMarkersToMap: Map instance not available');
      return;
    }
    
    if (!window.ymaps3) {
      console.error('[MapScreen] ❌ addMarkersToMap: window.ymaps3 not available');
      return;
    }

    try {
      let YMapMarker = (window as any).ymaps3Markers;
      
      if (!YMapMarker) {
        console.log('[MapScreen] 📦 addMarkersToMap: YMapMarker not cached, importing...');
        const markerImportPaths = [
          '@yandex/ymaps3-markers',
          '@yandex/ymaps3-markers@0.0.1',
        ];
        
        let imported = false;
        for (const importPath of markerImportPaths) {
          try {
            console.log(`[MapScreen] 🔄 Trying to import markers: ${importPath}`);
            const markersModule = await window.ymaps3.import(importPath);
            YMapMarker = markersModule.YMapMarker;
            if (YMapMarker) {
              (window as any).ymaps3Markers = YMapMarker;
              console.log(`[MapScreen] ✅ YMapMarker imported from ${importPath}`);
              imported = true;
              break;
            }
          } catch (error) {
            console.warn(`[MapScreen] ⚠️ Failed to import markers from ${importPath}:`, error);
          }
        }
        
        if (!imported) {
          if (window.ymaps3.YMapMarker) {
            YMapMarker = window.ymaps3.YMapMarker;
            (window as any).ymaps3Markers = YMapMarker;
            console.log('[MapScreen] ✅ Using global YMapMarker');
          } else {
            console.error('[MapScreen] ❌ YMapMarker not available');
            return;
          }
        }
      }

      // Удаляем старые маркеры
      console.log(`[MapScreen] 🗑️ Removing ${markersRef.current.length} old markers...`);
      markersRef.current.forEach((marker, index) => {
        try {
          mapInstanceRef.current.removeChild(marker);
          console.log(`[MapScreen] ✅ Removed marker ${index + 1}`);
        } catch (e) {
          console.error(`[MapScreen] ❌ Error removing marker ${index + 1}:`, e);
        }
      });
      markersRef.current = [];

      // Добавляем новые маркеры
      console.log('[MapScreen] 📍 Adding new markers...');
      let addedCount = 0;
      impulsesData.forEach((impulse, index) => {
        // Проверяем наличие координат из Supabase
        if (!impulse.location_lat || !impulse.location_lng) {
          console.warn(`[MapScreen] ⚠️ Impulse ${impulse.id} has no location (lat: ${impulse.location_lat}, lng: ${impulse.location_lng}), skipping`);
          return;
        }

        // Проверяем валидность координат
        if (typeof impulse.location_lat !== 'number' || typeof impulse.location_lng !== 'number') {
          console.warn(`[MapScreen] ⚠️ Impulse ${impulse.id} has invalid coordinates (lat: ${typeof impulse.location_lat}, lng: ${typeof impulse.location_lng}), skipping`);
          return;
        }

        // Проверяем диапазон координат (широта: -90 до 90, долгота: -180 до 180)
        if (impulse.location_lat < -90 || impulse.location_lat > 90 || 
            impulse.location_lng < -180 || impulse.location_lng > 180) {
          console.warn(`[MapScreen] ⚠️ Impulse ${impulse.id} has out-of-range coordinates (lat: ${impulse.location_lat}, lng: ${impulse.location_lng}), skipping`);
          return;
        }

        try {
          // Яндекс Карт v3 принимает координаты в формате [longitude, latitude]
          const coordinates: [number, number] = [impulse.location_lng, impulse.location_lat];
          console.log(`[MapScreen] 📍 Creating marker ${index + 1} for impulse ${impulse.id} at [${coordinates[0]}, ${coordinates[1]}] (lng, lat)`);
          
          // Создаем маркер
          // @ts-ignore
          const marker = new YMapMarker({
            coordinates: coordinates,
            mapFollowsOnClick: false,
            onClick: () => {
              console.log(`[MapScreen] 🖱️ Marker clicked for impulse ${impulse.id}`);
              showBalloon(impulse);
            },
          });

          mapInstanceRef.current.addChild(marker);
          markersRef.current.push(marker);
          addedCount++;
          console.log(`[MapScreen] ✅ Marker ${index + 1} added successfully`);
        } catch (error) {
          console.error(`[MapScreen] ❌ Error adding marker ${index + 1}:`, error);
        }
      });
      
      console.log(`[MapScreen] ✅ Successfully added ${addedCount} markers out of ${impulsesData.length} impulses`);
    } catch (error) {
      console.error('[MapScreen] ❌ addMarkersToMap: Exception:', error);
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
