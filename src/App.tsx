import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { Sparkles, Zap, Film, MapPin, Utensils, Users, Heart, Home, User, X, Clock } from 'lucide-react';
import { categoryEmojis } from './lib/categoryColors';
import { motion, AnimatePresence } from 'framer-motion';
import Profile from './components/Profile';
import MapScreen from './components/MapScreen';
import MapPicker from './components/MapPicker';
import { supabase, isSupabaseConfigured, checkSupabaseConnection } from './lib/supabase';

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

const categories = [
  { 
    id: 'spark', 
    icon: Sparkles, 
    label: { ru: 'Искра', en: 'Spark' }, 
    color: 'from-amber-400/20 to-orange-600/20',
    border: 'border-amber-500/30',
    text: { 
      ru: 'Вечеринки, бары и супер мероприятия', 
      en: 'Parties, bars and major vibes' 
    }
  },
  { 
    id: 'impulse', 
    icon: Zap, 
    label: { ru: 'Импульс', en: 'Impulse' }, 
    color: 'from-blue-400/20 to-indigo-600/20',
    border: 'border-blue-500/30',
    text: { 
      ru: 'Спорт, тренировки и активный отдых', 
      en: 'Workout, energy and active life' 
    }
  },
  { 
    id: 'artgo', 
    icon: Film, 
    label: { ru: 'Афиша', en: 'ArtGo' }, 
    color: 'from-purple-400/20 to-pink-600/20',
    border: 'border-purple-500/30',
    text: { 
      ru: 'Выставки, кино и культурные события', 
      en: 'Exhibitions, cinema and cultural scenes' 
    }
  },
  { 
    id: 'walk', 
    icon: MapPin, 
    label: { ru: 'Исследуй', en: 'Walk Around' }, 
    color: 'from-emerald-400/20 to-teal-600/20',
    border: 'border-emerald-500/30',
    text: { 
      ru: 'Прогулки и секретные места города', 
      en: 'City walks and hidden gems' 
    }
  },
  { 
    id: 'tasty', 
    icon: Utensils, 
    label: { ru: 'Гастротур', en: 'Tasty Spots' }, 
    color: 'from-red-400/20 to-rose-600/20',
    border: 'border-red-500/30',
    text: { 
      ru: 'Вкусная еда, особенный кофе и столовая 2.0', 
      en: 'Tasty food, specialty coffee and Canteen 2.0' 
    }
  },
  { 
    id: 'sync', 
    icon: Users, 
    label: { ru: 'В ритме', en: 'In Sync' }, 
    color: 'from-cyan-400/20 to-blue-500/20',
    border: 'border-cyan-500/30',
    text: { 
      ru: 'Совместная работа, учеба и коворкинг', 
      en: 'Co-working, study sessions and flow' 
    }
  },
  { 
    id: 'hobby', 
    icon: Heart, 
    label: { ru: 'Хобби', en: 'Hobby' }, 
    color: 'from-pink-400/20 to-red-500/20',
    border: 'border-pink-500/30',
    text: { 
      ru: 'Джем-сейшн, рыбалка и общие увлечения', 
      en: 'Jam sessions, fishing and shared passions' 
    }
  }
];

import { categoryColors } from './lib/categoryColors';

function App() {
  console.log('App started');
  
  const [activeTab, setActiveTab] = useState<'home' | 'profile' | 'map'>('home');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [messageContent, setMessageContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feed, setFeed] = useState<Impulse[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  
  // Многошаговая форма создания события
  const [step, setStep] = useState<'category' | 'description' | 'location'>('category');
  const [eventAddress, setEventAddress] = useState('');
  const [eventCoords, setEventCoords] = useState<[number, number] | null>(null);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [mapRefreshTrigger, setMapRefreshTrigger] = useState(0);
  const [isMapSelectionMode, setIsMapSelectionMode] = useState(false); // Режим выбора точки на карте
  const [eventDate, setEventDate] = useState<string>('');
  const [eventTime, setEventTime] = useState<string>('');

  const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;

  useEffect(() => {
    try {
      WebApp.ready();
      WebApp.expand();
      
      // Проверяем подключение к Supabase перед загрузкой данных
      (async () => {
        if (!isSupabaseConfigured) {
          console.error('❌ Supabase не настроен. Проверьте переменные окружения.');
          if (window.Telegram?.WebApp?.showAlert) {
            window.Telegram.WebApp.showAlert('Ошибка: Supabase не настроен. Проверьте конфигурацию.');
          }
          return;
        }
        
        const isConnected = await checkSupabaseConnection();
        if (!isConnected) {
          console.warn('⚠️ Не удалось подключиться к Supabase');
        }
        
        loadFeed();
      })();
    } catch (e) {
      console.error('Error in App useEffect:', e);
    }
  }, []);

  const loadFeed = async () => {
    try {
      setIsLoadingFeed(true);
      
      // Проверка подключения к Supabase
      if (!isSupabaseConfigured) {
        console.error('❌ Supabase не настроен, пропускаем загрузку ленты');
        setFeed([]);
        setIsLoadingFeed(false);
        return;
      }

      // Исправленный запрос: показываем все активные impulses, отсортированные по created_at DESC
      const { data, error } = await supabase
        .from('impulses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error loading feed from Supabase:', error);
        console.error('  Code:', error.code);
        console.error('  Message:', error.message);
        setFeed([]);
        return;
      }

      if (!data || data.length === 0) {
        setFeed([]);
        return;
      }

      // Загружаем имена авторов отдельно
      const creatorIds = [...new Set(data.map((item: any) => item.creator_id))];
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
        } catch (profileError) {
          console.warn('Error loading profiles:', profileError);
        }
      }

      // Обрабатываем данные с именами авторов
      const processedFeed = data.map((item: any) => ({
        id: item.id,
        content: item.content,
        category: item.category,
        creator_id: item.creator_id,
        created_at: item.created_at,
        location_lat: item.location_lat,
        location_lng: item.location_lng,
        author_name: profilesMap.get(item.creator_id) || undefined,
      }));

      setFeed(processedFeed);
    } catch (err) {
      console.error('Failed to load feed:', err);
      setFeed([]);
    } finally {
      setIsLoadingFeed(false);
    }
  };

  const handleCategoryClick = (id: string) => {
    setSelectedCategory(id);
    setStep('description'); // Начинаем с шага описания
    setModalOpen(true);
    setMessageContent('');
    setEventAddress('');
    setEventCoords(null);
    
    // Устанавливаем активную категорию для подсветки маркеров на карте
    const category = categories.find(cat => cat.id === id);
    if (category) {
      const categoryName = isRussian ? category.label.ru : category.label.en;
      setActiveCategory(categoryName);
    }
    
    // Вибрация при клике на категорию
    if (window.Telegram?.WebApp?.HapticFeedback) {
      try {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
      } catch (e) {
        console.warn('Haptic feedback error:', e);
      }
    }
  };

  const handleTabChange = (tab: 'home' | 'profile' | 'map') => {
    setActiveTab(tab);
    // Вибрация при переключении вкладок
    if (WebApp.HapticFeedback) {
      try {
        WebApp.HapticFeedback.impactOccurred('light');
      } catch (e) {
        console.warn('Haptic feedback error:', e);
      }
    }
    // При переключении на карту, если есть активная категория, она уже передана через props
    // При переключении на другую вкладку, можно сбросить активную категорию
    if (tab !== 'map') {
      setActiveCategory(null);
    }
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedCategory(null);
    setMessageContent('');
    setStep('category');
    setEventAddress('');
    setEventCoords(null);
    // Сбрасываем активную категорию при закрытии модального окна
    setActiveCategory(null);
  };

  // Функция геокодирования адреса
  const handleAddressSearch = async (address: string) => {
    if (!address.trim()) {
      return;
    }

    setIsSearchingAddress(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
        {
          headers: {
            'User-Agent': 'LingerApp/1.0',
          },
        }
      );
      const data = await response.json();
      
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        const coords: [number, number] = [parseFloat(lat), parseFloat(lon)];
        setEventCoords(coords);
        setEventAddress(data[0].display_name || address);
        
        console.log('[handleAddressSearch] Найден адрес:', data[0].display_name, 'координаты:', coords);
        
        // Переключаемся на карту и центрируем (если MapScreen поддерживает)
        if (activeTab !== 'map') {
          setActiveTab('map');
          // Небольшая задержка для загрузки карты
          setTimeout(() => {
            // Координаты сохранены, MapScreen должен их использовать при добавлении маркера
          }, 500);
        }
        
        if (window.Telegram?.WebApp?.HapticFeedback) {
          try {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
          } catch (e) {
            console.warn('Haptic feedback error:', e);
          }
        }
      } else {
        WebApp.showAlert(isRussian ? 'Адрес не найден. Попробуйте другой вариант.' : 'Address not found. Try another one.');
        setEventCoords(null);
      }
    } catch (error) {
      console.error('[handleAddressSearch] Ошибка геокодирования:', error);
      WebApp.showAlert(isRussian ? 'Ошибка при поиске адреса' : 'Error searching address');
      setEventCoords(null);
    } finally {
      setIsSearchingAddress(false);
    }
  };

  const getCurrentLocation = (): Promise<{ lat: number; lng: number } | null> => {
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
        (error) => {
          console.log('Geolocation error:', error);
          resolve(null);
        },
        { timeout: 5000, maximumAge: 60000 }
      );
    });
  };

  const handleSendMessage = async () => {
    if (!messageContent.trim() || !selectedCategory) {
      return;
    }

    // Если на шаге описания, переходим к шагу выбора места
    if (step === 'description') {
      setStep('location');
      return;
    }

    // Если на шаге выбора места, проверяем координаты или адрес
    if (step === 'location' && !eventCoords && !eventAddress.trim() && !isMapSelectionMode) {
      WebApp.showAlert(isRussian ? 'Пожалуйста, укажите адрес или выберите место на карте' : 'Please specify an address or select location on map');
      return;
    }

    setIsSubmitting(true);

    try {
      const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      
      if (!userId) {
        console.error('User ID is missing');
        WebApp.showAlert('Error: User ID not found');
        setIsSubmitting(false);
        return;
      }

      const category = categories.find(cat => cat.id === selectedCategory);
      const categoryName = category ? (isRussian ? category.label.ru : category.label.en) : selectedCategory;

      // Используем координаты из геокодирования, если они есть
      const locationData: { location_lat?: number; location_lng?: number } = {};
      if (eventCoords) {
        locationData.location_lat = eventCoords[0];
        locationData.location_lng = eventCoords[1];
      } else {
        // Fallback на текущую геопозицию, если адрес не указан
        const location = await getCurrentLocation();
        if (location) {
          locationData.location_lat = location.lat;
          locationData.location_lng = location.lng;
        }
      }

      // Проверка подключения к Supabase перед отправкой
      if (!isSupabaseConfigured) {
        WebApp.showAlert(isRussian ? 'Ошибка: База данных не настроена' : 'Error: Database not configured');
        setIsSubmitting(false);
        return;
      }

      const { data, error } = await supabase
        .from('impulses')
        .insert({
          content: messageContent.trim(),
          category: categoryName,
          creator_id: userId,
          ...locationData,
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Error sending message to Supabase:', error);
        console.error('  Code:', error.code);
        console.error('  Message:', error.message);
        console.error('  Details:', error.details);
        
        let errorMessage = isRussian ? 'Ошибка при отправке сообщения' : 'Error sending message';
        if (error.code === '23503') {
          errorMessage = isRussian ? 'Ошибка: Пользователь не найден в базе данных' : 'Error: User not found in database';
        } else if (error.code === '42501') {
          errorMessage = isRussian ? 'Ошибка: Нет доступа к базе данных' : 'Error: Database access denied';
        }
        
        WebApp.showAlert(errorMessage);
      } else {
        console.log('Message sent successfully:', data);
        WebApp.showAlert(isRussian ? 'Событие успешно создано!' : 'Event created successfully!');
        handleCloseModal();
        loadFeed();
        // Обновляем карту
        setMapRefreshTrigger(prev => prev + 1);
        // Переключаемся на карту, чтобы показать новое событие
        if (activeTab !== 'map') {
          setActiveTab('map');
        }
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      try {
        WebApp.showAlert(isRussian ? 'Ошибка при отправке сообщения' : 'Error sending message');
      } catch (alertError) {
        console.error('Failed to show error alert:', alertError);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Проверка, создано ли событие менее 2 часов назад
  const isNewEvent = (dateString: string): boolean => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = diff / 3600000;
    return hours < 2;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return isRussian ? 'только что' : 'just now';
    if (minutes < 60) return isRussian ? `${minutes} мин назад` : `${minutes}m ago`;
    if (hours < 24) return isRussian ? `${hours} ч назад` : `${hours}h ago`;
    if (days < 7) return isRussian ? `${days} дн назад` : `${days}d ago`;
    return date.toLocaleDateString(isRussian ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' });
  };

  // Форматирование даты и времени для карточек
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const eventDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (eventDate.getTime() === today.getTime()) {
      // Сегодня
      return isRussian 
        ? `Сегодня в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
        : `Today at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      // Другая дата
      return isRussian
        ? date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
        : date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white/20 flex flex-col">
      <div className={`flex-1 ${activeTab === 'map' ? '' : 'pb-20'}`}>
        {activeTab === 'home' ? (
          <>
            <header className="pt-16 pb-8 px-6 text-center">
              <motion.h1 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-5xl font-light tracking-[0.2em] mb-2"
              >
                LINGER
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-gray-500 uppercase tracking-widest text-[10px]"
              >
                Meet the Moment
              </motion.p>
            </header>

            <main className="px-4 pb-6 space-y-4">
              {categories.map((cat) => (
                <div key={cat.id} className="relative overflow-visible">
                  <motion.button
                    onClick={() => handleCategoryClick(cat.id)}
                    className="relative w-full p-5 rounded-2xl flex items-center justify-between border bg-white/5 border-white/10 hover:bg-black/40 hover:border-white/20 transition-all duration-500 backdrop-blur-xl z-10"
                  >
                    <div className="flex items-center gap-4">
                      <cat.icon size={22} className="text-gray-400" />
                      <span className="text-lg font-light tracking-wide">
                        {isRussian ? cat.label.ru : cat.label.en}
                      </span>
                    </div>
                    <span className="text-xs text-white/40">
                      {isRussian ? 'Нажмите' : 'Tap'}
                    </span>
                  </motion.button>
                </div>
              ))}
            </main>

            <section className="px-4 pb-12">
              <h2 className="text-xl font-light mb-4 text-white/80">
                {isRussian ? 'Лента активности' : 'Activity Feed'}
              </h2>
              {isLoadingFeed ? (
                <div className="text-center py-8 text-white/40">
                  {isRussian ? 'Загрузка...' : 'Loading...'}
                </div>
              ) : feed.length === 0 ? (
                <div className="space-y-3">
                  {/* Заглушки для пустого состояния */}
                  {Array.from({ length: 3 }).map((_, index) => (
                    <motion.div
                      key={`placeholder-${index}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-fuchsia-500/10 border border-indigo-500/20 rounded-2xl p-6 backdrop-blur-md text-center cursor-pointer hover:from-indigo-500/20 hover:via-purple-500/20 hover:to-fuchsia-500/20 transition-all"
                      onClick={() => {
                        const category = categories[Math.floor(Math.random() * categories.length)];
                        handleCategoryClick(category.id);
                        if (window.Telegram?.WebApp?.HapticFeedback) {
                          try {
                            window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                          } catch (e) {
                            console.warn('Haptic error:', e);
                          }
                        }
                      }}
                    >
                      <div className="text-2xl mb-2">✨</div>
                      <p className="text-sm font-medium text-white/90 mb-1">
                        {isRussian ? 'Создайте первое событие!' : 'Create your first event!'}
                      </p>
                      <p className="text-xs text-white/60">
                        {isRussian ? 'Нажмите на категорию выше, чтобы начать' : 'Tap a category above to get started'}
                      </p>
                    </motion.div>
                  ))}
                </div>
              ) : feed.length < 5 ? (
                <>
                  <div className="space-y-3">
                    <AnimatePresence>
                      {feed.map((impulse, index) => (
                        <motion.div
                          key={impulse.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ delay: index * 0.05 }}
                          className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md relative"
                        >
                          {/* Индикатор новизны для событий < 2 часов */}
                          {isNewEvent(impulse.created_at) && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.1, 1] }}
                              transition={{ duration: 2, repeat: Infinity }}
                              className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 rounded-full flex items-center justify-center shadow-lg"
                            >
                              <span className="text-xs">🔥</span>
                            </motion.div>
                          )}
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-white">
                                {impulse.author_name || (isRussian ? 'Аноним' : 'Anonymous')}
                              </span>
                              <span className="text-xs text-white/40 px-2 py-0.5 bg-white/5 rounded-full">
                                {impulse.category}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-white/40">
                              <Clock size={12} />
                              <span>{formatTime(impulse.created_at)}</span>
                            </div>
                          </div>
                          <p className="text-sm text-white/80 leading-relaxed mb-2">
                            {impulse.content}
                          </p>
                          <div className="flex items-center gap-1 text-xs text-purple-400 mt-2">
                            <Clock size={12} />
                            <span>{formatDateTime(impulse.created_at)}</span>
                          </div>
                          {impulse.location_lat && impulse.location_lng && (
                            <div className="mt-2 flex items-center gap-1 text-xs text-white/40">
                              <MapPin size={12} />
                              <span>{isRussian ? 'С геолокацией' : 'With location'}</span>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                  {/* Заглушки для призыва к действию */}
                  {Array.from({ length: 5 - feed.length }).map((_, index) => (
                    <motion.div
                      key={`call-to-action-${index}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: (feed.length + index) * 0.1 }}
                      className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-fuchsia-500/10 border border-indigo-500/20 rounded-2xl p-6 backdrop-blur-md text-center cursor-pointer hover:from-indigo-500/20 hover:via-purple-500/20 hover:to-fuchsia-500/20 transition-all"
                      onClick={() => {
                        const category = categories[Math.floor(Math.random() * categories.length)];
                        handleCategoryClick(category.id);
                        if (window.Telegram?.WebApp?.HapticFeedback) {
                          try {
                            window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                          } catch (e) {
                            console.warn('Haptic error:', e);
                          }
                        }
                      }}
                    >
                      <div className="text-2xl mb-2">✨</div>
                      <p className="text-sm font-medium text-white/90 mb-1">
                        {isRussian ? 'Создайте свое событие!' : 'Create your event!'}
                      </p>
                      <p className="text-xs text-white/60">
                        {isRussian ? 'Нажмите на категорию выше' : 'Tap a category above'}
                      </p>
                    </motion.div>
                  ))}
                </>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence>
                    {feed.map((impulse, index) => (
                      <motion.div
                        key={impulse.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ delay: index * 0.05 }}
                        className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md relative"
                      >
                        {/* Индикатор новизны для событий < 2 часов */}
                        {isNewEvent(impulse.created_at) && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.1, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 rounded-full flex items-center justify-center shadow-lg"
                          >
                            <span className="text-xs">🔥</span>
                          </motion.div>
                        )}
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">
                              {impulse.author_name || (isRussian ? 'Аноним' : 'Anonymous')}
                            </span>
                            <span className="text-xs text-white/40 px-2 py-0.5 bg-white/5 rounded-full">
                              {impulse.category}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-white/40">
                            <Clock size={12} />
                            <span>{formatTime(impulse.created_at)}</span>
                          </div>
                        </div>
                        <p className="text-sm text-white/80 leading-relaxed mb-2">
                          {impulse.content}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-purple-400 mt-2">
                          <Clock size={12} />
                          <span>{formatDateTime(impulse.created_at)}</span>
                        </div>
                        {impulse.location_lat && impulse.location_lng && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-white/40">
                            <MapPin size={12} />
                            <span>{isRussian ? 'С геолокацией' : 'With location'}</span>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </section>
          </>
        ) : activeTab === 'profile' ? (
          <Profile />
        ) : (
          <MapScreen 
            key={activeTab} 
            activeCategory={activeCategory} 
            onCategoryChange={setActiveCategory}
            refreshTrigger={mapRefreshTrigger}
          />
        )}
      </div>

      <AnimatePresence>
        {modalOpen && selectedCategory && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseModal}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-black/90 backdrop-blur-xl border border-white/20 rounded-3xl p-6 z-50 max-w-md mx-auto max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-light text-white">
                  {(() => {
                    const category = categories.find(cat => cat.id === selectedCategory);
                    return category ? (isRussian ? category.label.ru : category.label.en) : selectedCategory;
                  })()}
                </h3>
                <button
                  onClick={handleCloseModal}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={20} className="text-white/60" />
                </button>
              </div>

              {/* Индикатор шагов */}
              <div className="flex items-center gap-2 mb-4">
                <div className={`flex-1 h-1 rounded-full ${step === 'description' || step === 'location' ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500' : 'bg-white/20'}`} />
                <div className={`flex-1 h-1 rounded-full ${step === 'location' ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500' : 'bg-white/20'}`} />
              </div>

              {/* Шаг 1: Описание */}
              {step === 'description' && (
                <>
                  <textarea
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    placeholder={isRussian ? 'Напишите описание события...' : 'Write event description...'}
                    className="w-full rounded-2xl bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 text-sm text-white placeholder:text-white/35 resize-none min-h-[120px] px-4 py-3 leading-relaxed mb-4"
                    autoFocus
                  />

                  <div className="flex gap-3">
                    <button
                      onClick={handleCloseModal}
                      disabled={isSubmitting}
                      className="flex-1 rounded-2xl bg-white/5 border border-white/20 py-3 text-sm font-medium text-white/80 hover:bg-white/10 transition-colors disabled:opacity-50"
                    >
                      {isRussian ? 'Отмена' : 'Cancel'}
                    </button>
                    <button
                      onClick={() => {
                        if (messageContent.trim()) {
                          setStep('location');
                          if (window.Telegram?.WebApp?.HapticFeedback) {
                            try {
                              window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                            } catch (e) {
                              console.warn('Haptic error:', e);
                            }
                          }
                        }
                      }}
                      disabled={isSubmitting || !messageContent.trim()}
                      className="flex-1 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {(() => {
                        const category = categories.find(cat => cat.id === selectedCategory);
                        const categoryName = category ? (isRussian ? category.label.ru : category.label.en) : '';
                        const emoji = categoryEmojis[categoryName] || '✨';
                        return isRussian ? `Выберем время ${emoji}` : `Choose Time ${emoji}`;
                      })()}
                    </button>
                  </div>
                </>
              )}

              {/* Шаг 2: Выбор времени и места */}
              {step === 'location' && (
                <>
                  <div className="mb-4 relative">
                    <label className="block text-sm text-white/70 mb-2">
                      {isRussian ? 'Выберите дату и время события' : 'Select event date and time'}
                    </label>
                    
                    {/* Поля для даты и времени */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div>
                        <label className="block text-xs text-white/60 mb-1">
                          {isRussian ? 'Дата' : 'Date'}
                        </label>
                        <input
                          type="date"
                          value={eventDate}
                          onChange={(e) => setEventDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          className="w-full rounded-2xl bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 text-sm text-white px-4 py-3"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-white/60 mb-1">
                          {isRussian ? 'Время' : 'Time'}
                        </label>
                        <input
                          type="time"
                          value={eventTime}
                          onChange={(e) => setEventTime(e.target.value)}
                          className="w-full rounded-2xl bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 text-sm text-white px-4 py-3"
                        />
                      </div>
                    </div>

                    {/* Плавающая кнопка выбора адреса (Pin Button) */}
                    <div className="relative mb-4">
                      <label className="block text-sm text-white/70 mb-2">
                        {isRussian ? 'Выбор места' : 'Select location'}
                      </label>
                      
                      {/* Контейнер карты - показывается только при isMapSelectionMode */}
                      {isMapSelectionMode && (
                        <div className="relative rounded-2xl overflow-hidden mb-3 border border-white/20" style={{ height: '50vh', maxHeight: '300px', minHeight: '200px' }}>
                          <div className="h-full relative">
                            <MapPicker
                              onLocationSelected={(location, address) => {
                                const coords: [number, number] = [location.lat, location.lng];
                                setEventCoords(coords);
                                setEventAddress(address);
                                setIsMapSelectionMode(false);
                                
                                if (window.Telegram?.WebApp?.HapticFeedback) {
                                  try {
                                    window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                                  } catch (e) {
                                    console.warn('Haptic error:', e);
                                  }
                                }
                              }}
                              initialZoom={16}
                            />
                            <button
                              onClick={() => {
                                setIsMapSelectionMode(false);
                                if (window.Telegram?.WebApp?.HapticFeedback) {
                                  try {
                                    window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                                  } catch (e) {
                                    console.warn('Haptic error:', e);
                                  }
                                }
                              }}
                              className="absolute top-2 right-2 z-[2001] px-3 py-1.5 bg-black/80 backdrop-blur-md border border-white/20 rounded-xl text-white text-xs font-medium hover:bg-black/90 transition-colors"
                            >
                              {isRussian ? 'Отменить' : 'Cancel'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Плавающая кнопка булавки - справа внизу */}
                      {!isMapSelectionMode && (
                        <div className="relative">
                          {/* Блок с выбранным адресом (Glassmorphism) */}
                          {(eventAddress || eventCoords) && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="mb-3 p-4 rounded-2xl border border-white/30 backdrop-blur-xl"
                              style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                              }}
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 flex items-center justify-center shadow-lg">
                                  <MapPin size={18} className="text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-white/60 mb-1 font-medium">{isRussian ? 'Выбранное место' : 'Selected location'}</p>
                                  <p className="text-sm font-semibold text-white leading-tight break-words mb-2">
                                    {eventAddress || (eventCoords ? `${eventCoords[0].toFixed(6)}, ${eventCoords[1].toFixed(6)}` : '')}
                                  </p>
                                </div>
                              </div>
                            </motion.div>
                          )}

                          {/* Альтернативный ввод адреса */}
                          <div className="mb-3">
                            <label className="block text-xs text-white/60 mb-1">
                              {isRussian ? 'Или введите адрес вручную' : 'Or enter address manually'}
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={eventAddress}
                                onChange={(e) => setEventAddress(e.target.value)}
                                onBlur={(e) => {
                                  if (e.target.value.trim()) {
                                    handleAddressSearch(e.target.value);
                                  }
                                }}
                                placeholder={isRussian ? 'Введите адрес (например, Сестрорецк, ул. Мира 1)' : 'Enter address (e.g., Sestroretsk, Mira St. 1)'}
                                className="flex-1 rounded-2xl bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 text-sm text-white placeholder:text-white/35 px-4 py-3"
                                autoFocus={false}
                              />
                              {isSearchingAddress && (
                                <div className="flex items-center justify-center w-12 rounded-2xl bg-white/5 border border-white/20">
                                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Плавающая кнопка булавки */}
                          <button
                            onClick={() => {
                              setIsMapSelectionMode(true);
                              if (window.Telegram?.WebApp?.HapticFeedback) {
                                try {
                                  window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                                } catch (e) {
                                  console.warn('Haptic error:', e);
                                }
                              }
                            }}
                            className="absolute bottom-0 right-0 w-14 h-14 rounded-full bg-white/90 backdrop-blur-md border-2 border-white/30 shadow-lg hover:bg-white hover:shadow-xl transition-all flex items-center justify-center z-10"
                            style={{
                              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                            }}
                          >
                            <MapPin size={24} className="text-indigo-600" strokeWidth={2.5} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setStep('description');
                        setIsMapSelectionMode(false);
                      }}
                      disabled={isSubmitting}
                      className="flex-1 rounded-2xl bg-white/5 border border-white/20 py-3 text-sm font-medium text-white/80 hover:bg-white/10 transition-colors disabled:opacity-50"
                    >
                      {isRussian ? 'Назад' : 'Back'}
                    </button>
                    <button
                      onClick={handleSendMessage}
                      disabled={isSubmitting || (!eventCoords && !eventAddress.trim())}
                      className="flex-1 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting 
                        ? (isRussian ? 'Создание...' : 'Creating...') 
                        : (isRussian ? 'Готово' : 'Create')
                      }
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md border-t border-white/10 z-40">
        <div className="flex items-center justify-around h-16 px-4">
          <button
            onClick={() => handleTabChange('home')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors ${
              activeTab === 'home' ? 'text-white' : 'text-white/50'
            }`}
          >
            <Home size={22} className={activeTab === 'home' ? 'text-white' : 'text-white/50'} />
            <span className="text-xs font-light">
              {isRussian ? 'Главная' : 'Home'}
            </span>
          </button>
          <button
            onClick={() => handleTabChange('map')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors ${
              activeTab === 'map' ? 'text-white' : 'text-white/50'
            }`}
          >
            <MapPin size={22} className={activeTab === 'map' ? 'text-white' : 'text-white/50'} />
            <span className="text-xs font-light">
              {isRussian ? 'Карта' : 'Map'}
            </span>
          </button>
          <button
            onClick={() => handleTabChange('profile')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors ${
              activeTab === 'profile' ? 'text-white' : 'text-white/50'
            }`}
          >
            <User size={22} className={activeTab === 'profile' ? 'text-white' : 'text-white/50'} />
            <span className="text-xs font-light">
              {isRussian ? 'Профиль' : 'Profile'}
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export default App;
