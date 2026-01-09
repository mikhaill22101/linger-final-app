import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { GeoLocation, MapInstance } from '../types/map';
import { osmMapAdapter } from '../lib/osmMap';

interface MapPickerProps {
  onLocationSelected: (location: GeoLocation, address: string) => void;
  initialLocation?: GeoLocation;
  initialZoom?: number;
}

// Функция получения адреса
async function getAddressFromCoords(lat: number, lng: number): Promise<string> {
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
    console.warn('[getAddressFromCoords] Ошибка:', error);
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
}

// Функция получения геопозиции
function getUserLocation(): Promise<GeoLocation> {
  return new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ lat: 60.0712, lng: 29.9694 }); // Сестрорецк по умолчанию
      }
    }, 3000);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          }
        },
        () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve({ lat: 60.0712, lng: 29.9694 });
          }
        },
        { timeout: 3000, maximumAge: 60000, enableHighAccuracy: false }
      );
    } else {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve({ lat: 60.0712, lng: 29.9694 });
      }
    }
  });
}

const MapPicker: React.FC<MapPickerProps> = ({ onLocationSelected, initialLocation, initialZoom = 16 }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<MapInstance | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<GeoLocation | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string>('Выберите точку на карте');
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const initAttemptedRef = useRef(false);

  // Инициализация карты при монтировании с проверкой контейнера
  useEffect(() => {
    if (initAttemptedRef.current) {
      return;
    }

    // Даем Telegram WebView время отрендерить DOM
    setTimeout(() => {
      const initMap = async () => {
        // КРИТИЧЕСКАЯ ПРОВЕРКА: контейнер должен существовать
        if (!mapContainerRef.current) {
          console.warn('[MapPicker] mapContainerRef.current is null, повторная попытка через 150ms');
          setTimeout(() => {
            if (mapContainerRef.current && !initAttemptedRef.current) {
              initMap();
            }
          }, 150);
          return;
        }

      initAttemptedRef.current = true;

      try {
        // Получаем начальную локацию
        const startLocation = initialLocation || await getUserLocation();
        const zoom = initialZoom || 16; // zoom 16 для точного позиционирования

        console.log('[MapPicker] Инициализация карты:', startLocation, 'zoom:', zoom);

        // Инициализируем карту
        const map = await osmMapAdapter.initMap(mapContainerRef.current, startLocation, zoom);
        mapInstanceRef.current = map;

        // Принудительный Resize
        if (map.invalidateSize) {
          map.invalidateSize();
          setTimeout(() => {
            if (mapInstanceRef.current?.invalidateSize) {
              mapInstanceRef.current.invalidateSize();
            }
          }, 100);
        }

        // Включаем режим выбора точки
        if (map.setLocationSelectMode) {
          map.setLocationSelectMode(true, async (location: GeoLocation) => {
            setSelectedLocation(location);
            setIsLoadingAddress(true);
            setSelectedAddress('Загрузка адреса...');

            // Вибрация
            if (window.Telegram?.WebApp?.HapticFeedback) {
              try {
                window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
              } catch (e) {
                console.warn('[MapPicker] Haptic error:', e);
              }
            }

            // Загружаем адрес для выбранной точки (геокодинг в обработчике onClick)
            try {
              const address = await getAddressFromCoords(location.lat, location.lng);
              setSelectedAddress(address);
              setIsLoadingAddress(false);
              
              // Вызываем коллбэк с координатами и адресом
              onLocationSelected(location, address);
            } catch (error) {
              console.error('[MapPicker] Ошибка получения адреса:', error);
              setSelectedAddress(`${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`);
              setIsLoadingAddress(false);
              onLocationSelected(location, `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`);
            }
          });
        }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.error('[MapPicker] Ошибка инициализации:', error);
      }
    };

      initMap();
    }, 150); // Задержка для Telegram WebView
  }, [initialLocation, initialZoom, onLocationSelected]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        try {
          // Отключаем режим выбора
          if (mapInstanceRef.current.setLocationSelectMode) {
            mapInstanceRef.current.setLocationSelectMode(false, () => {});
          }
          mapInstanceRef.current.destroy();
        } catch (e) {
          console.error('[MapPicker] Ошибка уничтожения:', e);
        }
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-black">
      {/* Контейнер карты - занимает всю доступную высоту */}
      <div
        ref={mapContainerRef}
        className="w-full h-full"
        style={{
          height: '100%',
          width: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />

      {/* Инфо-панель внизу (Glassmorphism) - только при выборе точки */}
      {selectedLocation && (
        <div className="absolute bottom-0 left-0 right-0 p-4 z-[1000] pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/70 backdrop-blur-xl border border-white/30 rounded-2xl p-4 shadow-xl pointer-events-auto"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.7)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 flex items-center justify-center shadow-lg">
                <svg width="20" height="20" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M6 1C4.34 1 3 2.34 3 4c0 2.5 3 6 3 6s3-3.5 3-6c0-1.66-1.34-3-3-3z"
                    stroke="white"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  <circle cx="6" cy="4" r="1.5" fill="white" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-black/60 mb-1 font-medium">Выбранное место</p>
                <p className="text-sm font-semibold text-black leading-tight break-words">
                  {isLoadingAddress ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                      Загрузка адреса...
                    </span>
                  ) : (
                    selectedAddress
                  )}
                </p>
                {selectedLocation && !isLoadingAddress && (
                  <p className="text-xs text-black/40 mt-1 font-mono">
                    {selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Подсказка для выбора точки (только если точка еще не выбрана) */}
      {!selectedLocation && (
        <div className="absolute bottom-4 left-4 right-4 z-[1000] pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-500/90 backdrop-blur-xl border border-blue-400/50 rounded-2xl p-4 text-center pointer-events-auto"
          >
            <p className="text-white text-sm font-medium">
              Кликните на карте, чтобы выбрать место
            </p>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default MapPicker;
