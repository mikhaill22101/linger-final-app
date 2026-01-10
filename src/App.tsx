import { useState, useEffect, useRef } from 'react';
import WebApp from '@twa-dev/sdk';
import { Sparkles, Zap, Film, MapPin, Utensils, Users, Heart, Home, User, X, Clock, UserPlus, UserMinus, PlusCircle, UsersRound, Search, Dice6 } from 'lucide-react';
import { categoryEmojis } from './lib/categoryColors';
import { getSmartIcon } from './lib/smartIcon';
import { motion, AnimatePresence } from 'framer-motion';
import Profile from './components/Profile';
import MapScreen from './components/MapScreen';
import MapPicker from './components/MapPicker';
import { supabase, isSupabaseConfigured, checkSupabaseConnection } from './lib/supabase';
import { notifyNearbyFriendEvent } from './lib/notifications';

interface Impulse {
  id: number;
  content: string;
  category: string;
  creator_id: number;
  created_at: string;
  author_name?: string;
  author_avatar?: string;
  location_lat?: number;
  location_lng?: number;
  distance?: number;
  event_date?: string;
  event_time?: string;
  address?: string;
}

interface EventTemplate {
  id: number;
  category_id: string;
  title_template: string;
  created_at?: string;
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
  const [autoTitle, setAutoTitle] = useState<string>(''); // Автоматически сгенерированный заголовок
  const [titleGenerated, setTitleGenerated] = useState(false); // Флаг, что заголовок был сгенерирован
  const [isManualTitle, setIsManualTitle] = useState(false); // Флаг, что пользователь ввел заголовок вручную
  const [titleFlash, setTitleFlash] = useState(false); // Флаг для визуального эффекта мерцания
  const [eventTemplates, setEventTemplates] = useState<EventTemplate[]>([]); // Шаблоны заголовков из БД
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const templatesCacheRef = useRef<EventTemplate[] | null>(null); // Кэш шаблонов
  const lastUsedTemplateIndexRef = useRef<Record<string, number>>({}); // Индекс последнего использованного шаблона для каждой категории
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
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0); // Количество непрочитанных сообщений
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(0); // Количество непрочитанных уведомлений и запросов
  const [selectedUserProfile, setSelectedUserProfile] = useState<{ id: number; name?: string; avatar?: string; username?: string } | null>(null); // Выбранный профиль пользователя
  const [isFriend, setIsFriend] = useState<boolean>(false); // Статус дружбы с выбранным пользователем
  const [userAvatar, setUserAvatar] = useState<string | undefined>(undefined);
  const [userName, setUserName] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState(''); // Поисковый запрос для умного подбора категории
  const [highlightedCategory, setHighlightedCategory] = useState<string | null>(null); // Подсвеченная категория из поиска
  const [showFriendsMap, setShowFriendsMap] = useState(false); // Режим просмотра друзей на карте
  const [showFriendsList, setShowFriendsList] = useState(false); // Модальное окно списка друзей
  const [friends, setFriends] = useState<Array<{ id: number; full_name?: string; avatar_url?: string; username?: string; location_lat?: number; location_lng?: number; last_seen?: string | null; current_event?: { id: number; category: string; icon: string } | null }>>([]); // Список друзей с координатами
  const [friendsSearchQuery, setFriendsSearchQuery] = useState(''); // Поиск по друзьям
  const [isLoadingFriends, setIsLoadingFriends] = useState(false); // Загрузка списка друзей
  const [selectedEventDetail, setSelectedEventDetail] = useState<Impulse | null>(null); // Детальное окно события
  const [showCelebration, setShowCelebration] = useState(false); // Анимация празднования
  const [userOnlineStatus, setUserOnlineStatus] = useState(false); // Статус онлайна пользователя
  const [userLastSeen, setUserLastSeen] = useState<string | null>(null); // last_seen пользователя
  const heroCardRef = useRef<HTMLDivElement>(null); // Ref для Hero-карточки для отслеживания скролла
  const friendsSearchInputRef = useRef<HTMLInputElement>(null); // Ref для поля поиска друзей

  const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;

  // Загрузка данных пользователя для header и проверка онлайн статуса
  useEffect(() => {
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (tgUser) {
      setUserAvatar(tgUser.photo_url);
      setUserName(tgUser.first_name || tgUser.username || '');
    }

    // Загружаем профиль пользователя для проверки онлайн статуса
    const loadUserProfile = async () => {
      if (!isSupabaseConfigured || !tgUser?.id) return;
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('last_seen')
          .eq('telegram_id', tgUser.id)
          .single();

        if (!error && data) {
          setUserLastSeen(data.last_seen);
          
          // Проверяем онлайн статус (last_seen менее 5 минут назад)
          if (data.last_seen) {
            const lastSeenDate = new Date(data.last_seen);
            const now = new Date();
            const diffMs = now.getTime() - lastSeenDate.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            setUserOnlineStatus(diffMins >= 0 && diffMins < 5);
          }
        }
      } catch (err) {
        console.warn('Failed to load user profile for online status:', err);
      }
    };

    loadUserProfile();

    // Обновляем last_seen каждые 2 минуты
    const updateInterval = setInterval(async () => {
      if (isSupabaseConfigured && tgUser?.id) {
        try {
          await supabase
            .from('profiles')
            .update({ last_seen: new Date().toISOString() })
            .eq('telegram_id', tgUser.id);
          
          setUserLastSeen(new Date().toISOString());
          setUserOnlineStatus(true);
        } catch (err) {
          console.warn('Failed to update last_seen:', err);
        }
      }
    }, 120000); // 2 минуты

    return () => clearInterval(updateInterval);
  }, [isSupabaseConfigured]);

  // Haptic feedback при скролле мимо Hero-карточки
  useEffect(() => {
    if (!heroCardRef.current || feed.length === 0) return;

    let hasTriggered = false;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting && entry.boundingClientRect.top < 0 && !hasTriggered) {
            // Hero-карточка скрылась сверху - триггерим haptic feedback (только один раз)
            hasTriggered = true;
            if (window.Telegram?.WebApp?.HapticFeedback) {
              try {
                window.Telegram.WebApp.HapticFeedback.selectionChanged();
              } catch (e) {
                console.warn('Haptic error:', e);
              }
            }
          }
          // Сбрасываем флаг, когда карточка снова видна
          if (entry.isIntersecting) {
            hasTriggered = false;
          }
        });
      },
      { threshold: 0, rootMargin: '-100px 0px' }
    );

    observer.observe(heroCardRef.current);

    return () => observer.disconnect();
  }, [feed.length]); // Переподписываемся при изменении feed

  // Загрузка шаблонов заголовков из Supabase
  const loadEventTemplates = async () => {
    // Используем кэш, если он есть
    if (templatesCacheRef.current) {
      setEventTemplates(templatesCacheRef.current);
      return;
    }

    if (!isSupabaseConfigured) {
      console.warn('⚠️ Supabase не настроен, пропускаем загрузку шаблонов');
      return;
    }

    try {
      setIsLoadingTemplates(true);
      const { data, error } = await supabase
        .from('event_templates')
        .select('id, category_id, title_template, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error loading event templates:', error);
        return;
      }

      if (data && data.length > 0) {
        // Сохраняем в кэш и состояние
        templatesCacheRef.current = data;
        setEventTemplates(data);
      }
    } catch (err) {
      console.error('Failed to load event templates:', err);
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  // Функция определения категории на основе текста поиска
  const detectCategoryFromText = (text: string): string | null => {
    if (!text || text.trim().length < 2) return null;
    
    const normalizedText = text.toLowerCase().trim();
    
    // Маппинг ключевых слов к категориям
    const categoryKeywords: Record<string, string[]> = {
      'spark': ['искра', 'импульс', 'энергия', 'драйв', 'адреналин', 'экстрим', 'экшн', 'активность', 'динамика', 'вечеринка', 'бар', 'туса', 'вписка'],
      'artgo': ['афиша', 'событие', 'мероприятие', 'концерт', 'выставка', 'фестиваль', 'шоу', 'спектакль', 'театр', 'кино', 'фильм'],
      'walk': ['исследуй', 'прогулка', 'гулять', 'парк', 'лес', 'природа', 'поход', 'горы', 'озеро', 'набережная', 'пройтись'],
      'tasty': ['гастротур', 'еда', 'ресторан', 'кафе', 'пицца', 'бургер', 'суши', 'обед', 'ужин', 'кушать', 'кофе', 'завтрак'],
      'sync': ['ритме', 'музыка', 'танцы', 'клуб', 'диско', 'гитара', 'караоке', 'dj', 'концерт', 'петь'],
      'hobby': ['хобби', 'интересы', 'увлечения', 'отдых', 'расслабиться', 'чилаут', 'кино', 'фильм', 'сериал', 'кальян'],
      'impulse': ['спорт', 'тренировка', 'зал', 'бег', 'пробежка', 'футбол', 'баскетбол', 'волейбол', 'теннис', 'плавание'],
    };
    
    // Ищем совпадения
    for (const [categoryId, keywords] of Object.entries(categoryKeywords)) {
      for (const keyword of keywords) {
        if (normalizedText.includes(keyword)) {
          return categoryId;
        }
      }
    }
    
    return null;
  };

  // Функция генерации креативных заголовков из БД
  const generateAutoTitle = (categoryId: string | null, userText: string = '', useNext: boolean = false): string => {
    if (!categoryId) return '';
    
    // Получаем шаблоны для данной категории из БД
    const categoryTemplates = eventTemplates.filter(t => t.category_id === categoryId);
    
    // Если шаблонов нет в БД, возвращаем пустую строку
    if (categoryTemplates.length === 0) {
      console.warn(`⚠️ Нет шаблонов для категории ${categoryId}`);
      return '';
    }
    
    // Если нужно взять следующий шаблон (для кнопки кубика)
    if (useNext) {
      const lastIndex = lastUsedTemplateIndexRef.current[categoryId] || -1;
      const nextIndex = (lastIndex + 1) % categoryTemplates.length;
      lastUsedTemplateIndexRef.current[categoryId] = nextIndex;
      return categoryTemplates[nextIndex].title_template;
    }
    
    // Иначе выбираем случайный шаблон
    const randomIndex = Math.floor(Math.random() * categoryTemplates.length);
    lastUsedTemplateIndexRef.current[categoryId] = randomIndex;
    return categoryTemplates[randomIndex].title_template;
  };

  // Обработка изменения поискового запроса с умным выбором шаблона
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      const detectedCategory = detectCategoryFromText(searchQuery);
      if (detectedCategory) {
        setHighlightedCategory(detectedCategory);
        
        // Умный выбор: если пользователь еще не ввел заголовок вручную и шаблоны загружены
        if (!isManualTitle && eventTemplates.length > 0 && step === 'category') {
          const generatedTitle = generateAutoTitle(detectedCategory, searchQuery);
          if (generatedTitle) {
            setAutoTitle(generatedTitle);
            setMessageContent(generatedTitle);
            setTitleGenerated(true);
            setIsManualTitle(false);
            // Визуальный эффект мерцания
            setTitleFlash(true);
            setTimeout(() => setTitleFlash(false), 1000);
          }
        }
        
        // Haptic feedback при автоматическом подборе
        if (window.Telegram?.WebApp?.HapticFeedback) {
          try {
            window.Telegram.WebApp.HapticFeedback.selectionChanged();
          } catch (e) {
            console.warn('Haptic error:', e);
          }
        }
      } else {
        setHighlightedCategory(null);
      }
    } else {
      setHighlightedCategory(null);
    }
  }, [searchQuery, eventTemplates, isManualTitle, step]);

  // Функция расчета расстояния между двумя точками (Haversine formula)
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371; // Радиус Земли в километрах
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Функция форматирования расстояния
  const formatDistance = (km: number): string => {
    if (km === Infinity || isNaN(km)) return '';
    if (km < 1) {
      return `${Math.round(km * 1000)} м`;
    }
    return `${km.toFixed(1)} км`;
  };

  // Инициализация Telegram WebApp и первоначенная загрузка данных
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
    WebApp.ready();
    WebApp.expand();
      
      // Получаем геопозицию пользователя
      (async () => {
        const location = await getCurrentLocation();
        if (location) {
          setUserLocation(location);
        }
      })();
      
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
        
        // Загружаем ленту сразу (даже без геолокации, расстояния будут пересчитаны позже)
    loadFeed();
        
        // Загружаем количество непрочитанных сообщений
        loadUnreadMessagesCount();
      })();
    } catch (e) {
      console.error('Error in App useEffect:', e);
    }
  }, []);

  // Перезагружаем ленту, когда userLocation становится доступным (для правильного расчета расстояний)
  useEffect(() => {
    if (userLocation && isSupabaseConfigured) {
      loadFeed();
    }
  }, [userLocation]);

  // Загрузка списка друзей
  const loadFriendsList = async () => {
    const currentUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (!currentUserId || !isSupabaseConfigured) {
      setFriends([]);
      return;
    }

    try {
      setIsLoadingFriends(true);
      const { data, error } = await supabase
        .from('friendships')
        .select(`
          id,
          user_id,
          friend_id,
          profiles_user:user_id (id, full_name, avatar_url, username, last_seen, location_lat, location_lng),
          profiles_friend:friend_id (id, full_name, avatar_url, username, last_seen, location_lat, location_lng)
        `)
        .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);

      if (error) {
        console.error('❌ Error loading friends:', error);
        setFriends([]);
        return;
      }

      // Преобразуем данные: для каждой дружбы берем профиль друга (не текущего пользователя)
      const friendsList = (data || []).map((friendship: any) => {
        const friendProfile = friendship.user_id === currentUserId 
          ? friendship.profiles_friend 
          : friendship.profiles_user;
        
        const friendId = friendProfile?.id || (friendship.user_id === currentUserId ? friendship.friend_id : friendship.user_id);
        
        return {
          id: friendId,
          full_name: friendProfile?.full_name,
          avatar_url: friendProfile?.avatar_url,
          username: friendProfile?.username,
          last_seen: friendProfile?.last_seen || null,
          location_lat: friendProfile?.location_lat || null,
          location_lng: friendProfile?.location_lng || null,
          current_event: null, // Будет заполнено при проверке событий
        };
      }).filter((f: any) => f.id); // Убираем пустые записи

      // Проверяем, находятся ли друзья на событиях
      if (friendsList.length > 0) {
        try {
          const { data: events } = await supabase
            .from('impulses')
            .select('id, category, location_lat, location_lng, content')
            .not('location_lat', 'is', null)
            .not('location_lng', 'is', null);
          
          if (events && events.length > 0) {
            friendsList.forEach((friend) => {
              if (friend.location_lat && friend.location_lng) {
                // Ищем ближайшее событие в радиусе 50 метров
                const nearestEvent = events.find((event: any) => {
                  const distance = calculateDistance(
                    friend.location_lat!,
                    friend.location_lng!,
                    event.location_lat,
                    event.location_lng
                  );
                  return distance < 0.05; // 50 метров = 0.05 км
                });
                
                if (nearestEvent) {
                  const iconData = getSmartIcon(nearestEvent.content || nearestEvent.category);
                  friend.current_event = {
                    id: nearestEvent.id,
                    category: nearestEvent.category,
                    icon: iconData.emoji,
                  };
                }
              }
            });
          }
        } catch (err) {
          console.warn('Failed to check friend events:', err);
        }
      }

      setFriends(friendsList);
    } catch (err) {
      console.error('Failed to load friends:', err);
      setFriends([]);
    } finally {
      setIsLoadingFriends(false);
    }
  };

  // Загрузка количества непрочитанных сообщений и уведомлений
  const loadUnreadMessagesCount = async () => {
    const currentUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (!currentUserId || !isSupabaseConfigured) return;

    try {
      // Загружаем непрочитанные сообщения
      const { data: messages, error: messagesError } = await supabase
        .from('direct_messages')
        .select('id', { count: 'exact' })
        .eq('receiver_id', currentUserId)
        .eq('read', false);

      if (!messagesError && messages) {
        setUnreadMessagesCount(messages.length || 0);
      }

      // Загружаем непрочитанные запросы в друзья (новые дружбы, созданные за последние 24 часа, где текущий пользователь friend_id)
      const { data: friendRequests, error: friendRequestsError } = await supabase
        .from('friendships')
        .select('id', { count: 'exact' })
        .eq('friend_id', currentUserId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (!friendRequestsError && friendRequests) {
        const totalUnread = (messages?.length || 0) + (friendRequests.length || 0);
        setUnreadNotificationsCount(totalUnread);
      } else {
        setUnreadNotificationsCount(messages?.length || 0);
      }
    } catch (err) {
      console.error('Failed to load unread messages count:', err);
    }
  };

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
        .select('*, event_date, event_time, address')
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

      // Загружаем имена авторов и аватары отдельно
      const creatorIds = [...new Set(data.map((item) => item.creator_id))];
      let profilesMap = new Map<number, { name: string; avatar?: string }>();

      if (creatorIds.length > 0) {
        try {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', creatorIds);

          if (profiles) {
            profilesMap = new Map(
              profiles.map((p: { id: number; full_name: string | null; avatar_url?: string | null }) => [
                p.id, 
                { name: p.full_name ?? '', avatar: p.avatar_url || undefined }
              ])
            );
          }
        } catch (profileError) {
          console.warn('Error loading profiles:', profileError);
        }
      }

      // Обрабатываем данные с именами авторов и расстоянием
      let processedFeed = data.map((item) => {
        let distance = Infinity;
        if (userLocation && item.location_lat && item.location_lng) {
          distance = calculateDistance(
            userLocation.lat,
            userLocation.lng,
            item.location_lat,
            item.location_lng
          );
        }
        const profile = profilesMap.get(item.creator_id);
        return {
          id: item.id,
          content: item.content,
          category: item.category,
          creator_id: item.creator_id,
          created_at: item.created_at,
          location_lat: item.location_lat,
          location_lng: item.location_lng,
          author_name: profile?.name || undefined,
          author_avatar: profile?.avatar,
          distance,
          event_date: item.event_date,
          event_time: item.event_time,
          address: item.address,
        };
      });

      // Сортируем по расстоянию (ближайшие первыми)
      processedFeed = processedFeed.sort((a, b) => {
        if (a.distance === Infinity && b.distance === Infinity) return 0;
        if (a.distance === Infinity) return 1;
        if (b.distance === Infinity) return -1;
        return a.distance - b.distance;
      });

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
    setStep('description'); // Переходим к шагу описания
    
    // Генерируем автоматический заголовок только если пользователь еще не ввел его вручную
    if (!isManualTitle) {
      const generatedTitle = generateAutoTitle(id, searchQuery);
      if (generatedTitle) {
        setAutoTitle(generatedTitle);
        setMessageContent(generatedTitle); // Автоматически заполняем поле
        setTitleGenerated(true);
        setIsManualTitle(false);
        // Визуальный эффект мерцания
        setTitleFlash(true);
        setTimeout(() => setTitleFlash(false), 1000);
      } else {
        setMessageContent(searchQuery || ''); // Используем текст из поиска как описание
        setTitleGenerated(false);
      }
    }
    
    setSearchQuery(''); // Очищаем поиск
    setHighlightedCategory(null);
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

  // Функция для "перемешивания" заголовка (берет следующий шаблон)
  const handleShuffleTitle = () => {
    if (selectedCategory && eventTemplates.length > 0) {
      const newTitle = generateAutoTitle(selectedCategory, messageContent, true); // useNext = true
      if (newTitle) {
        setAutoTitle(newTitle);
        setMessageContent(newTitle);
        setTitleGenerated(true);
        setIsManualTitle(false);
        // Визуальный эффект мерцания
        setTitleFlash(true);
        setTimeout(() => setTitleFlash(false), 1000);
        
        // Haptic feedback
        if (window.Telegram?.WebApp?.HapticFeedback) {
          try {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
          } catch (e) {
            console.warn('Haptic error:', e);
          }
        }
      }
    }
  };

  const handleNavigateToFeed = () => {
    // Плавный переход на главный экран (Activity Feed)
    setActiveTab('home');
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
    setAutoTitle('');
    setTitleGenerated(false);
    setSearchQuery('');
    setHighlightedCategory(null);
    setStep('category');
    setEventAddress('');
    setEventCoords(null);
    setIsMapSelectionMode(false);
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
        
        // Haptic feedback для успешного создания
        if (window.Telegram?.WebApp?.HapticFeedback) {
          try {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
          } catch (e) {
            console.warn('Haptic error:', e);
          }
        }
        
        WebApp.showAlert(isRussian ? 'Событие успешно создано!' : 'Event created successfully!');
        
        // Отправляем уведомления друзьям в радиусе 5 км
        if (locationData.location_lat && locationData.location_lng && userLocation) {
          try {
            // Загружаем друзей пользователя
            const { data: friendships } = await supabase
              .from('friendships')
              .select('user_id, friend_id')
              .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
            
            if (friendships && friendships.length > 0) {
              // Получаем ID друзей
              const friendIds = friendships.map((f: any) => 
                f.user_id === userId ? f.friend_id : f.user_id
              ).filter((id: number) => id !== userId);
              
              // Загружаем координаты друзей
              if (friendIds.length > 0) {
                const { data: friendProfiles } = await supabase
                  .from('profiles')
                  .select('id, full_name, location_lat, location_lng')
                  .in('id', friendIds)
                  .not('location_lat', 'is', null)
                  .not('location_lng', 'is', null);
                
                if (friendProfiles) {
                  // Проверяем каждого друга на расстояние
                  friendProfiles.forEach((friend: any) => {
                    const distance = calculateDistance(
                      locationData.location_lat!,
                      locationData.location_lng!,
                      friend.location_lat,
                      friend.location_lng
                    );
                    
                    // Если друг в радиусе 5 км, отправляем уведомление
                    if (distance <= 5) {
                      notifyNearbyFriendEvent(
                        friend.id,
                        userName || 'Кто-то',
                        messageContent.trim(),
                        distance
                      ).catch(err => console.warn('Failed to send notification:', err));
                    }
                  });
                }
              }
            }
          } catch (err) {
            console.warn('Failed to send event notifications:', err);
          }
        }
        
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

  // Форматирование времени публикации события ("Опубликовано [X] мин/час назад")
  const formatPublishedTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return isRussian ? 'Опубликовано только что' : 'Published just now';
    if (minutes < 60) return isRussian ? `Опубликовано ${minutes} мин назад` : `Published ${minutes}m ago`;
    if (hours < 24) return isRussian ? `Опубликовано ${hours} ч назад` : `Published ${hours}h ago`;
    if (days < 7) return isRussian ? `Опубликовано ${days} дн назад` : `Published ${days}d ago`;
    return isRussian 
      ? `Опубликовано ${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`
      : `Published ${date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`;
  };

  // Форматирование времени начала события ("Начало в [Время]")
  const formatEventStartTime = (eventDate?: string, eventTime?: string): string | null => {
    if (!eventDate && !eventTime) return null;
    
    if (eventDate && eventTime) {
      try {
        const date = new Date(`${eventDate}T${eventTime}`);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const eventDateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        if (eventDateOnly.getTime() === today.getTime()) {
          return isRussian 
            ? `Начало сегодня в ${eventTime}`
            : `Starts today at ${eventTime}`;
        } else {
          return isRussian
            ? `Начало ${date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} в ${eventTime}`
            : `Starts ${date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} at ${eventTime}`;
        }
      } catch (err) {
        console.warn('Error parsing event date/time:', err);
        return eventTime ? (isRussian ? `Начало в ${eventTime}` : `Starts at ${eventTime}`) : null;
      }
    }
    
    if (eventTime) {
      return isRussian ? `Начало в ${eventTime}` : `Starts at ${eventTime}`;
    }
    
    return null;
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

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white/20 flex flex-col">
      <div className={`flex-1 ${activeTab === 'map' ? '' : 'pb-20'} relative`}>
        {activeTab === 'home' ? (
          <div className="relative min-h-screen bg-black">
            {/* Soft Header - полностью прозрачный с размытием */}
            <motion.header 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="sticky top-0 z-50 px-4 py-3 flex items-center justify-between"
              style={{
                backgroundColor: 'transparent',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
            >
              {/* Аватарка пользователя слева с кольцом если онлайн */}
              <button
                onClick={() => {
                  setActiveTab('profile');
                  if (window.Telegram?.WebApp?.HapticFeedback) {
                    try {
                      window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                    } catch (e) {
                      console.warn('Haptic error:', e);
                    }
                  }
                }}
                className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0 group"
              >
                {userAvatar ? (
                  <>
                    <img 
                      src={userAvatar} 
                      alt={userName || 'User'} 
                      className="w-full h-full object-cover"
                    />
                    {/* Тонкое светящееся кольцо если онлайн */}
                    {userOnlineStatus && (
                      <div 
                        className="absolute inset-0 rounded-full border-2 border-green-500"
                        style={{
                          boxShadow: '0 0 12px rgba(34, 197, 94, 0.6), 0 0 0 2px rgba(34, 197, 94, 0.3)',
                          animation: 'onlineRingPulse 2s ease-in-out infinite',
                        }}
                      />
                    )}
                  </>
                ) : (
                  <div className="w-full h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 flex items-center justify-center text-white text-base font-bold">
                    {(userName || 'U')[0].toUpperCase()}
                    {userOnlineStatus && (
                      <div 
                        className="absolute inset-0 rounded-full border-2 border-green-500"
                        style={{
                          boxShadow: '0 0 12px rgba(34, 197, 94, 0.6), 0 0 0 2px rgba(34, 197, 94, 0.3)',
                          animation: 'onlineRingPulse 2s ease-in-out infinite',
                        }}
                      />
                    )}
                  </div>
                )}
                
                {/* Бейдж непрочитанных уведомлений */}
                {unreadNotificationsCount > 0 && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 border-2 border-white flex items-center justify-center z-10"
                  >
                    <span className="text-[10px] font-bold text-white">
                      {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                    </span>
                  </motion.div>
                )}
              </button>

              {/* Кнопки справа */}
              <div className="flex items-center gap-3">
                {/* Кнопка просмотра друзей */}
                <button
                  onClick={async () => {
                    // Загружаем список друзей перед открытием
                    await loadFriendsList();
                    setShowFriendsList(true);
                    if (window.Telegram?.WebApp?.HapticFeedback) {
                      try {
                        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                      } catch (e) {
                        console.warn('Haptic error:', e);
                      }
                    }
                  }}
                  className="w-10 h-10 rounded-full flex items-center justify-center hover:opacity-90 transition-opacity flex-shrink-0 bg-white/10 border border-white/20 backdrop-blur-sm"
                >
                  <UsersRound size={20} className="text-white" />
                </button>

                {/* Кнопка создания события - мягкая кнопка с градиентом */}
                <motion.button
                  onClick={async () => {
                    await loadEventTemplates();
                    setModalOpen(true);
                    setStep('category');
                    setSelectedCategory(null);
                    setSearchQuery('');
                    setHighlightedCategory(null);
                    if (window.Telegram?.WebApp?.HapticFeedback) {
                      try {
                        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                      } catch (e) {
                        console.warn('Haptic error:', e);
                      }
                    }
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-11 h-11 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-purple-500/40 backdrop-blur-sm"
                  style={{
                    boxShadow: '0 4px 16px rgba(168, 85, 247, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <PlusCircle size={22} className="text-white" strokeWidth={2.5} />
                </motion.button>
              </div>
            </motion.header>

            {/* Интерактивная карта - "окно в мир" */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4, ease: 'easeOut' }}
              className="relative mx-4 mt-4 mb-6 rounded-[32px] overflow-hidden"
              style={{
                height: '40vh',
                minHeight: '280px',
                maxHeight: '400px',
                boxShadow: 'inset 0 4px 20px rgba(0, 0, 0, 0.3), 0 8px 32px rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
              }}
            >
              <MapScreen 
                key="window-map"
                activeCategory={null}
                refreshTrigger={mapRefreshTrigger}
                isBackground={false}
                maxEvents={4}
                onEventLongPress={async (impulse) => {
                  setSelectedEventDetail(impulse as Impulse);
                  if (window.Telegram?.WebApp?.HapticFeedback) {
                    try {
                      window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                    } catch (e) {
                      console.warn('Haptic error:', e);
                    }
                  }
                }}
              />
            </motion.div>

            {/* Hero-карточка "Твой идеальный план" */}
            {!isLoadingFeed && feed.length > 0 && (
              <motion.div
                ref={heroCardRef}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.6, ease: 'easeOut' }}
                className="mx-4 mb-6"
              >
                {/* Подпись над карточкой */}
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                  className="text-xs font-medium text-white/60 mb-3 px-2"
                >
                  {isRussian 
                    ? (feed[0].distance !== undefined && feed[0].distance !== Infinity && feed[0].distance < 1
                        ? `Совсем рядом с тобой • ${Math.round(feed[0].distance * 1000)} метров`
                        : 'Твой идеальный план на вечер')
                    : (feed[0].distance !== undefined && feed[0].distance !== Infinity && feed[0].distance < 1
                        ? `Right next to you • ${Math.round(feed[0].distance * 1000)} meters`
                        : 'Your ideal plan for the evening')
                  }
              </motion.p>

                {/* Hero-карточка события */}
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => {
                    setSelectedEventDetail(feed[0]);
                    if (window.Telegram?.WebApp?.HapticFeedback) {
                      try {
                        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                      } catch (e) {
                        console.warn('Haptic error:', e);
                      }
                    }
                  }}
                  className="relative rounded-3xl p-5 cursor-pointer overflow-hidden"
                  style={{
                    backgroundColor: 'rgba(18, 18, 18, 0.8)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  {/* Градиентный фон для категории */}
                  <div 
                    className="absolute inset-0 opacity-20"
                    style={{
                      background: `linear-gradient(135deg, ${categoryColors[feed[0].category] || '#6366f1'}40, ${categoryColors[feed[0].category] || '#a855f7'}20)`,
                    }}
                  />

                  <div className="relative z-10 flex items-start gap-4">
                    {/* Крупная иконка категории */}
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.8, type: 'spring', stiffness: 200 }}
                      className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 text-3xl"
                      style={{
                        backgroundColor: `${categoryColors[feed[0].category] || '#6366f1'}30`,
                        border: `2px solid ${categoryColors[feed[0].category] || '#6366f1'}60`,
                        boxShadow: `0 4px 16px ${categoryColors[feed[0].category] || '#6366f1'}40`,
                      }}
                    >
                      {getSmartIcon(feed[0].content, feed[0].category).emoji}
                    </motion.div>

                    {/* Контент карточки */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-white mb-2 line-clamp-2">
                        {feed[0].content}
                      </h3>

                      {/* Расстояние */}
                      {feed[0].distance !== undefined && feed[0].distance !== Infinity && (
                        <div className="flex items-center gap-2 mb-3">
                          <MapPin size={14} className="text-white/60 flex-shrink-0" />
                          <span className="text-sm text-white/70">
                            {feed[0].distance < 1 
                              ? `${Math.round(feed[0].distance * 1000)} метров`
                              : `${feed[0].distance.toFixed(1)} км`
                            }
                      </span>
                    </div>
                      )}

                      {/* Лица друзей (аватарки), если они туда идут */}
                      {/* TODO: Добавить загрузку участников события из БД */}
                      
                      {/* Время публикации и начала события */}
                      <div className="flex flex-col gap-1.5 mt-3">
                        <div className="text-xs text-white/60">
                          {formatPublishedTime(feed[0].created_at)}
                        </div>
                        {feed[0].event_time && (
                          <div className="flex items-center gap-2">
                            <Clock size={14} className="text-white/60 flex-shrink-0" />
                            <span className="text-sm text-white/70">
                              {formatEventStartTime(feed[0].event_date, feed[0].event_time) || `Начало в ${feed[0].event_time}`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {/* Лента 'Чуни' - остальные события с fade-in эффектом */}
            <section className="px-4 pb-20">
              {isLoadingFeed ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-8 text-white/40"
                >
                  {isRussian ? 'Загрузка...' : 'Loading...'}
                </motion.div>
              ) : feed.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-8 text-white/40 text-sm"
                >
                  {isRussian ? 'Пока нет ближайших событий' : 'No nearest events yet'}
                </motion.div>
              ) : (
                <div className="space-y-4">
                  {/* Показываем события начиная со второго (первое в Hero-карточке) */}
                  {feed.slice(1).map((impulse, index) => (
                      <motion.div
                        key={impulse.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                      transition={{ 
                        duration: 0.5, 
                        delay: 0.8 + index * 0.1, // Stagger анимация
                        ease: 'easeOut' 
                      }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true, margin: '-100px' }}
                      className="rounded-2xl p-4 overflow-hidden"
                      style={{
                        backgroundColor: 'rgba(18, 18, 18, 0.6)',
                        backdropFilter: 'blur(15px)',
                        WebkitBackdropFilter: 'blur(15px)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                      }}
                    >
                      <div className="flex items-start gap-3">
                        {/* Аватар автора */}
                        <div
                          onClick={() => {
                            if (impulse.creator_id) {
                              handleUserProfileClick(
                                impulse.creator_id,
                                impulse.author_name,
                                impulse.author_avatar,
                                undefined
                              );
                            }
                          }}
                          className="flex-shrink-0 cursor-pointer"
                        >
                          {impulse.author_avatar ? (
                            <img 
                              src={impulse.author_avatar} 
                              alt={impulse.author_name || 'User'}
                              className="w-10 h-10 rounded-full object-cover border-2 border-white/20"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 flex items-center justify-center text-white text-sm font-bold">
                              {(impulse.author_name || 'A')[0].toUpperCase()}
                            </div>
                          )}
                        </div>

                        {/* Контент события */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{getSmartIcon(impulse.content, impulse.category).emoji}</span>
                            <span className="text-sm font-bold text-white">
                              {impulse.author_name || (isRussian ? 'Аноним' : 'Anonymous')}
                            </span>
                          </div>
                          
                          <p className="text-sm text-white/90 mb-2 line-clamp-2">
                          {impulse.content}
                        </p>

                          {/* Информация о времени и расстоянии */}
                          <div className="flex flex-col gap-1 text-xs text-white/60">
                            <div>{formatPublishedTime(impulse.created_at)}</div>
                            {formatEventStartTime(impulse.event_date, impulse.event_time) && (
                              <div>{formatEventStartTime(impulse.event_date, impulse.event_time)}</div>
                            )}
                            {impulse.distance !== undefined && impulse.distance !== Infinity && (
                              <div className="flex items-center gap-1">
                            <MapPin size={12} />
                                <span>{formatDistance(impulse.distance)}</span>
                          </div>
                        )}
                          </div>
                        </div>
                      </div>
                      </motion.div>
                    ))}
                </div>
              )}
            </section>
          </div>
        ) : activeTab === 'profile' ? (
          <Profile />
        ) : (
          <MapScreen 
            key={activeTab} 
            activeCategory={activeCategory} 
            refreshTrigger={mapRefreshTrigger}
            onBack={() => {
              setActiveTab('home');
            }}
            onNavigateToFeed={handleNavigateToFeed}
          />
        )}
      </div>

      {/* Глобальное детальное окно события (работает на всех табах) */}
      <AnimatePresence>
        {selectedEventDetail && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEventDetail(null)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 border border-white/20 rounded-3xl p-6 z-[2001] max-w-md mx-auto max-h-[90vh] overflow-y-auto"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-light text-white">
                  {selectedEventDetail.category}
                </h3>
                <button
                  onClick={() => setSelectedEventDetail(null)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={20} className="text-white/60" />
                </button>
              </div>
              <div className="space-y-4">
                <p className="text-white/90 leading-relaxed">
                  {selectedEventDetail.content}
                </p>
                {selectedEventDetail.address && (
                  <div className="flex items-start gap-2 text-white/70 text-sm">
                    <MapPin size={16} className="mt-0.5 flex-shrink-0" />
                    <span>{selectedEventDetail.address}</span>
                  </div>
                )}
                {selectedEventDetail.event_date && selectedEventDetail.event_time && (
                  <div className="flex items-center gap-2 text-white/70 text-sm">
                    <Clock size={16} />
                    <span>
                      {selectedEventDetail.event_date} в {selectedEventDetail.event_time}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseModal}
              className="fixed inset-0 z-50"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
            />
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
              className="fixed inset-x-0 bottom-0 border-t border-white/20 rounded-t-3xl p-6 z-50 max-h-[85vh] overflow-y-auto"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-light text-white">
                  {step === 'category' 
                    ? (isRussian ? 'Создать событие' : 'Create Event')
                    : step === 'description'
                    ? (isRussian ? 'Опишите событие' : 'Describe Event')
                    : (isRussian ? 'Выберите место и время' : 'Select Location & Time')
                  }
                </h3>
                <button
                  onClick={handleCloseModal}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={20} className="text-white/60" />
                </button>
              </div>

              {/* Индикатор шагов (3 шага: category, description, location) */}
              <div className="flex items-center gap-2 mb-6">
                <div className={`flex-1 h-1 rounded-full ${step === 'description' || step === 'location' ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500' : 'bg-white/20'}`} />
                <div className={`flex-1 h-1 rounded-full ${step === 'location' ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500' : 'bg-white/20'}`} />
              </div>

              {/* Шаг 0: Умный поиск и выбор категории */}
              {step === 'category' && (
                <div className="space-y-4">
                  {/* Поле поиска */}
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={20} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={isRussian ? 'Что планируешь?' : 'What are you planning?'}
                      className="w-full pl-12 pr-4 py-3 rounded-2xl bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 text-sm text-white placeholder:text-white/35"
                      autoFocus
                    />
                  </div>

                  {/* Сетка категорий */}
                  <div className="grid grid-cols-2 gap-3">
                    {categories.map((cat) => {
                      const categoryClass = `category-${cat.id}`;
                      const isHighlighted = highlightedCategory === cat.id;
                      const isSelected = selectedCategory === cat.id;
                      
                      return (
                        <motion.button
                          key={cat.id}
                          onClick={() => {
                            handleCategoryClick(cat.id);
                          }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          animate={isHighlighted ? { scale: 1.08 } : { scale: 1 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                          className={`relative p-4 rounded-2xl flex flex-col items-center justify-center gap-3 glass-card hover:bg-black/40 transition-all duration-300 ${
                            isSelected ? 'border-2 border-white/50' : isHighlighted ? 'border-2 border-purple-400/50' : 'border border-white/20'
                          }`}
                          style={{
                            boxShadow: isHighlighted ? '0 0 20px rgba(168, 85, 247, 0.4)' : undefined,
                          }}
                        >
                          <motion.div 
                            className={`category-ring ${categoryClass} ${isSelected || isHighlighted ? 'active' : ''}`}
                            animate={isHighlighted ? { scale: 1.15, rotate: [0, 5, -5, 0] } : { scale: 1, rotate: 0 }}
                            transition={{ duration: 0.5, repeat: isHighlighted ? Infinity : 0, repeatType: 'reverse' }}
                          >
                            <div className="category-icon-wrapper">
                              <cat.icon size={28} className="text-white/80" />
                            </div>
                          </motion.div>
                          <span className="text-sm font-light tracking-wide text-white text-center">
                            {isRussian ? cat.label.ru : cat.label.en}
                          </span>
                          {isHighlighted && !isSelected && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 flex items-center justify-center"
                            >
                              <span className="text-xs">✨</span>
                            </motion.div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Шаг 1: Описание */}
              {step === 'description' && (
                <>
                  {/* Поле заголовка с кнопкой "перемешать" */}
                  <div className="relative mb-4">
                    <input
                      type="text"
                value={messageContent}
                      onChange={(e) => {
                        setMessageContent(e.target.value);
                        setIsManualTitle(true); // Пользователь редактирует вручную
                        setTitleGenerated(false);
                        setTitleFlash(false);
                      }}
                      placeholder={autoTitle || (isRussian ? 'Название события...' : 'Event title...')}
                      className={`w-full rounded-2xl bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 text-sm text-white placeholder:text-white/35 px-4 py-3 pr-12 transition-all duration-300 ${
                        titleFlash ? 'bg-purple-500/20 border-purple-400/50 text-purple-200' : ''
                      }`}
                autoFocus
              />
                    {selectedCategory && eventTemplates.length > 0 && (
                      <motion.button
                        onClick={handleShuffleTitle}
                        whileHover={{ scale: 1.1, rotate: 15 }}
                        whileTap={{ scale: 0.9 }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-white/10 transition-colors"
                        title={isRussian ? 'Сгенерировать другой вариант' : 'Generate another variant'}
                      >
                        <Dice6 size={18} className="text-white/80" />
                      </motion.button>
                    )}
                  </div>
                  
                  {/* Анимация появления авто-заголовка */}
                  <AnimatePresence>
                    {titleGenerated && autoTitle && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mb-3 text-xs text-white/50 italic"
                      >
                        {isRussian ? '✨ Автоматически предложено' : '✨ Auto-suggested'}
                      </motion.div>
                    )}
                  </AnimatePresence>

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
                              window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                            } catch (e) {
                              console.warn('Haptic error:', e);
                            }
                          }
                        }
                      }}
                  disabled={isSubmitting || !messageContent.trim()}
                      className={`flex-1 rounded-2xl gradient-primary py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-all ${
                        messageContent.trim() ? 'opacity-100' : 'opacity-50 cursor-not-allowed'
                      }`}
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
                    
                    {/* Поля для даты и времени - компактный layout */}
                    <div className="space-y-3 mb-4">
                      <div>
                        <label className="block text-xs text-white/60 mb-1.5 font-medium">
                          {isRussian ? 'Дата' : 'Date'}
                        </label>
                        <input
                          type="date"
                          value={eventDate}
                          onChange={(e) => setEventDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          className="w-full rounded-xl bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 text-sm text-white px-3 py-2.5"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-white/60 mb-1.5 font-medium">
                          {isRussian ? 'Время' : 'Time'}
                        </label>
                        <input
                          type="time"
                          value={eventTime}
                          onChange={(e) => setEventTime(e.target.value)}
                          className="w-full rounded-xl bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 text-sm text-white px-3 py-2.5"
                        />
                      </div>
                    </div>

                    {/* Плавающая кнопка выбора адреса (Pin Button) */}
                    <div className="relative mb-4 pb-16">
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

                          {/* Floating Pin Button - абсолютное позиционирование внутри контейнера */}
                          <button
                            type="button"
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
                            className="absolute bottom-4 right-4 w-12 h-12 rounded-full bg-white border-2 border-white/30 shadow-lg flex items-center justify-center z-[100] hover:scale-110 transition-transform"
                            style={{
                              boxShadow: '0 0 20px rgba(255, 255, 255, 0.3), 0 4px 12px rgba(0, 0, 0, 0.3)',
                            }}
                          >
                            <MapPin size={20} className="text-black" />
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
                      onClick={() => {
                        if (window.Telegram?.WebApp?.HapticFeedback) {
                          try {
                            window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                          } catch (e) {
                            console.warn('Haptic error:', e);
                          }
                        }
                        handleSendMessage();
                      }}
                      disabled={isSubmitting || (!eventCoords && !eventAddress.trim())}
                      className="flex-1 rounded-2xl gradient-primary py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Таб-бар скрыт полностью при переходе на карту */}
      {activeTab !== 'map' && (
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
            className={`relative flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors ${
              activeTab === 'profile' ? 'text-white' : 'text-white/50'
            }`}
          >
            <User size={22} className={activeTab === 'profile' ? 'text-white' : 'text-white/50'} />
            <span className="text-xs font-light">
              {isRussian ? 'Профиль' : 'Profile'}
            </span>
            {unreadMessagesCount > 0 && (
              <span className="absolute -top-1 right-6 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-semibold flex items-center justify-center">
                {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
              </span>
            )}
          </button>
        </div>
      </nav>
      )}

      {/* Модальное окно профиля пользователя */}
      <AnimatePresence>
        {selectedUserProfile && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedUserProfile(null)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 border border-white/20 rounded-3xl p-6 z-[2001] max-w-md mx-auto max-h-[80vh] flex flex-col"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  {isRussian ? 'Профиль' : 'Profile'}
                </h3>
                <button
                  onClick={() => setSelectedUserProfile(null)}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X size={20} className="text-white/70" />
                </button>
              </div>

              {/* Аватар и имя */}
              <div className="flex flex-col items-center gap-3 mb-6">
                {selectedUserProfile.avatar ? (
                  <img
                    src={selectedUserProfile.avatar}
                    alt={selectedUserProfile.name || 'User'}
                    className="w-20 h-20 rounded-full object-cover border-2 border-white/20"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 flex items-center justify-center text-white text-2xl font-bold">
                    {(selectedUserProfile.name || selectedUserProfile.username || 'U')[0].toUpperCase()}
                  </div>
                )}
                <div className="text-center">
                  <p className="text-lg font-semibold text-white">
                    {selectedUserProfile.name || selectedUserProfile.username || 'User'}
                  </p>
                  {selectedUserProfile.username && selectedUserProfile.name && (
                    <p className="text-sm text-white/50">@{selectedUserProfile.username}</p>
                  )}
                </div>
              </div>

              {/* Кнопка добавить в друзья */}
              <button
                onClick={async () => {
                  await handleToggleFriendship(selectedUserProfile.id);
                }}
                className={`w-full rounded-xl py-3 px-4 font-semibold transition-all flex items-center justify-center gap-2 ${
                  isFriend
                    ? 'bg-white/10 text-white/70 hover:bg-white/20'
                    : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 text-white hover:opacity-90'
                }`}
              >
                {isFriend ? (
                  <>
                    <UserMinus size={18} />
                    {isRussian ? 'Удалить из друзей' : 'Remove Friend'}
                  </>
                ) : (
                  <>
                    <UserPlus size={18} />
                    {isRussian ? 'Добавить в друзья' : 'Add Friend'}
                  </>
                )}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Модальное окно списка друзей */}
      <AnimatePresence>
        {showFriendsList && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowFriendsList(false);
                setFriendsSearchQuery('');
              }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[2000]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 border border-white/20 rounded-3xl p-6 z-[2001] max-w-md mx-auto max-h-[85vh] flex flex-col"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-light text-white">
                  {isRussian ? 'Друзья' : 'Friends'}
                </h3>
                <button
                  onClick={() => {
                    setShowFriendsList(false);
                    setFriendsSearchQuery('');
                  }}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={20} className="text-white/60" />
                </button>
              </div>

              {/* Поле поиска друзей - не активное при открытии */}
              <div className="relative mb-4">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                <input
                  ref={friendsSearchInputRef}
                  type="text"
                  value={friendsSearchQuery}
                  onChange={(e) => setFriendsSearchQuery(e.target.value)}
                  placeholder={isRussian ? 'Поиск друзей...' : 'Search friends...'}
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 text-sm text-white placeholder:text-white/35"
                  onFocus={() => {
                    // Поле становится активным только при явном клике
                  }}
                />
              </div>

              {/* Список друзей */}
              <div className="flex-1 overflow-y-auto space-y-2">
                {isLoadingFriends ? (
                  <div className="text-center py-8 text-white/40 text-sm">
                    {isRussian ? 'Загрузка...' : 'Loading...'}
                  </div>
                ) : friends.length === 0 ? (
                  <div className="text-center py-8 text-white/40 text-sm">
                    {isRussian ? 'Пока нет друзей' : 'No friends yet'}
                  </div>
                ) : (
                  (friendsSearchQuery.trim() === '' ? friends : friends.filter(friend => 
                    (friend.full_name?.toLowerCase().includes(friendsSearchQuery.toLowerCase()) || 
                     friend.username?.toLowerCase().includes(friendsSearchQuery.toLowerCase()))
                  )).map((friend) => {
                    // Проверяем онлайн статус (last_seen менее 5 минут назад)
                    const isOnline = friend.last_seen ? 
                      (new Date().getTime() - new Date(friend.last_seen).getTime()) < 5 * 60 * 1000 : 
                      false;

                    return (
                      <motion.div
                        key={friend.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
                        onClick={() => {
                          handleUserProfileClick(
                            friend.id,
                            friend.full_name || undefined,
                            friend.avatar_url || undefined,
                            friend.username || undefined
                          );
                          setShowFriendsList(false);
                          setFriendsSearchQuery('');
                        }}
                      >
                        {/* Аватар друга с индикатором онлайн */}
                        <div className="relative flex-shrink-0">
                          {friend.avatar_url ? (
                            <img
                              src={friend.avatar_url}
                              alt={friend.full_name || 'Friend'}
                              className="w-12 h-12 rounded-full object-cover border-2 border-white/20"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 flex items-center justify-center text-white font-bold">
                              {(friend.full_name || friend.username || 'F')[0].toUpperCase()}
                            </div>
                          )}
                          {/* Индикатор онлайн или события */}
                          <div
                            className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-black ${
                              friend.current_event
                                ? 'bg-white flex items-center justify-center'
                                : isOnline
                                ? 'bg-green-500'
                                : 'bg-gray-500'
                            }`}
                          >
                            {friend.current_event && (
                              <span className="text-xs">{friend.current_event.icon}</span>
                            )}
                          </div>
                        </div>

                        {/* Имя друга */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {friend.full_name || friend.username || 'Friend'}
                          </p>
                          {friend.current_event && (
                            <p className="text-xs text-white/60 truncate">
                              {isRussian ? `На событии: ${friend.current_event.category}` : `At event: ${friend.current_event.category}`}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
