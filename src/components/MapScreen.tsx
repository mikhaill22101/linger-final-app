import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, MapPin, X } from 'lucide-react';
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
  event_date?: string | null;
  event_time?: string | null;
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
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

// Форматирование относительного времени ("Опубликовано X назад")
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const lang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  const isRussian = !lang || lang === 'ru';

  if (diffMins < 1) {
    return isRussian ? 'Только что' : 'Just now';
  } else if (diffMins < 60) {
    return isRussian ? `${diffMins} мин назад` : `${diffMins} min ago`;
  } else if (diffHours < 24) {
    return isRussian ? `${diffHours} ч назад` : `${diffHours} h ago`;
  } else if (diffDays < 7) {
    return isRussian ? `${diffDays} дн назад` : `${diffDays} days ago`;
  } else {
    return isRussian
      ? date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
      : date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
  }
}

// Форматирование даты и времени начала события ("Начало: Дата в Время")
export function formatEventDateTime(eventDate?: string, eventTime?: string): string | null {
  if (!eventDate || !eventTime) return null;

  const lang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  const isRussian = !lang || lang === 'ru';
  const date = new Date(eventDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDateOnly = new Date(date);
  eventDateOnly.setHours(0, 0, 0, 0);

  const isToday = eventDateOnly.getTime() === today.getTime();

  if (isToday) {
    return isRussian ? `Начало: Сегодня в ${eventTime}` : `Start: Today at ${eventTime}`;
  } else {
    const dateStr = isRussian
      ? date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
      : date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
    return isRussian ? `Начало: ${dateStr} в ${eventTime}` : `Start: ${dateStr} at ${eventTime}`;
  }
}

// Функция форматирования расстояния
export function formatDistance(km: number): string {
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
      .select('id, content, category, creator_id, created_at, location_lat, location_lng, event_date, event_time')
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
      creator_id: row.creator_id,
      author_name: profilesMap.get(row.creator_id) || undefined,
      location_lat: row.location_lat as number,
      location_lng: row.location_lng as number,
      created_at: row.created_at,
      address: undefined,
      event_date: row.event_date || undefined,
      event_time: row.event_time || undefined,
    }));

    console.log(`[loadImpulses] Возвращаем ${impulses.length} импульсов (без адресов)`);
    return impulses;
  } catch (error) {
    console.error('[loadImpulses] Критическая ошибка:', error);
    return [];
  }
}

interface Friend {
  id: number;
  full_name?: string;
  avatar_url?: string;
  username?: string;
  location_lat?: number;
  location_lng?: number;
}

interface MapScreenProps {
  activeCategory?: string | null;
  refreshTrigger?: number; // При изменении этого значения карта обновляет данные
  isSelectionMode?: boolean; // Режим выбора точки на карте
  onLocationSelected?: (location: GeoLocation) => void; // Коллбэк при выборе точки
  onEventSelected?: (impulse: ImpulseLocation | null) => void; // Коллбэк при выборе события (для скрытия таб-бара)
  onBack?: () => void; // Коллбэк для возврата на главную
  isBackground?: boolean; // Режим фона (для главной страницы)
  onEventLongPress?: (impulse: ImpulseLocation) => void; // Коллбэк при длительном нажатии на событие
  showFriends?: boolean; // Режим отображения друзей
  friends?: Friend[]; // Список друзей для отображения
  onFriendsNearby?: (friendIds: number[]) => void; // Коллбэк когда друзья рядом
  maxEvents?: number; // Максимальное количество событий для отображения (для главной страницы - 3-4)
  userLocation?: GeoLocation | null; // Координаты пользователя из родительского компонента (для принудительного центрирования)
}

const MapScreen: React.FC<MapScreenProps> = ({ activeCategory, refreshTrigger, isSelectionMode, onLocationSelected, onEventSelected, onBack, isBackground = false, onEventLongPress, showFriends = false, friends = [], onFriendsNearby, maxEvents, userLocation: propUserLocation }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<MapInstance | null>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [selectedImpulse, setSelectedImpulse] = useState<ImpulseLocation | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [impulses, setImpulses] = useState<ImpulseLocation[]>([]);
  const [nearbyEvents, setNearbyEvents] = useState<Array<ImpulseLocation & { distance: number }>>([]);
  const [userLocation, setUserLocation] = useState<GeoLocation | null>(null);
  const [isEventDetailOpen, setIsEventDetailOpen] = useState(false); // Детальное окно события
  const [lastClickedImpulseId, setLastClickedImpulseId] = useState<number | null>(null); // ID последнего кликнутого события
  const loadingTimeoutRef = useRef<number | null>(null);
  const initAttemptedRef = useRef(false);
  const addressCacheRef = useRef<Map<string, string>>(new Map());
  const shakeDetectionRef = useRef<{ lastX: number; lastY: number; lastZ: number; lastTime: number; shakeCount: number } | null>(null);
  const nearbyFriendsRef = useRef<Set<number>>(new Set());
  const celebrationActiveRef = useRef(false);
  const [showCelebration, setShowCelebration] = useState(false);

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
            
            // Используем propUserLocation если передан, иначе получаем геопозицию
            let currentUserLocation: GeoLocation;
            if (propUserLocation) {
              currentUserLocation = propUserLocation;
              setUserLocation(propUserLocation);
              console.log('[MapScreen] Используем userLocation из props:', propUserLocation);
            } else {
              // Получаем геопозицию (максимум 3 секунды, резерв Сестрорецк)
              currentUserLocation = await getUserLocation();
              setUserLocation(currentUserLocation);
              console.log('[MapScreen] Получена геопозиция через getUserLocation:', currentUserLocation);
            }
            
            const isDefaultLocation = currentUserLocation.lat === DEFAULT_LOCATION.lat && currentUserLocation.lng === DEFAULT_LOCATION.lng;
            const finalZoom = isDefaultLocation ? 13 : 15;
            const initialZoom = isBackground || maxEvents ? 14 : 2.5; // Для HomeScreen сразу используем нормальный zoom

            console.log('[MapScreen] Создание карты:', currentUserLocation, 'final zoom:', finalZoom, 'initial zoom:', initialZoom);
            
            if (!mapRef.current) {
              throw new Error('mapRef.current is null перед инициализацией');
            }

            // Инициализируем карту (для HomeScreen сразу с финальным zoom, для отдельной страницы - с эффектом полета)
            const map = await osmMapAdapter.initMap(mapRef.current, currentUserLocation, initialZoom);
            mapInstanceRef.current = map;
            
            // ПРИНУДИТЕЛЬНЫЙ Resize для Leaflet (сразу после создания)
            if (mapInstanceRef.current.invalidateSize) {
              mapInstanceRef.current.invalidateSize();
              setTimeout(() => {
                if (mapInstanceRef.current?.invalidateSize) {
                  mapInstanceRef.current.invalidateSize();
          }
        }, 100);
            }
            
            // Добавляем антрацитовую булавку локации пользователя
            if (mapInstanceRef.current.setUserLocation) {
              mapInstanceRef.current.setUserLocation(currentUserLocation);
            }
            
            // Для HomeScreen (isBackground или maxEvents) центрируем сразу с правильным zoom
            if (isBackground || maxEvents) {
              // Принудительное точное центрирование на координатах пользователя для HomeScreen
              setTimeout(() => {
                if (mapInstanceRef.current) {
                  // Используем setCenter для точного позиционирования без анимации
                  if (mapInstanceRef.current.setCenter) {
                    mapInstanceRef.current.setCenter(currentUserLocation, finalZoom);
                  } else {
                    // Fallback на flyTo если setCenter недоступен
                    mapInstanceRef.current.flyTo(currentUserLocation, finalZoom, 0.3);
                  }
                  console.log('[MapScreen] Карта точно центрирована на пользователе для HomeScreen (zoom:', finalZoom, ')');
                }
              }, 300); // Увеличенная задержка для гарантии правильного расчета размеров
            }

            // Эффект плавного полета камеры (Zenly Style): только для отдельной страницы карты, не для HomeScreen
            if (!isBackground && !maxEvents) {
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
            }

            // Загружаем данные из Supabase после отрисовки карты
            console.log('[MapScreen] Загрузка импульсов из Supabase...');
            const loadedImpulses = await loadImpulses();
            setImpulses(loadedImpulses);
            
            console.log(`[MapScreen] Загружено ${loadedImpulses.length} импульсов`);
            
            // Отображаем маркеры БЫСТРО (без адресов)
            if (loadedImpulses.length > 0) {
              // Рассчитываем близлежащие события и ограничиваем количество для главной страницы
              let nearestEventId: number | undefined;
              let eventsToShow = loadedImpulses;
              
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
                  .sort((a, b) => a.distance - b.distance);
                
                // Ограничиваем количество событий для отображения на карте (для главной страницы)
                const limit = maxEvents || loadedImpulses.length;
                const limitedEvents = eventsWithDistance.slice(0, limit);
                setNearbyEvents(limitedEvents);
                nearestEventId = limitedEvents.length > 0 ? limitedEvents[0].id : undefined;
                
                // Для карты-окна на главной странице показываем только ограниченное количество
                if (maxEvents && maxEvents > 0) {
                  eventsToShow = limitedEvents.map(({ distance, ...e }) => ({
                    ...e,
                  }));
                }
              }

              map.setMarkers(eventsToShow, async (impulse) => {
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
                
                // Логика двух кликов:
                // 1. Первый клик - фокус на событии (увеличение маркера, flyTo, показ карточки)
                // 2. Второй клик на то же событие - открытие детального окна
                if (lastClickedImpulseId === impulse.id && selectedImpulse?.id === impulse.id) {
                  // Второй клик - открываем детальное окно
                  setIsEventDetailOpen(true);
                  if (window.Telegram?.WebApp?.HapticFeedback) {
                    try {
                      window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                    } catch (e) {
                      console.warn('[MapScreen] Haptic error:', e);
                    }
                  }
          } else {
                  // Первый клик - фокус на событии
                  setSelectedImpulse(impulseWithAddress);
                  setLastClickedImpulseId(impulse.id);
                  
                  // Увеличиваем маркер и фокусируемся на событии
                  if (mapInstanceRef.current && impulse.location_lat && impulse.location_lng) {
                    mapInstanceRef.current.flyTo(
                      { lat: impulse.location_lat, lng: impulse.location_lng },
                      16, // Увеличенный zoom для фокуса
                      0.8 // Быстрая анимация
                    );
                  }
                  
                  // Вибрация при клике на маркер
                  if (window.Telegram?.WebApp?.HapticFeedback) {
                    try {
                      window.Telegram.WebApp.HapticFeedback.selectionChanged();
                    } catch (e) {
                      try {
                        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                      } catch (e2) {
                        console.warn('[MapScreen] Haptic error:', e2);
                      }
                    }
                  }
                }
              }, activeCategory || null, nearestEventId, isBackground ? onEventLongPress : undefined);
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

  // ПРИНУДИТЕЛЬНОЕ ЦЕНТРИРОВАНИЕ: Если propUserLocation передан из родителя (HomeScreen), центрируем карту при его изменении
  useEffect(() => {
    if (status === 'ready' && propUserLocation && mapInstanceRef.current) {
      console.log('[MapScreen] Принудительное центрирование на userLocation из props:', propUserLocation);
      
      // Обновляем внутренний userLocation
      setUserLocation(propUserLocation);
      
      // Обновляем маркер пользователя
      if (mapInstanceRef.current.setUserLocation) {
        mapInstanceRef.current.setUserLocation(propUserLocation);
      }
      
      // Принудительно центрируем карту на пользователе
      const isDefaultLocation = propUserLocation.lat === DEFAULT_LOCATION.lat && propUserLocation.lng === DEFAULT_LOCATION.lng;
      // Для HomeScreen (maxEvents) используем zoom 14, для отдельной страницы - 15
      const finalZoom = isDefaultLocation ? 13 : (maxEvents ? 14 : 15);
      
      // Используем invalidateSize перед центрированием для карты в скрытом/изменяющемся контейнере
      if (mapInstanceRef.current.invalidateSize) {
        mapInstanceRef.current.invalidateSize();
        // Второй вызов через небольшую задержку для гарантии
        setTimeout(() => {
          if (mapInstanceRef.current?.invalidateSize) {
            mapInstanceRef.current.invalidateSize();
          }
        }, 50);
      }
      
      // ТОЧНОЕ центрирование карты на пользователе (setCenter для точного позиционирования без анимации)
      setTimeout(() => {
        if (mapInstanceRef.current && mapInstanceRef.current.setCenter) {
          // Используем setCenter для точного центрирования без анимации
          mapInstanceRef.current.setCenter(propUserLocation, finalZoom);
          console.log('[MapScreen] Карта точно центрирована на пользователе (zoom:', finalZoom, ') для HomeScreen:', !!maxEvents);
        } else if (mapInstanceRef.current) {
          // Fallback на flyTo если setCenter недоступен
          mapInstanceRef.current.flyTo(propUserLocation, finalZoom, 0.3);
        }
      }, 200); // Увеличенная задержка для гарантии правильного расчета размеров
    }
  }, [propUserLocation, status]);

  // Обновляем данные при изменении refreshTrigger
  useEffect(() => {
    if (status === 'ready' && refreshTrigger && refreshTrigger > 0) {
      console.log('[MapScreen] Обновление данных по refreshTrigger:', refreshTrigger);
      const reloadData = async () => {
        const loadedImpulses = await loadImpulses();
        setImpulses(loadedImpulses);
        
        // Обновляем близлежащие события с учетом лимита
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
            .sort((a, b) => a.distance - b.distance);
          
          const limit = maxEvents || 3;
          const limitedEvents = eventsWithDistance.slice(0, limit);
          setNearbyEvents(limitedEvents);
          
          // Обновляем маркеры на карте с учетом лимита
          if (mapInstanceRef.current && maxEvents && maxEvents > 0) {
            const eventsToShow = limitedEvents.map(e => ({
              id: e.id,
              content: e.content,
              category: e.category,
              creator_id: e.creator_id,
              location_lat: e.location_lat,
              location_lng: e.location_lng,
              created_at: e.created_at,
              address: e.address,
              event_date: e.event_date,
              event_time: e.event_time,
            }));
            
            mapInstanceRef.current.setMarkers(eventsToShow, async (impulse) => {
              // Логика обработки клика на маркер (уже обработана в основном обработчике выше)
              if (onEventSelected) {
                onEventSelected(impulse);
              }
            }, activeCategory || null, undefined, isBackground ? onEventLongPress : undefined);
          }
        }
        
        if (mapInstanceRef.current && loadedImpulses.length > 0 && !isSelectionMode) {
          // Определяем ближайшее событие для анимации пульсации
          const nearestEventIdForRefresh = nearbyEvents.length > 0 ? nearbyEvents[0].id : undefined;
          
          // Используем ограниченное количество событий, если задан maxEvents
          const eventsToDisplay = maxEvents && maxEvents > 0 && nearbyEvents.length > 0
            ? nearbyEvents.map(({ distance, ...e }) => ({
                ...e,
              }))
            : loadedImpulses;
          
          mapInstanceRef.current.setMarkers(eventsToDisplay, async (impulse) => {
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
            
            // Добавляем яркую синюю булавку локации пользователя
            if (mapInstanceRef.current.setUserLocation) {
              mapInstanceRef.current.setUserLocation(currentUserLocation);
            }

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
                    .slice(0, 3);
                  setNearbyEvents(eventsWithDistance);
                  nearestEventIdForRetry = eventsWithDistance.length > 0 ? eventsWithDistance[0].id : undefined;
                  
                  // Обновляем локацию пользователя на карте
                  if (mapInstanceRef.current && mapInstanceRef.current.setUserLocation) {
                    mapInstanceRef.current.setUserLocation(currentUserLocation);
                  }
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

  // Функция расчета расстояния между двумя точками (Haversine formula) - для друзей
  const calculateDistanceBetweenFriends = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371; // Радиус Земли в километрах
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1000; // Возвращаем в метрах
  };

  // Определение близости друзей (30 метров)
  useEffect(() => {
    if (!showFriends || !userLocation || friends.length === 0) {
      nearbyFriendsRef.current.clear();
          return;
        }

    const checkNearbyFriends = () => {
      const nearby: Set<number> = new Set();
      
      friends.forEach(friend => {
        if (friend.location_lat && friend.location_lng) {
          const distance = calculateDistanceBetweenFriends(
            userLocation.lat,
            userLocation.lng,
            friend.location_lat,
            friend.location_lng
          );
          
          if (distance <= 30) { // 30 метров
            nearby.add(friend.id);
          }
        }
      });

      // Если есть изменения в близких друзьях
      const hasChanges = nearby.size !== nearbyFriendsRef.current.size || 
        Array.from(nearby).some(id => !nearbyFriendsRef.current.has(id));
      
      if (hasChanges) {
        nearbyFriendsRef.current = nearby;
        if (onFriendsNearby && nearby.size > 0) {
          onFriendsNearby(Array.from(nearby));
        }
      }
    };

    checkNearbyFriends();
    const interval = setInterval(checkNearbyFriends, 2000); // Проверяем каждые 2 секунды
    return () => clearInterval(interval);
  }, [showFriends, userLocation, friends, onFriendsNearby]);

  // Определение тряски телефона через акселерометр
  useEffect(() => {
    if (!showFriends || nearbyFriendsRef.current.size === 0 || celebrationActiveRef.current) {
          return;
        }

    // Пытаемся использовать DeviceMotionEvent
    const DeviceMotionEventWithPermission = DeviceMotionEvent as any;
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEventWithPermission.requestPermission === 'function') {
      DeviceMotionEventWithPermission.requestPermission()
        .then((permission: string) => {
          if (permission === 'granted') {
            startShakeDetection();
          }
        })
        .catch(() => {
          // Fallback для браузеров без requestPermission
          startShakeDetection();
        });
    } else {
      startShakeDetection();
    }

    function startShakeDetection() {
      if (!shakeDetectionRef.current) {
        shakeDetectionRef.current = {
          lastX: 0,
          lastY: 0,
          lastZ: 0,
          lastTime: Date.now(),
          shakeCount: 0,
        };
      }

      const handleMotion = (e: DeviceMotionEvent) => {
        if (!e.accelerationIncludingGravity) return;

        const { x, y, z } = e.accelerationIncludingGravity;
        const now = Date.now();
        const timeDiff = now - shakeDetectionRef.current!.lastTime;

        if (timeDiff > 100) { // Проверяем каждые 100ms
          const deltaX = Math.abs(x! - shakeDetectionRef.current!.lastX);
          const deltaY = Math.abs(y! - shakeDetectionRef.current!.lastY);
          const deltaZ = Math.abs(z! - shakeDetectionRef.current!.lastZ);

          const totalDelta = deltaX + deltaY + deltaZ;

          // Порог для определения тряски (можно настроить)
          if (totalDelta > 15) {
            shakeDetectionRef.current!.shakeCount++;
            
            // Если тряска продолжается (3+ раза подряд)
            if (shakeDetectionRef.current!.shakeCount >= 3 && nearbyFriendsRef.current.size > 0) {
              triggerCelebration();
              shakeDetectionRef.current!.shakeCount = 0;
            }
          } else {
            shakeDetectionRef.current!.shakeCount = 0;
          }

          shakeDetectionRef.current!.lastX = x!;
          shakeDetectionRef.current!.lastY = y!;
          shakeDetectionRef.current!.lastZ = z!;
          shakeDetectionRef.current!.lastTime = now;
        }
      };

      window.addEventListener('devicemotion', handleMotion);

      return () => {
        window.removeEventListener('devicemotion', handleMotion);
      };
    }

    return startShakeDetection();
  }, [showFriends, nearbyFriendsRef.current.size]);

  // Функция запуска празднования (салют + вибрация)
  const triggerCelebration = () => {
    if (celebrationActiveRef.current) return;
    
    celebrationActiveRef.current = true;
    setShowCelebration(true);

    // Интенсивная вибрация (паттерн: длинная, пауза, короткая, пауза, длинная)
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
      try {
        // Интенсивная вибрация
        const vibratePattern = [0, 200, 100, 200, 100, 300];
        let delay = 0;
        vibratePattern.forEach((duration, index) => {
          if (index % 2 === 1) { // Только для длительностей вибрации
            setTimeout(() => {
              if (window.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.impactOccurred('heavy');
              }
            }, delay);
          }
          delay += duration;
        });
      } catch (e) {
        console.warn('[MapScreen] Haptic error:', e);
      }
    }

    // Скрываем анимацию через 3 секунды
    setTimeout(() => {
      setShowCelebration(false);
      celebrationActiveRef.current = false;
    }, 3000);
  };


  // КОНТЕЙНЕР КАРТЫ ВСЕГДА В DOM (просто скрыт во время загрузки)
    return (
    <div className={`relative w-full h-screen bg-black ${isBackground ? 'pointer-events-none' : ''}`} style={isBackground ? { opacity: 0.3 } : {}}>
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
          <h3 className="text-xs text-white/70 mb-2 px-2" style={{ background: 'transparent' }}>Ближайшие события</h3>
          <div className="bg-black/90 backdrop-blur-xl border border-white/20 rounded-2xl p-3">
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
                      <span>
                        {(() => {
                          const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                          return isRussian ? `Опубликовано ${formatRelativeTime(event.created_at)}` : `Published ${formatRelativeTime(event.created_at)}`;
                        })()}
                      </span>
                    </div>
                  )}
                  {(event as any).event_date && (event as any).event_time && (
                    <div className="flex items-center gap-1 text-[10px] text-white/60 mt-1">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1"/>
                        <path d="M6 3v3l2 1" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                      </svg>
                      <span>{formatEventDateTime((event as any).event_date, (event as any).event_time)}</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Кнопка "Назад" - ярко-белая и глянцевая (только если onBack передан, т.е. на отдельной странице карты, не на HomeScreen) */}
      {status === 'ready' && !isSelectionMode && onBack && (
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
        {selectedImpulse && status === 'ready' && !isSelectionMode && !isBackground && (
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
                // Второй клик на карточку - открываем детальное окно события
                if (selectedImpulse) {
                  setIsEventDetailOpen(true);
                  if (window.Telegram?.WebApp?.HapticFeedback) {
                    try {
                      window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                    } catch (e) {
                      console.warn('[MapScreen] Haptic error:', e);
                    }
                  }
                }
              }}
              className="rounded-xl px-3 py-2.5 flex items-center gap-2 cursor-pointer hover:bg-white/10 transition-all active:scale-95"
              style={{
                height: '65px',
                backgroundColor: 'rgba(255, 255, 255, 0.6)', // 60% прозрачность
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.15)',
                opacity: 0.6, // 60% прозрачность для всего окна
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

      {/* Детальное окно события */}
      <AnimatePresence>
        {isEventDetailOpen && selectedImpulse && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsEventDetailOpen(false);
                setLastClickedImpulseId(null);
              }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-black/90 backdrop-blur-xl border border-white/20 rounded-3xl p-6 z-[2001] max-w-md mx-auto max-h-[80vh] flex flex-col overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {getSmartIcon(selectedImpulse.content, selectedImpulse.category).emoji}
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {selectedImpulse.category}
                    </h3>
                    {selectedImpulse.author_name && (
                      <p className="text-sm text-white/60">
                        {selectedImpulse.author_name}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsEventDetailOpen(false);
                    setLastClickedImpulseId(null);
                  }}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X size={20} className="text-white/70" />
                </button>
              </div>

              {/* Описание события */}
              <div className="mb-4">
                <p className="text-sm text-white/90 leading-relaxed">
                {selectedImpulse.content}
              </p>
              </div>

              {/* Адрес */}
              {selectedImpulse.address && (
                <div className="mb-4 flex items-start gap-2">
                  <svg width="16" height="16" viewBox="0 0 12 12" fill="none" className="text-white/60 mt-0.5 flex-shrink-0">
                    <path d="M6 1C4.34 1 3 2.34 3 4c0 2.5 3 6 3 6s3-3.5 3-6c0-1.66-1.34-3-3-3z" stroke="currentColor" strokeWidth="1" fill="none"/>
                    <circle cx="6" cy="4" r="1" fill="currentColor"/>
                  </svg>
                  <p className="text-sm text-white/70 flex-1">
                    {selectedImpulse.address}
                  </p>
                </div>
              )}

              {/* Опубликовано X назад */}
              {selectedImpulse.created_at && (
                <div className="mb-3 flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 12 12" fill="none" className="text-white/60">
                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1"/>
                    <path d="M6 3v3l2 1" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                  </svg>
                  <p className="text-sm text-white/70">
                    {(() => {
                      const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                      return isRussian ? `Опубликовано ${formatRelativeTime(selectedImpulse.created_at)}` : `Published ${formatRelativeTime(selectedImpulse.created_at)}`;
                    })()}
                  </p>
                </div>
              )}

              {/* Начало: Дата в Время */}
              {(selectedImpulse as any).event_date && (selectedImpulse as any).event_time && (
                <div className="mb-4 flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 12 12" fill="none" className="text-white/60">
                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1"/>
                    <path d="M6 3v3l2 1" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                  </svg>
                  <p className="text-sm text-white/70">
                    {formatEventDateTime((selectedImpulse as any).event_date, (selectedImpulse as any).event_time)}
                  </p>
                </div>
              )}

              {/* Дистанция */}
              {userLocation && selectedImpulse.location_lat && selectedImpulse.location_lng && (
                <div className="mb-6 flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 12 12" fill="none" className="text-white/60">
                    <path d="M6 1L2 5h3v5h2V5h3L6 1z" stroke="currentColor" strokeWidth="1" fill="none"/>
                  </svg>
                  <p className="text-sm text-white/70">
                    {formatDistance(calculateDistance(
                      userLocation.lat,
                      userLocation.lng,
                      selectedImpulse.location_lat,
                      selectedImpulse.location_lng
                    ))}
                  </p>
                </div>
              )}

              {/* Кнопка "Перейти к точке" */}
              <button
                onClick={() => {
                  if (mapInstanceRef.current && selectedImpulse.location_lat && selectedImpulse.location_lng) {
                    mapInstanceRef.current.flyTo(
                      { lat: selectedImpulse.location_lat, lng: selectedImpulse.location_lng },
                      17,
                      1.0
                    );
                    setIsEventDetailOpen(false);
                    if (window.Telegram?.WebApp?.HapticFeedback) {
                      try {
                        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                      } catch (e) {
                        console.warn('[MapScreen] Haptic error:', e);
                      }
                    }
                  }
                }}
                className="w-full rounded-xl py-3 px-4 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 text-white font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <MapPin size={18} />
                {(() => {
                  const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                  return isRussian ? 'Перейти к точке' : 'Go to Point';
                })()}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Анимация салюта при встрече друзей */}
      <AnimatePresence>
        {showCelebration && (
          <div className="celebration-overlay">
            {[...Array(50)].map((_, i) => {
              const angle = (i / 50) * Math.PI * 2;
              const distance = 150 + Math.random() * 100;
              const x = Math.cos(angle) * distance;
              const y = Math.sin(angle) * distance;
              const delay = Math.random() * 0.5;
              const color = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#ff6b9d', '#c44569', '#f8b500'][Math.floor(Math.random() * 6)];
              
              return (
                <div
                  key={i}
                  className="firework"
                  style={{
                    left: `calc(50% + ${x}px)`,
                    top: `calc(50% + ${y}px)`,
                    backgroundColor: color,
                    boxShadow: `0 0 20px ${color}, 0 0 40px ${color}`,
                    animationDelay: `${delay}s`,
                  }}
                />
              );
            })}
            {[...Array(30)].map((_, i) => {
              const angle = (i / 30) * Math.PI * 2;
              const distance = 80 + Math.random() * 50;
              const x = Math.cos(angle) * distance;
              const y = Math.sin(angle) * distance;
              const delay = Math.random() * 0.3;
              const color = ['#ffd700', '#ff6b6b', '#4ecdc4'][Math.floor(Math.random() * 3)];
              
              return (
                <div
                  key={`sparkle-${i}`}
                  className="sparkle"
                  style={{
                    left: `calc(50% + ${x}px)`,
                    top: `calc(50% + ${y}px)`,
                    backgroundColor: color,
                    boxShadow: `0 0 10px ${color}`,
                    animationDelay: `${delay}s`,
                  }}
                />
              );
            })}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="text-6xl"
              style={{ filter: 'drop-shadow(0 0 20px rgba(255, 215, 0, 0.8))' }}
            >
              🎉
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MapScreen;
