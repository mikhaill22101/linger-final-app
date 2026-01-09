import { useEffect, useState, useRef } from 'react';
import { supabase, isSupabaseConfigured, checkSupabaseConnection } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Clock, X, Sparkles, UserPlus, UserMinus, MessageCircle, Search } from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import { getSmartIcon } from '../lib/smartIcon';
import { notifyFriendAdded } from '../lib/notifications';

interface TelegramUser {
  id?: number;
  first_name?: string;
  username?: string;
  photo_url?: string;
}

interface ProfileState {
  firstName: string;
  username: string;
  photoUrl?: string;
  bio: string;
  telegramId?: number;
}

interface MyImpulse {
  id: number;
  content: string;
  category: string;
  created_at: string;
  location_lat?: number | null;
  location_lng?: number | null;
  address?: string;
}

const Profile: React.FC = () => {
  const [profile, setProfile] = useState<ProfileState>({
    firstName: '',
    username: '',
    photoUrl: undefined,
    bio: '',
    telegramId: undefined,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [myImpulses, setMyImpulses] = useState<MyImpulse[]>([]);
  const [isLoadingImpulses, setIsLoadingImpulses] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedEventChat, setSelectedEventChat] = useState<MyImpulse | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ id: number; user_id: number; text: string; created_at: string; profiles?: { full_name?: string } }>>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [chuniRating, setChuniRating] = useState<number>(0); // Рейтинг Чуни
  const [friends, setFriends] = useState<Array<{ 
    id: number; 
    full_name?: string; 
    avatar_url?: string; 
    username?: string;
    last_seen?: string | null;
    location_lat?: number | null;
    location_lng?: number | null;
    current_event?: { id: number; category: string; icon?: string } | null;
  }>>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [selectedDirectChat, setSelectedDirectChat] = useState<number | null>(null); // ID друга для личного чата
  const [directMessages, setDirectMessages] = useState<Array<{ id: number; sender_id: number; receiver_id: number; text: string; created_at: string; profiles?: { full_name?: string; avatar_url?: string } }>>([]);
  const [newDirectMessage, setNewDirectMessage] = useState('');
  const [isLoadingDirectChat, setIsLoadingDirectChat] = useState(false);
  const directChatChannelRef = useRef<any>(null);
  const channelRef = useRef<any>(null);
  const [isSearchFriendsOpen, setIsSearchFriendsOpen] = useState(false);
  const [isFriendsModalOpen, setIsFriendsModalOpen] = useState(false); // Модальное окно списка друзей
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: number; full_name?: string; avatar_url?: string; username?: string; isFriend?: boolean }>>([]);
  const [globalSearchResults, setGlobalSearchResults] = useState<Array<{ id: number; full_name?: string; avatar_url?: string; username?: string; isFriend?: boolean }>>([]); // Результаты глобального поиска
  const [isSearching, setIsSearching] = useState(false);

  // Загрузка профиля из базы данных
  // Обновление last_seen при активности пользователя
  useEffect(() => {
    if (profile.telegramId && isSupabaseConfigured) {
      const updateLastSeen = async () => {
        try {
          await supabase
            .from('profiles')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', profile.telegramId);
        } catch (err) {
          console.warn('Failed to update last_seen:', err);
        }
      };
      
      // Обновляем при монтировании и каждые 2 минуты
      updateLastSeen();
      const interval = setInterval(updateLastSeen, 2 * 60 * 1000);
      
      return () => clearInterval(interval);
    }
  }, [profile.telegramId, isSupabaseConfigured]);

  useEffect(() => {
    const loadProfile = async () => {
      if (typeof window === 'undefined') return;

      const tgWebApp = (window as unknown as { Telegram?: { WebApp?: {
        initDataUnsafe?: { user?: TelegramUser };
        ready?: () => void;
        expand?: () => void;
      } } }).Telegram?.WebApp;

      try {
        const user: TelegramUser | undefined = tgWebApp?.initDataUnsafe?.user;

        if (user) {
          const telegramId = user.id;
          
          // Устанавливаем данные из Telegram
          setProfile((prev) => ({
            ...prev,
            firstName: user.first_name || prev.firstName,
            username: user.username || prev.username,
            photoUrl: user.photo_url || prev.photoUrl,
            telegramId: telegramId,
          }));

          // Загружаем био из базы данных, если есть telegram_id
          if (telegramId) {
            if (!isSupabaseConfigured) {
              console.warn('⚠️ Supabase не настроен, пропускаем загрузку профиля');
              setIsLoading(false);
              return;
            }

            const { data, error } = await supabase
              .from('profiles')
              .select('bio, full_name, avatar_url')
              .eq('id', telegramId)
              .single();

            if (error && error.code !== 'PGRST116') {
              // PGRST116 - это "not found", что нормально для нового пользователя
              console.error('❌ Error loading profile from Supabase:', error);
              console.error('  Code:', error.code);
              console.error('  Message:', error.message);
            } else if (data) {
              setProfile((prev) => ({
                ...prev,
                bio: data.bio || '',
                firstName: data.full_name || prev.firstName,
                photoUrl: data.avatar_url || prev.photoUrl,
              }));
            }
          }
        }

        // Try to expand to full viewport inside Telegram
        tgWebApp?.ready?.();
        tgWebApp?.expand?.();
      } catch (err) {
        console.error('Failed to read Telegram WebApp user data', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, []);

  // Функция получения адреса
  const getAddress = async (lat: number, lng: number): Promise<string> => {
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
  };

  // Форматирование относительного времени ("Опубликовано X назад")
  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;

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
  };

  // Форматирование даты и времени начала события ("Начало: Дата в Время")
  const formatEventDateTime = (eventDate?: string, eventTime?: string): string | null => {
    if (!eventDate || !eventTime) return null;
    
    const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
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
  };

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

  // Загрузка ближайших событий (вместо "Мои записи")
  useEffect(() => {
    const loadNearestImpulses = async () => {
      if (!profile.telegramId) return;

      if (!isSupabaseConfigured) {
        console.warn('⚠️ Supabase не настроен, пропускаем загрузку ближайших событий');
        setIsLoadingImpulses(false);
        return;
      }

      try {
        setIsLoadingImpulses(true);
        
        // Получаем геолокацию пользователя
        let userLat: number | null = null;
        let userLng: number | null = null;
        
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
          });
          userLat = position.coords.latitude;
          userLng = position.coords.longitude;
        } catch (err) {
          console.warn('⚠️ Геолокация недоступна для загрузки ближайших событий');
        }

        // Загружаем все события с координатами
        const { data, error } = await supabase
          .from('impulses')
          .select('id, content, category, created_at, location_lat, location_lng, event_date, event_time')
          .not('location_lat', 'is', null)
          .not('location_lng', 'is', null)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          console.error('❌ Error loading impulses from Supabase:', error);
          setMyImpulses([]);
        } else if (data) {
          // Вычисляем расстояния и сортируем
          let impulsesWithDistance = (data || []).map((impulse) => {
            let distance: number | undefined = undefined;
            if (userLat !== null && userLng !== null && impulse.location_lat && impulse.location_lng) {
              distance = calculateDistance(userLat, userLng, impulse.location_lat, impulse.location_lng);
            }
            return { ...impulse, distance };
          });

          // Сортируем по расстоянию (ближайшие первые)
          impulsesWithDistance.sort((a, b) => {
            if (a.distance === undefined && b.distance === undefined) return 0;
            if (a.distance === undefined) return 1;
            if (b.distance === undefined) return -1;
            return a.distance - b.distance;
          });

          // Берем только ближайшие (например, первые 10)
          impulsesWithDistance = impulsesWithDistance.slice(0, 10);

          // Загружаем адреса для событий
          const impulsesWithAddresses = await Promise.all(
            impulsesWithDistance.map(async (impulse) => {
              if (impulse.location_lat && impulse.location_lng) {
                try {
                  const address = await getAddress(impulse.location_lat, impulse.location_lng);
                  return { ...impulse, address };
                } catch (err) {
                  console.warn('Error getting address for impulse:', impulse.id, err);
                  return impulse;
                }
              }
              return impulse;
            })
          );
          
          setMyImpulses(impulsesWithAddresses);
        } else {
          setMyImpulses([]);
        }

        // Рейтинг Чуни = количество созданных пользователем событий (отдельный запрос)
        const { data: myEventsData } = await supabase
          .from('impulses')
          .select('id')
          .eq('creator_id', profile.telegramId);
        setChuniRating(myEventsData?.length || 0);
      } catch (err) {
        console.error('Failed to load nearest impulses:', err);
        setMyImpulses([]);
      } finally {
        setIsLoadingImpulses(false);
      }
    };

    loadNearestImpulses();
  }, [profile.telegramId]);

  // Загрузка списка друзей
  useEffect(() => {
    const loadFriends = async () => {
      if (!profile.telegramId) return;

      if (!isSupabaseConfigured) {
        console.warn('⚠️ Supabase не настроен, пропускаем загрузку друзей');
        setIsLoadingFriends(false);
        return;
      }

      try {
        setIsLoadingFriends(true);
        // Загружаем друзей: где текущий пользователь либо user_id, либо friend_id
        const { data, error } = await supabase
          .from('friendships')
          .select(`
            id,
            user_id,
            friend_id,
            profiles_user:user_id (id, full_name, avatar_url, username, last_seen, location_lat, location_lng),
            profiles_friend:friend_id (id, full_name, avatar_url, username, last_seen, location_lat, location_lng)
          `)
          .or(`user_id.eq.${profile.telegramId},friend_id.eq.${profile.telegramId}`);

        if (error) {
          console.error('❌ Error loading friends from Supabase:', error);
          setFriends([]);
        } else {
          // Преобразуем данные: для каждой дружбы берем профиль друга (не текущего пользователя)
          const friendsList = (data || []).map((friendship: any) => {
            const friendProfile = friendship.user_id === profile.telegramId 
              ? friendship.profiles_friend 
              : friendship.profiles_user;
            
            const friendId = friendProfile?.id || (friendship.user_id === profile.telegramId ? friendship.friend_id : friendship.user_id);
            
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
                // Функция расчета расстояния (Haversine)
                const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
                  const R = 6371; // Радиус Земли в км
                  const dLat = (lat2 - lat1) * Math.PI / 180;
                  const dLng = (lng2 - lng1) * Math.PI / 180;
                  const a = 
                    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLng / 2) * Math.sin(dLng / 2);
                  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                  return R * c;
                };
                
                // Проверяем каждого друга
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
                      // Получаем иконку события на основе категории и текста
                      const iconData = getSmartIcon(nearestEvent.content || nearestEvent.category);
                      friend.current_event = {
                        id: nearestEvent.id,
                        category: nearestEvent.category,
                        icon: iconData.icon,
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
        }
      } catch (err) {
        console.error('Failed to load friends:', err);
        setFriends([]);
      } finally {
        setIsLoadingFriends(false);
      }
    };

    loadFriends();
  }, [profile.telegramId]);

  const handleDeleteImpulse = async (id: number) => {
    if (!profile.telegramId) return;

    if (!isSupabaseConfigured) {
      WebApp.showAlert('Ошибка: База данных не настроена');
      return;
    }

    try {
      setDeletingIds(prev => new Set(prev).add(id));
      
      const { error } = await supabase
        .from('impulses')
        .delete()
        .eq('id', id)
        .eq('creator_id', profile.telegramId);

      if (error) {
        console.error('❌ Error deleting impulse from Supabase:', error);
        console.error('  Code:', error.code);
        console.error('  Message:', error.message);
        
        const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
        let errorMessage = isRussian ? 'Ошибка при удалении события' : 'Error deleting event';
        if (error.code === '42501') {
          errorMessage = isRussian ? 'Ошибка: Нет доступа к базе данных' : 'Error: Database access denied';
        }
        
        WebApp.showAlert(errorMessage);
      } else {
        // Удаляем из локального состояния
        setMyImpulses(prev => prev.filter(impulse => impulse.id !== id));
        if (window.Telegram?.WebApp?.HapticFeedback) {
          try {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
          } catch (e) {
            console.warn('Haptic error:', e);
          }
        }
      }
    } catch (err) {
      console.error('❌ Failed to delete impulse:', err);
      const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
      WebApp.showAlert(isRussian ? 'Ошибка при удалении события' : 'Error deleting event');
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;

    if (minutes < 1) return isRussian ? 'только что' : 'just now';
    if (minutes < 60) return isRussian ? `${minutes} мин назад` : `${minutes}m ago`;
    if (hours < 24) return isRussian ? `${hours} ч назад` : `${hours}h ago`;
    if (days < 7) return isRussian ? `${days} дн назад` : `${days}d ago`;
    return date.toLocaleDateString(isRussian ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' });
  };

  const handleBioChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setProfile((prev) => ({ ...prev, bio: value }));
  };

  const handleSave = async () => {
    if (!profile.telegramId) {
      console.error('Telegram ID is missing');
      return;
    }

    setIsSaving(true);

    const tgWebApp = (typeof window !== 'undefined'
      ? (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred?: (style: string) => void } } } }).Telegram?.WebApp
      : undefined);

    if (!isSupabaseConfigured) {
      WebApp.showAlert('Ошибка: База данных не настроена');
      setIsSaving(false);
      return;
    }

    try {
      // Сохраняем данные в Supabase методом upsert
      // id должен быть bigint из Telegram user.id
      const updateData: any = {
          id: profile.telegramId, // bigint из Telegram user.id
          full_name: profile.firstName,
          bio: profile.bio,
          updated_at: new Date().toISOString(),
      };

      if (profile.photoUrl) {
        updateData.avatar_url = profile.photoUrl;
      }

      const { data, error } = await supabase
        .from('profiles')
        .upsert(updateData, {
          onConflict: 'id', // Конфликт по полю id
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Error saving profile to Supabase:', error);
        console.error('  Code:', error.code);
        console.error('  Message:', error.message);
        
        let errorMessage = 'Ошибка при сохранении профиля';
        if (error.code === '23503') {
          errorMessage = 'Ошибка: Пользователь не найден';
        } else if (error.code === '42501') {
          errorMessage = 'Ошибка: Нет доступа к базе данных';
        }
        
        WebApp.showAlert(errorMessage);
      } else {
        console.log('Profile saved successfully:', data);
        // Optional: light haptic feedback when available
        try {
          tgWebApp?.HapticFeedback?.impactOccurred?.('light');
        } catch {
          // Non‑critical, ignore
        }
      }
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarClick = () => {
    if (profile.photoUrl) {
      setAvatarModalOpen(true);
      if (window.Telegram?.WebApp?.HapticFeedback) {
        try {
          window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
        } catch (e) {
          console.warn('Haptic error:', e);
        }
      }
    }
  };

  const handleChangePhoto = () => {
    fileInputRef.current?.click();
    if (window.Telegram?.WebApp?.HapticFeedback) {
      try {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
      } catch (e) {
        console.warn('Haptic error:', e);
      }
    }
  };

  // Загрузка сообщений чата события с Realtime подпиской
  const loadEventChat = async (eventId: number) => {
    setIsLoadingChat(true);
    
    // Проверка подключения к Supabase
    if (!isSupabaseConfigured) {
      console.warn('⚠️ Supabase не настроен, пропускаем загрузку чата');
      setChatMessages([]);
      setIsLoadingChat(false);
      return;
    }
    
    // Отписываемся от предыдущего канала, если есть
    if (channelRef.current) {
      try {
        await channelRef.current.unsubscribe();
        channelRef.current = null;
      } catch (e) {
        console.warn('Error unsubscribing from previous channel:', e);
      }
    }

    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          user_id,
          text,
          created_at,
          profiles:user_id (
            full_name
          )
        `)
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ Error loading chat messages from Supabase:', error);
        console.error('  Code:', error.code);
        console.error('  Message:', error.message);
        setChatMessages([]);
      } else {
        // Преобразуем данные для корректной типизации
        const messages = (data || []).map((msg: any) => ({
          id: msg.id,
          user_id: msg.user_id,
          text: msg.text,
          created_at: msg.created_at,
          profiles: Array.isArray(msg.profiles) && msg.profiles.length > 0 
            ? msg.profiles[0] 
            : (typeof msg.profiles === 'object' && msg.profiles !== null ? msg.profiles : undefined),
        }));
        setChatMessages(messages);
      }

      // Настраиваем Realtime подписку для мгновенных обновлений
      const channel = supabase
        .channel(`event_messages:${eventId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `event_id=eq.${eventId}`,
          },
          async (payload) => {
            console.log('[Realtime] Новое сообщение:', payload);
            // Перезагружаем сообщения при изменении
            const { data: updatedData } = await supabase
              .from('messages')
              .select(`
                id,
                user_id,
                text,
                created_at,
                profiles:user_id (
                  full_name
                )
              `)
              .eq('event_id', eventId)
              .order('created_at', { ascending: true });
            
            if (updatedData) {
              // Преобразуем данные для корректной типизации
              const messages = updatedData.map((msg: any) => ({
                id: msg.id,
                user_id: msg.user_id,
                text: msg.text,
                created_at: msg.created_at,
                profiles: Array.isArray(msg.profiles) && msg.profiles.length > 0 
                  ? msg.profiles[0] 
                  : (typeof msg.profiles === 'object' && msg.profiles !== null ? msg.profiles : undefined),
              }));
              setChatMessages(messages);
              // Прокрутка вниз при новом сообщении
              setTimeout(() => {
                const chatContainer = document.querySelector('[data-chat-messages]');
                if (chatContainer) {
                  chatContainer.scrollTop = chatContainer.scrollHeight;
                }
              }, 100);
            }
          }
        )
        .subscribe();

      channelRef.current = channel;
    } catch (err) {
      console.error('Failed to load chat messages:', err);
      setChatMessages([]);
    } finally {
      setIsLoadingChat(false);
    }
  };

  // Загрузка личного чата с другом
  const loadDirectChat = async (friendId: number) => {
    setIsLoadingDirectChat(true);
    
    if (!isSupabaseConfigured) {
      console.warn('⚠️ Supabase не настроен, пропускаем загрузку личного чата');
      setDirectMessages([]);
      setIsLoadingDirectChat(false);
      return;
    }

    if (directChatChannelRef.current) {
      try {
        await directChatChannelRef.current.unsubscribe();
        directChatChannelRef.current = null;
      } catch (e) {
        console.warn('Error unsubscribing from previous direct chat channel:', e);
      }
    }

    try {
      const currentUserId = profile.telegramId;
      if (!currentUserId) return;

      // Загружаем сообщения где текущий пользователь либо отправитель, либо получатель
      const { data, error } = await supabase
        .from('direct_messages')
        .select(`
          id,
          sender_id,
          receiver_id,
          text,
          created_at,
          profiles_sender:sender_id (full_name, avatar_url),
          profiles_receiver:receiver_id (full_name, avatar_url)
        `)
        .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ Error loading direct messages from Supabase:', error);
        setDirectMessages([]);
      } else {
        const messages = (data || []).map((msg: any) => ({
          id: msg.id,
          sender_id: msg.sender_id,
          receiver_id: msg.receiver_id,
          text: msg.text,
          created_at: msg.created_at,
          profiles: msg.sender_id === currentUserId 
            ? (Array.isArray(msg.profiles_sender) ? msg.profiles_sender[0] : msg.profiles_sender)
            : (Array.isArray(msg.profiles_receiver) ? msg.profiles_receiver[0] : msg.profiles_receiver),
        }));
        setDirectMessages(messages);
      }

      // Realtime подписка для личных сообщений
      const channel = supabase
        .channel(`direct_messages:${currentUserId}:${friendId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'direct_messages',
            filter: `or(and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId}))`,
          },
          async (payload) => {
            console.log('[Realtime] Новое личное сообщение:', payload);
            const { data: updatedData } = await supabase
              .from('direct_messages')
              .select(`
                id,
                sender_id,
                receiver_id,
                text,
                created_at,
                profiles_sender:sender_id (full_name, avatar_url),
                profiles_receiver:receiver_id (full_name, avatar_url)
              `)
              .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
              .order('created_at', { ascending: true });
            
            if (updatedData) {
              const messages = updatedData.map((msg: any) => ({
                id: msg.id,
                sender_id: msg.sender_id,
                receiver_id: msg.receiver_id,
                text: msg.text,
                created_at: msg.created_at,
                profiles: msg.sender_id === currentUserId 
                  ? (Array.isArray(msg.profiles_sender) ? msg.profiles_sender[0] : msg.profiles_sender)
                  : (Array.isArray(msg.profiles_receiver) ? msg.profiles_receiver[0] : msg.profiles_receiver),
              }));
              setDirectMessages(messages);
              
              // Haptic feedback при получении нового сообщения
              if (window.Telegram?.WebApp?.HapticFeedback) {
                try {
                  window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                } catch (e) {
                  console.warn('Haptic error:', e);
                }
              }
              
              setTimeout(() => {
                const chatContainer = document.querySelector('[data-direct-chat-messages]');
                if (chatContainer) {
                  chatContainer.scrollTop = chatContainer.scrollHeight;
                }
              }, 100);
            }
          }
        )
        .subscribe();

      directChatChannelRef.current = channel;
    } catch (err) {
      console.error('Failed to load direct chat messages:', err);
      setDirectMessages([]);
    } finally {
      setIsLoadingDirectChat(false);
    }
  };

  // Отправка личного сообщения
  const sendDirectMessage = async (friendId: number) => {
    if (!newDirectMessage.trim() || !profile.telegramId) return;

    if (!isSupabaseConfigured) {
      WebApp.showAlert('Ошибка: База данных не настроена');
      return;
    }

    try {
      const { error } = await supabase
        .from('direct_messages')
        .insert({
          sender_id: profile.telegramId,
          receiver_id: friendId,
          text: newDirectMessage.trim(),
          created_at: new Date().toISOString(),
        });

      if (error) {
        console.error('❌ Error sending direct message:', error);
        WebApp.showAlert('Ошибка при отправке сообщения');
      } else {
        setNewDirectMessage('');
        // Перезагружаем сообщения
        await loadDirectChat(friendId);
        
        if (window.Telegram?.WebApp?.HapticFeedback) {
          try {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
          } catch (e) {
            console.warn('Haptic error:', e);
          }
        }
      }
    } catch (err) {
      console.error('Failed to send direct message:', err);
      WebApp.showAlert('Ошибка при отправке сообщения');
    }
  };

  // Глобальный поиск пользователей (для раздела "Найти новых знакомых")
  const searchFriendsGlobal = async (query: string) => {
    if (!query.trim() || !profile.telegramId) {
      setGlobalSearchResults([]);
      return;
    }

    if (!isSupabaseConfigured) {
      return;
    }

    try {
      setIsSearching(true);
      
      // Ищем пользователей по имени или username (глобальный поиск)
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, username')
        .or(`full_name.ilike.%${query}%,username.ilike.%${query}%`)
        .neq('id', profile.telegramId) // Исключаем текущего пользователя
        .limit(20);

      if (error) {
        console.error('❌ Error searching friends globally:', error);
        setGlobalSearchResults([]);
        return;
      }

      // Проверяем, кто уже в друзьях
      const friendIds = friends.map(f => f.id);
      const resultsWithStatus = (data || []).map((user: any) => ({
        id: user.id,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        username: user.username,
        isFriend: friendIds.includes(user.id),
      }));

      setGlobalSearchResults(resultsWithStatus);
    } catch (err) {
      console.error('Failed to search friends globally:', err);
      setGlobalSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Поиск среди текущих друзей (локальный поиск)
  const searchFriendsLocal = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    const friendMatches = friends.filter(friend => 
      (friend.full_name?.toLowerCase().includes(query.toLowerCase()) || 
       friend.username?.toLowerCase().includes(query.toLowerCase()))
    );
    setSearchResults(friendMatches.map(f => ({ ...f, isFriend: true })));
  };

  // Добавление/удаление друга
  const handleToggleFriendship = async (friendId: number) => {
    if (!profile.telegramId) return;

    if (!isSupabaseConfigured) {
      WebApp.showAlert('Ошибка: База данных не настроена');
      return;
    }

    try {
      // Проверяем, есть ли уже дружба
      const { data: existingFriendship } = await supabase
        .from('friendships')
        .select('id')
        .or(`and(user_id.eq.${profile.telegramId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${profile.telegramId})`)
        .single();

      if (existingFriendship) {
        // Удаляем дружбу
        const { error } = await supabase
          .from('friendships')
          .delete()
          .eq('id', existingFriendship.id);

        if (error) {
          console.error('❌ Error removing friendship:', error);
          WebApp.showAlert('Ошибка при удалении друга');
        } else {
          // Обновляем список друзей
          setFriends(prev => prev.filter(f => f.id !== friendId));
          if (window.Telegram?.WebApp?.HapticFeedback) {
            try {
              window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
            } catch (e) {
              console.warn('Haptic error:', e);
            }
          }
        }
      } else {
        // Добавляем дружбу
        const { error } = await supabase
          .from('friendships')
          .insert({
            user_id: profile.telegramId,
            friend_id: friendId,
            created_at: new Date().toISOString(),
          });

        if (error) {
          console.error('❌ Error adding friendship:', error);
          WebApp.showAlert('Ошибка при добавлении друга');
        } else {
          // Перезагружаем список друзей
          const { data: friendProfile } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url, username')
            .eq('id', friendId)
            .single();

          if (friendProfile) {
            setFriends(prev => [...prev, {
              id: friendProfile.id,
              full_name: friendProfile.full_name,
              avatar_url: friendProfile.avatar_url,
              username: friendProfile.username,
              last_seen: null,
              location_lat: null,
              location_lng: null,
              current_event: null,
            }]);
            
            // Отправляем уведомление новому другу
            try {
              await notifyFriendAdded(friendId, profile.firstName || 'Кто-то');
            } catch (err) {
              console.warn('Failed to send friend notification:', err);
            }
          }
          
          if (window.Telegram?.WebApp?.HapticFeedback) {
            try {
              window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
            } catch (e) {
              console.warn('Haptic error:', e);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to toggle friendship:', err);
      WebApp.showAlert('Ошибка при изменении статуса дружбы');
    }
  };

  // Cleanup при закрытии чата или размонтировании
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        try {
          channelRef.current.unsubscribe();
          channelRef.current = null;
        } catch (e) {
          console.warn('Error unsubscribing from channel:', e);
        }
      }
      if (directChatChannelRef.current) {
        try {
          directChatChannelRef.current.unsubscribe();
          directChatChannelRef.current = null;
        } catch (e) {
          console.warn('Error unsubscribing from direct chat channel:', e);
        }
      }
    };
  }, [selectedEventChat, selectedDirectChat]);

  // Отправка сообщения в чат события
  const sendChatMessage = async (eventId: number) => {
    if (!newMessage.trim() || !profile.telegramId || !selectedEventChat) return;

    // Проверка подключения к Supabase
    if (!isSupabaseConfigured) {
      WebApp.showAlert('Ошибка: База данных не настроена');
      return;
    }

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          event_id: eventId,
          user_id: profile.telegramId,
          text: newMessage.trim(),
          created_at: new Date().toISOString(),
        });

      if (error) {
        console.error('❌ Error sending message to Supabase:', error);
        console.error('  Code:', error.code);
        console.error('  Message:', error.message);
        
        let errorMessage = 'Ошибка при отправке сообщения';
        if (error.code === '23503') {
          errorMessage = 'Ошибка: Пользователь или событие не найдены';
        } else if (error.code === '42501') {
          errorMessage = 'Ошибка: Нет доступа к базе данных';
        }
        
        WebApp.showAlert(errorMessage);
      } else {
        setNewMessage('');
        // Realtime подписка автоматически обновит сообщения
        // Но для надежности перезагружаем
        await loadEventChat(eventId);
        
        // Прокрутка вниз при новом сообщении
        setTimeout(() => {
          const chatContainer = document.querySelector('[data-chat-messages]');
          if (chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
          }
        }, 150);
        
        if (window.Telegram?.WebApp?.HapticFeedback) {
          try {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
          } catch (e) {
            console.warn('Haptic error:', e);
          }
        }
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      WebApp.showAlert('Ошибка при отправке сообщения');
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !profile.telegramId) return;

    // Проверка подключения к Supabase
    if (!isSupabaseConfigured) {
      WebApp.showAlert('Ошибка: База данных не настроена');
      return;
    }

    // Проверяем размер файла (макс 5MB)
    if (file.size > 5 * 1024 * 1024) {
      WebApp.showAlert('Размер файла не должен превышать 5MB');
      return;
    }

    setIsUploadingAvatar(true);

    try {
      // Генерируем уникальное имя файла
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.telegramId}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // 1. Загружаем файл в Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        console.error('❌ Error uploading avatar to Supabase Storage:', uploadError);
        console.error('  Message:', uploadError.message);
        
        let errorMessage = 'Ошибка при загрузке фото';
        if (uploadError.message?.includes('Bucket') || uploadError.message?.includes('bucket')) {
          errorMessage = 'Ошибка: Бакет "avatars" не найден. Создайте его в Supabase Storage.';
        } else if (uploadError.message?.includes('permission') || uploadError.message?.includes('access')) {
          errorMessage = 'Ошибка: Нет доступа к хранилищу. Проверьте настройки RLS.';
        }
        
        WebApp.showAlert(errorMessage);
        setIsUploadingAvatar(false);
        return;
      }

      // 2. Получаем публичный URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const avatarUrl = urlData.publicUrl;

      // 3. Обновляем профиль с новым URL
      setProfile(prev => ({ ...prev, photoUrl: avatarUrl }));

      // 4. Обновляем строку в таблице profiles
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({
          id: profile.telegramId,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id',
        });

      if (updateError) {
        console.error('❌ Error updating profile with avatar in Supabase:', updateError);
        console.error('  Code:', updateError.code);
        console.error('  Message:', updateError.message);
        
        let errorMessage = 'Ошибка при сохранении фото';
        if (updateError.code === '23503') {
          errorMessage = 'Ошибка: Пользователь не найден';
        } else if (updateError.code === '42501') {
          errorMessage = 'Ошибка: Нет доступа к базе данных';
        }
        
        WebApp.showAlert(errorMessage);
      } else {
        console.log('✅ Avatar uploaded and profile updated successfully');
        WebApp.showAlert('Фото успешно загружено!');
        if (window.Telegram?.WebApp?.HapticFeedback) {
          try {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
          } catch (e) {
            console.warn('Haptic error:', e);
          }
        }
      }
    } catch (err) {
      console.error('Failed to upload avatar:', err);
      WebApp.showAlert('Ошибка при загрузке фото');
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const initials =
    (profile.firstName?.[0] || profile.username?.[0] || 'L').toUpperCase();

  return (
    <div className="min-h-screen w-full bg-[#020016] text-white flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-sm">
        {/* Glowing gradient border card */}
        <div className="relative rounded-3xl p-[1px] bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 shadow-[0_0_50px_rgba(129,140,248,0.55)]">
          <div className="relative rounded-[1.4rem] bg-black/85 backdrop-blur-xl px-6 py-7 flex flex-col gap-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-white/40">PROFILE</p>
                <h1 className="mt-1 text-2xl font-light tracking-wide">LINGER</h1>
              </div>
              <span className="inline-flex h-8 items-center rounded-full border border-white/10 px-3 text-[10px] uppercase tracking-[0.2em] text-white/50">
                Mini App
              </span>
            </div>

            {/* Avatar + main info */}
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 shrink-0">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 blur-md opacity-60" />
                <button
                  onClick={handleAvatarClick}
                  disabled={!profile.photoUrl}
                  className={`relative flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-black/80 overflow-hidden ${
                    profile.photoUrl ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
                  }`}
                >
                  {profile.photoUrl ? (
                    <img
                      src={profile.photoUrl}
                      alt={profile.firstName || profile.username || 'User avatar'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xl font-medium text-white/80">
                      {initials}
                    </span>
                  )}
                </button>
                {/* Кнопка изменения фото */}
                <button
                  onClick={handleChangePhoto}
                  disabled={isUploadingAvatar}
                  className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 border-2 border-black flex items-center justify-center hover:scale-110 transition-transform disabled:opacity-50"
                  title="Изменить фото"
                >
                  {isUploadingAvatar ? (
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M6 2v8M2 6h8" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  )}
                </button>
                </div>
              {/* Скрытый input для выбора файла */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-medium">
                  {profile.firstName || 'Guest' }
                </p>
                {profile.username && (
                  <p className="truncate text-sm text-white/50">@{profile.username}</p>
                )}
                {!profile.username && (
                  <p className="text-xs text-white/40">
                    Telegram username will appear here
                  </p>
                )}
              </div>
            </div>

            {/* Рейтинг Чуни */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl glass-card">
              <Sparkles size={18} className="text-purple-400" />
              <span className="text-sm font-medium text-white/90">
                {(() => {
                  const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                  return isRussian ? `Мои Чуни: ${chuniRating}` : `My Chuni: ${chuniRating}`;
                })()}
              </span>
            </div>

            {/* Bio */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium tracking-[0.2em] text-white/50 uppercase">
                  Bio
                </p>
                <span className="text-[10px] text-white/40">Share your vibe</span>
              </div>

              <textarea
                value={profile.bio}
                onChange={handleBioChange}
                placeholder="Tell people what you are looking for in LINGER…"
                className="w-full rounded-2xl bg-white/5 border border-indigo-400/40 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/40 text-sm text-white placeholder:text-white/35 resize-none min-h-[96px] px-3.5 py-3 leading-relaxed"
              />
            </div>

            {/* Save button */}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="mt-1 w-full rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 py-3 text-sm font-semibold tracking-wide text-white shadow-lg shadow-purple-500/30 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>

            {/* Footnote */}
            <p className="mt-1 text-[10px] text-center text-white/40 leading-snug">
              Your profile is saved to Supabase database.
            </p>

            {/* Раздел Друзья */}
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium tracking-[0.2em] text-white/50 uppercase">
                  {(() => {
                    const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                    return isRussian ? 'Друзья' : 'Friends';
                  })()}
                </p>
                <div className="flex items-center gap-2">
                  {friends.length > 0 && (
                    <span className="text-[10px] text-white/40">
                      {friends.length}
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setIsFriendsModalOpen(true);
                      if (window.Telegram?.WebApp?.HapticFeedback) {
                        try {
                          window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                        } catch (e) {
                          console.warn('Haptic error:', e);
                        }
                      }
                    }}
                    className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    {(() => {
                      const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                      return isRussian ? 'Все →' : 'All →';
                    })()}
                  </button>
                </div>
              </div>

              {isLoadingFriends ? (
                <div className="text-center py-4 text-white/40 text-xs">
                  {(() => {
                    const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                    return isRussian ? 'Загрузка...' : 'Loading...';
                  })()}
                </div>
              ) : friends.length === 0 ? (
                <div className="text-center py-4 text-white/40 text-xs">
                  {(() => {
                    const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                    return isRussian ? 'Пока нет друзей' : 'No friends yet';
                  })()}
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {friends.map((friend) => (
                    <motion.div
                      key={friend.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center gap-2 cursor-pointer group"
                      onClick={() => {
                        setSelectedDirectChat(friend.id);
                        loadDirectChat(friend.id);
                        if (window.Telegram?.WebApp?.HapticFeedback) {
                          try {
                            window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                          } catch (e) {
                            console.warn('Haptic error:', e);
                          }
                        }
                      }}
                    >
                      <div className="relative">
                        {friend.avatar_url ? (
                          <img 
                            src={friend.avatar_url} 
                            alt={friend.full_name || 'Friend'}
                            className="w-12 h-12 rounded-full object-cover border-2 border-white/20 group-hover:border-purple-400/50 transition-colors"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 flex items-center justify-center text-white text-sm font-bold">
                            {(friend.full_name || friend.username || 'F')[0].toUpperCase()}
                          </div>
                        )}
                        
                        {/* Индикатор онлайна или события */}
                        {(() => {
                          // Проверка, находится ли друг на событии
                          if (friend.current_event) {
                            return (
                              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white border-2 border-black flex items-center justify-center text-xs">
                                {friend.current_event.icon || '📍'}
                              </div>
                            );
                          }
                          
                          // Проверка онлайна (last_seen менее 5 минут назад)
                          if (friend.last_seen) {
                            const lastSeenDate = new Date(friend.last_seen);
                            const now = new Date();
                            const diffMs = now.getTime() - lastSeenDate.getTime();
                            const diffMins = Math.floor(diffMs / 60000);
                            const isOnline = diffMins < 5;
                            
                            return (
                              <div 
                                className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-black ${
                                  isOnline ? 'bg-green-500' : 'bg-gray-500'
                                }`}
                                title={isOnline ? 'Онлайн' : `Был(а) ${diffMins} мин назад`}
                              />
                            );
                          }
                          
                          // Если нет данных о last_seen, показываем серый индикатор
                          return (
                            <div 
                              className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-black bg-gray-500"
                              title="Статус неизвестен"
                            />
                          );
                        })()}
                      </div>
                      <span className="text-[10px] text-white/70 text-center max-w-[60px] truncate">
                        {friend.full_name || friend.username || 'Friend'}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Ближайшие события */}
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium tracking-[0.2em] text-white/50 uppercase">
                  {(() => {
                    const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                    return isRussian ? 'Ближайшие события' : 'Nearest Events';
                  })()}
                </p>
                {myImpulses.length > 0 && (
                  <span className="text-[10px] text-white/40">
                    {myImpulses.length}
                  </span>
                )}
              </div>

              {isLoadingImpulses ? (
                <div className="text-center py-4 text-white/40 text-xs">
                  {(() => {
                    const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                    return isRussian ? 'Загрузка...' : 'Loading...';
                  })()}
                </div>
              ) : myImpulses.length === 0 ? (
                <div className="text-center py-4 text-white/40 text-xs">
                  {(() => {
                    const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                    return isRussian ? 'Пока нет записей' : 'No messages yet';
                  })()}
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  <AnimatePresence>
                    {myImpulses.map((impulse) => (
                      <motion.div
                        key={impulse.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        onClick={() => {
                          // При клике на событие открываем чат
                          setSelectedEventChat(impulse);
                          loadEventChat(impulse.id);
                          if (window.Telegram?.WebApp?.HapticFeedback) {
                            try {
                              window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                            } catch (e) {
                              console.warn('Haptic error:', e);
                            }
                          }
                        }}
                        className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-start justify-between gap-3 cursor-pointer hover:bg-white/10 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] text-white/40 px-2 py-0.5 bg-white/5 rounded-full">
                              {impulse.category}
                            </span>
                            {impulse.distance !== undefined && (
                              <span className="text-[10px] text-white/40">
                                {(() => {
                                  const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                                  if (impulse.distance! < 1) {
                                    return isRussian ? `${Math.round(impulse.distance! * 1000)} м` : `${Math.round(impulse.distance! * 1000)} m`;
                                  }
                                  return isRussian ? `${impulse.distance!.toFixed(1)} км` : `${impulse.distance!.toFixed(1)} km`;
                                })()}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-white/70 leading-relaxed mb-1.5">
                            <span className="font-semibold text-purple-400">{impulse.category}:</span> {impulse.content}
                          </p>
                          {/* Опубликовано X назад */}
                          <div className="flex items-center gap-1 text-[10px] text-white/40 mb-1">
                              <Clock size={10} />
                            <span>
                              {(() => {
                                const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                                return isRussian ? `Опубликовано ${formatRelativeTime(impulse.created_at)}` : `Published ${formatRelativeTime(impulse.created_at)}`;
                              })()}
                            </span>
                            </div>
                          {/* Начало: Дата в Время */}
                          {impulse.event_date && impulse.event_time && (
                            <div className="flex items-center gap-1 text-[10px] text-white/50 mb-1">
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1"/>
                                <path d="M6 3v3l2 1" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                              </svg>
                              <span>{formatEventDateTime(impulse.event_date, impulse.event_time)}</span>
                          </div>
                          )}
                          {/* Адрес */}
                          {impulse.address && (
                            <div className="flex items-center gap-1 text-[11px] text-[#888]">
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                <path d="M6 1C4.34 1 3 2.34 3 4c0 2.5 3 6 3 6s3-3.5 3-6c0-1.66-1.34-3-3-3z" stroke="currentColor" strokeWidth="1" fill="none"/>
                                <circle cx="6" cy="4" r="1" fill="currentColor"/>
                              </svg>
                              <span className="truncate">{impulse.address}</span>
                        </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                        <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEventChat(impulse);
                              loadEventChat(impulse.id);
                              if (window.Telegram?.WebApp?.HapticFeedback) {
                                try {
                                  window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                                } catch (e) {
                                  console.warn('Haptic error:', e);
                                }
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 text-white text-[10px] font-semibold hover:opacity-90 transition-opacity whitespace-nowrap shadow-lg shadow-purple-500/30"
                          >
                            💬 Чат
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteImpulse(impulse.id);
                              if (window.Telegram?.WebApp?.HapticFeedback) {
                                try {
                                  window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                                } catch (e) {
                                  console.warn('Haptic error:', e);
                                }
                              }
                            }}
                          disabled={deletingIds.has(impulse.id)}
                          className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Trash2 
                              size={12} 
                            className="text-white/40 hover:text-red-400 transition-colors" 
                          />
                        </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Модальное окно для просмотра аватара на весь экран (Full-screen) */}
      <AnimatePresence>
        {avatarModalOpen && profile.photoUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAvatarModalOpen(false)}
            className="fixed inset-0 bg-black z-[2000] flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full h-full flex items-center justify-center p-4"
            >
              <img
                src={profile.photoUrl}
                alt={profile.firstName || profile.username || 'User avatar'}
                className="max-w-full max-h-full object-contain"
              />
              <button
                onClick={() => setAvatarModalOpen(false)}
                className="absolute top-4 right-4 p-3 bg-black/80 backdrop-blur-md rounded-full hover:bg-black/90 transition-colors z-10"
              >
                <X size={24} className="text-white" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Модальное окно личного чата */}
      <AnimatePresence>
        {selectedDirectChat && (() => {
          const friend = friends.find(f => f.id === selectedDirectChat);
          if (!friend) return null;
          
          return (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setSelectedDirectChat(null);
                  setDirectMessages([]);
                  setNewDirectMessage('');
                }}
                className="fixed inset-0 z-[2000]"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                }}
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
                <div className="flex items-center gap-3 mb-4">
                  {friend.avatar_url ? (
                    <img 
                      src={friend.avatar_url} 
                      alt={friend.full_name || 'Friend'}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 flex items-center justify-center text-white text-sm font-bold">
                      {(friend.full_name || friend.username || 'F')[0].toUpperCase()}
    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white truncate">
                      {friend.full_name || friend.username || 'Friend'}
                    </h3>
                    {friend.username && (
                      <p className="text-xs text-white/50">@{friend.username}</p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setSelectedDirectChat(null);
                      setDirectMessages([]);
                      setNewDirectMessage('');
                    }}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <X size={20} className="text-white/60" />
                  </button>
                </div>

                {/* Сообщения */}
                <div 
                  data-direct-chat-messages
                  className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-[200px] max-h-[400px]"
                >
                  {isLoadingDirectChat ? (
                    <div className="text-center py-8 text-white/40 text-sm">
                      {(() => {
                        const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                        return isRussian ? 'Загрузка...' : 'Loading...';
                      })()}
                    </div>
                  ) : directMessages.length === 0 ? (
                    <div className="text-center py-8 text-white/40 text-sm">
                      {(() => {
                        const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                        return isRussian ? 'Пока нет сообщений' : 'No messages yet';
                      })()}
                    </div>
                  ) : (
                    directMessages.map((msg) => {
                      const isMyMessage = msg.sender_id === profile.telegramId;
                      return (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                              isMyMessage
                                ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 text-white'
                                : 'bg-white/10 text-white/90'
                            }`}
                          >
                            <p className="text-sm leading-relaxed">{msg.text}</p>
                            <p className={`text-[10px] mt-1 ${isMyMessage ? 'text-white/70' : 'text-white/50'}`}>
                              {formatTime(msg.created_at)}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </div>

                {/* Поле ввода */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDirectMessage}
                    onChange={(e) => setNewDirectMessage(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendDirectMessage(selectedDirectChat);
                      }
                    }}
                    placeholder={(() => {
                      const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                      return isRussian ? 'Написать сообщение...' : 'Type a message...';
                    })()}
                    className="flex-1 rounded-2xl bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 text-sm text-white placeholder:text-white/35 px-4 py-3"
                  />
                  <button
                    onClick={() => sendDirectMessage(selectedDirectChat)}
                    disabled={!newDirectMessage.trim()}
                    className="px-4 py-3 rounded-2xl gradient-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {(() => {
                      const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                      return isRussian ? 'Отправить' : 'Send';
                    })()}
                  </button>
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

      {/* Модальное окно чата события */}
      <AnimatePresence>
        {selectedEventChat && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
                  onClick={() => {
                    // Отписываемся от канала при закрытии
                    if (channelRef.current) {
                      try {
                        channelRef.current.unsubscribe();
                        channelRef.current = null;
                      } catch (e) {
                        console.warn('Error unsubscribing from channel:', e);
                      }
                    }
                    setSelectedEventChat(null);
                    setChatMessages([]);
                    setNewMessage('');
                  }}
                  className="fixed inset-0 z-[2000]"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                  }}
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
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white truncate mb-1">
                      {selectedEventChat.category}: {selectedEventChat.content.substring(0, 40)}...
                    </h3>
                    {selectedEventChat.address && (
                      <p className="text-xs text-white/50 mt-1 truncate flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M6 1C4.34 1 3 2.34 3 4c0 2.5 3 6 3 6s3-3.5 3-6c0-1.66-1.34-3-3-3z" stroke="currentColor" strokeWidth="1" fill="none"/>
                          <circle cx="6" cy="4" r="1" fill="currentColor"/>
                        </svg>
                        {selectedEventChat.address}
                      </p>
                    )}
                    <p className="text-xs text-white/50 mt-1 flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1"/>
                        <path d="M6 3v3l2 1" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                      </svg>
                      {formatRelativeTime(selectedEventChat.created_at)}
                    </p>
                  </div>
                <button
                  onClick={() => {
                    // Отписываемся от канала при закрытии
                    if (channelRef.current) {
                      try {
                        channelRef.current.unsubscribe();
                        channelRef.current = null;
                      } catch (e) {
                        console.warn('Error unsubscribing from channel:', e);
                      }
                    }
                    setSelectedEventChat(null);
                    setChatMessages([]);
                    setNewMessage('');
                  }}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors ml-2"
                >
                  <X size={20} className="text-white/60" />
                </button>
              </div>

              {/* Область сообщений */}
              <div 
                data-chat-messages
                className="flex-1 overflow-y-auto mb-4 space-y-3 min-h-[200px] max-h-[300px] pr-2"
              >
                {isLoadingChat ? (
                  <div className="text-center py-8 text-white/40 text-sm">
                    {(() => {
                      const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                      return isRussian ? 'Загрузка сообщений...' : 'Loading messages...';
                    })()}
                  </div>
                ) : chatMessages.length === 0 ? (
                  <div className="text-center py-8 text-white/40 text-sm">
                    {(() => {
                      const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                      return isRussian ? 'Пока нет сообщений. Будьте первым!' : 'No messages yet. Be the first!';
                    })()}
                  </div>
                ) : (
                  chatMessages.map((message) => {
                    const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                    return (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-3 rounded-xl ${
                          message.user_id === profile.telegramId
                            ? 'bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-fuchsia-500/20 ml-auto max-w-[80%]'
                            : 'bg-white/5 max-w-[80%]'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-white">
                            {message.profiles?.full_name || (message.user_id === profile.telegramId ? profile.firstName : (isRussian ? 'Пользователь' : 'User'))}
                          </span>
                          <span className="text-[10px] text-white/40">
                            {formatTime(message.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-white/90 leading-relaxed break-words">{message.text}</p>
                      </motion.div>
                    );
                  })
                )}
              </div>

              {/* Поле ввода сообщения */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && newMessage.trim() && selectedEventChat) {
                      sendChatMessage(selectedEventChat.id);
                    }
                  }}
                  placeholder={(() => {
                    const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                    return isRussian ? 'Написать сообщение...' : 'Write a message...';
                  })()}
                  className="flex-1 rounded-2xl bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 text-sm text-white placeholder:text-white/35 px-4 py-3"
                  autoFocus
                />
                <button
                  onClick={() => {
                    if (selectedEventChat) {
                      sendChatMessage(selectedEventChat.id);
                    }
                  }}
                  disabled={!newMessage.trim() || !selectedEventChat}
                  className="px-4 py-3 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 text-white font-semibold shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M18 2L9 11M18 2l-7 7M18 2H12l7 7v-6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Модальное окно поиска друзей */}
      <AnimatePresence>
        {isSearchFriendsOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSearchFriendsOpen(false)}
              className="fixed inset-0 z-[2000]"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-black/90 backdrop-blur-xl border border-white/20 rounded-3xl p-6 z-[2001] max-w-md mx-auto max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  {(() => {
                    const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                    return isRussian ? 'Поиск друзей' : 'Search Friends';
                  })()}
                </h3>
                <button
                  onClick={() => {
                    setIsSearchFriendsOpen(false);
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X size={20} className="text-white/70" />
                </button>
              </div>

              {/* Поле поиска */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    searchFriends(e.target.value);
                  }}
                  placeholder={(() => {
                    const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                    return isRussian ? 'Поиск по имени или username...' : 'Search by name or username...';
                  })()}
                  className="w-full rounded-xl bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 text-sm text-white placeholder:text-white/35 px-10 py-3"
                  autoFocus
                />
              </div>

              {/* Результаты поиска */}
              <div className="flex-1 overflow-y-auto space-y-2">
                {isSearching ? (
                  <div className="text-center py-8 text-white/40 text-sm">
                    {(() => {
                      const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                      return isRussian ? 'Поиск...' : 'Searching...';
                    })()}
                  </div>
                ) : searchResults.length === 0 && searchQuery.trim() ? (
                  <div className="text-center py-8 text-white/40 text-sm">
                    {(() => {
                      const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                      return isRussian ? 'Ничего не найдено' : 'No results found';
                    })()}
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((user) => (
                    <motion.div
                      key={user.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                    >
                      <div className="relative">
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt={user.full_name || user.username || 'User'}
                            className="w-12 h-12 rounded-full object-cover border-2 border-white/20"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 flex items-center justify-center text-white text-sm font-bold">
                            {(user.full_name || user.username || 'U')[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {user.full_name || user.username || 'User'}
                        </p>
                        {user.username && user.full_name && (
                          <p className="text-xs text-white/50 truncate">@{user.username}</p>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          await handleToggleFriendship(user.id);
                          // Обновляем статус в результатах поиска
                          setSearchResults(prev => prev.map(u => 
                            u.id === user.id ? { ...u, isFriend: !u.isFriend } : u
                          ));
                          // Перезагружаем список друзей
                          const loadFriends = async () => {
                            if (!profile.telegramId) return;
                            if (!isSupabaseConfigured) return;
                            try {
                              const { data, error } = await supabase
                                .from('friendships')
                                .select(`
                                  id,
                                  user_id,
                                  friend_id,
                                  profiles_user:user_id (id, full_name, avatar_url, username),
                                  profiles_friend:friend_id (id, full_name, avatar_url, username)
                                `)
                                .or(`user_id.eq.${profile.telegramId},friend_id.eq.${profile.telegramId}`);
                              if (!error && data) {
                                const friendsList = (data || []).map((friendship: any) => {
                                  const friendProfile = friendship.user_id === profile.telegramId 
                                    ? friendship.profiles_friend 
                                    : friendship.profiles_user;
                                  return {
                                    id: friendProfile?.id || (friendship.user_id === profile.telegramId ? friendship.friend_id : friendship.user_id),
                                    full_name: friendProfile?.full_name,
                                    avatar_url: friendProfile?.avatar_url,
                                    username: friendProfile?.username,
                                  };
                                }).filter((f: any) => f.id);
                                setFriends(friendsList);
                              }
                            } catch (err) {
                              console.error('Failed to reload friends:', err);
                            }
                          };
                          loadFriends();
                        }}
                        className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                          user.isFriend
                            ? 'bg-white/10 text-white/70 hover:bg-white/20'
                            : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 text-white hover:opacity-90'
                        }`}
                      >
                        {user.isFriend ? (
                          <>
                            <UserMinus size={14} className="inline mr-1" />
                            {(() => {
                              const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                              return isRussian ? 'Удалить' : 'Remove';
                            })()}
                          </>
                        ) : (
                          <>
                            <UserPlus size={14} className="inline mr-1" />
                            {(() => {
                              const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                              return isRussian ? 'Добавить' : 'Add';
                            })()}
                          </>
                        )}
                      </button>
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-8 text-white/40 text-sm">
                    {(() => {
                      const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                      return isRussian ? 'Введите имя или username для поиска' : 'Enter name or username to search';
                    })()}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Модальное окно списка друзей с умным поиском */}
      <AnimatePresence>
        {isFriendsModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsFriendsModalOpen(false);
                setSearchQuery('');
                setSearchResults([]);
                setGlobalSearchResults([]);
              }}
              className="fixed inset-0 z-[2000]"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
            />
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              onClick={(e) => e.stopPropagation()}
              className="fixed inset-x-4 bottom-4 border border-white/20 rounded-3xl p-6 z-[2001] max-w-md mx-auto max-h-[80vh] flex flex-col"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  {(() => {
                    const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                    return isRussian ? 'Друзья' : 'Friends';
                  })()}
                </h3>
                <button
                  onClick={() => {
                    setIsFriendsModalOpen(false);
                    setSearchQuery('');
                    setSearchResults([]);
                    setGlobalSearchResults([]);
                  }}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X size={20} className="text-white/70" />
                </button>
              </div>

              {/* Поле поиска */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    const query = e.target.value;
                    setSearchQuery(query);
                    // Умный поиск: сначала друзья, потом глобальный
                    if (query.trim().length >= 2) {
                      // Поиск среди друзей (локальный)
                      searchFriendsLocal(query);
                      
                      // Глобальный поиск
                      searchFriendsGlobal(query);
                    } else {
                      setSearchResults([]);
                      setGlobalSearchResults([]);
                    }
                  }}
                  placeholder={(() => {
                    const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                    return isRussian ? 'Поиск по имени или username...' : 'Search by name or username...';
                  })()}
                  className="w-full rounded-xl bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 text-sm text-white placeholder:text-white/35 px-10 py-3"
                  autoFocus
                />
              </div>

              {/* Результаты: сначала друзья, потом глобальный поиск */}
              <div className="flex-1 overflow-y-auto space-y-4">
                {/* Раздел: Совпадения из друзей */}
                {searchQuery.trim().length >= 2 && searchResults.length > 0 && (
                  <div>
                    <p className="text-xs text-white/50 uppercase tracking-wider mb-2 px-1">
                      {(() => {
                        const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                        return isRussian ? 'Друзья' : 'Friends';
                      })()}
                    </p>
                    {searchResults.map((user) => (
                      <motion.div
                        key={user.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors mb-2"
                      >
                        <div className="relative">
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              alt={user.full_name || user.username || 'User'}
                              className="w-12 h-12 rounded-full object-cover border-2 border-white/20"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 flex items-center justify-center text-white text-sm font-bold">
                              {(user.full_name || user.username || 'U')[0].toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {user.full_name || user.username || 'User'}
                          </p>
                          {user.username && user.full_name && (
                            <p className="text-xs text-white/50 truncate">@{user.username}</p>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setSelectedDirectChat(user.id);
                            loadDirectChat(user.id);
                            setIsFriendsModalOpen(false);
                            if (window.Telegram?.WebApp?.HapticFeedback) {
                              try {
                                window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                              } catch (e) {
                                console.warn('Haptic error:', e);
                              }
                            }
                          }}
                          className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 text-white text-xs font-semibold hover:opacity-90 transition-opacity"
                        >
                          {(() => {
                            const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                            return isRussian ? 'Написать' : 'Message';
                          })()}
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* Раздел: Найти новых знакомых */}
                {searchQuery.trim().length >= 2 && (
                  <div>
                    <p className="text-xs text-white/50 uppercase tracking-wider mb-2 px-1">
                      {(() => {
                        const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                        return isRussian ? 'Найти новых знакомых' : 'Find New Friends';
                      })()}
                    </p>
                    {isSearching ? (
                      <div className="text-center py-4 text-white/40 text-sm">
                        {(() => {
                          const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                          return isRussian ? 'Поиск...' : 'Searching...';
                        })()}
                      </div>
                    ) : globalSearchResults.length > 0 ? (
                      globalSearchResults.map((user) => (
                        <motion.div
                          key={user.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors mb-2"
                        >
                          <div className="relative">
                            {user.avatar_url ? (
                              <img
                                src={user.avatar_url}
                                alt={user.full_name || user.username || 'User'}
                                className="w-12 h-12 rounded-full object-cover border-2 border-white/20"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 flex items-center justify-center text-white text-sm font-bold">
                                {(user.full_name || user.username || 'U')[0].toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                              {user.full_name || user.username || 'User'}
                            </p>
                            {user.username && user.full_name && (
                              <p className="text-xs text-white/50 truncate">@{user.username}</p>
                            )}
                          </div>
                          <button
                            onClick={async () => {
                              if (!profile.telegramId) return;
                              
                              if (user.isFriend) {
                                // Удалить друга
                                const { error } = await supabase
                                  .from('friendships')
                                  .delete()
                                  .or(`and(user_id.eq.${profile.telegramId},friend_id.eq.${user.id}),and(user_id.eq.${user.id},friend_id.eq.${profile.telegramId})`);
                                
                                if (!error) {
                                  setFriends(friends.filter(f => f.id !== user.id));
                                  setGlobalSearchResults(globalSearchResults.map(u => u.id === user.id ? { ...u, isFriend: false } : u));
                                }
                              } else {
                                // Добавить друга
                                const { error } = await supabase
                                  .from('friendships')
                                  .insert([{ user_id: profile.telegramId, friend_id: user.id }]);
                                
                                if (!error) {
                                  setFriends([...friends, { id: user.id, full_name: user.full_name, avatar_url: user.avatar_url, username: user.username }]);
                                  setGlobalSearchResults(globalSearchResults.map(u => u.id === user.id ? { ...u, isFriend: true } : u));
                                }
                              }
                              
                              if (window.Telegram?.WebApp?.HapticFeedback) {
                                try {
                                  window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                                } catch (e) {
                                  console.warn('Haptic error:', e);
                                }
                              }
                            }}
                            className={`px-4 py-2 rounded-lg text-white text-xs font-semibold hover:opacity-90 transition-opacity ${
                              user.isFriend 
                                ? 'bg-red-500/20 border border-red-500/50 text-red-300'
                                : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500'
                            }`}
                          >
                            {user.isFriend ? (
                              <>
                                <UserMinus size={14} className="inline mr-1" />
                                {(() => {
                                  const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                                  return isRussian ? 'Удалить' : 'Remove';
                                })()}
                              </>
                            ) : (
                              <>
                                <UserPlus size={14} className="inline mr-1" />
                                {(() => {
                                  const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                                  return isRussian ? 'Добавить' : 'Add';
                                })()}
                              </>
                            )}
                          </button>
                        </motion.div>
                      ))
                    ) : searchQuery.trim().length >= 2 ? (
                      <div className="text-center py-4 text-white/40 text-sm">
                        {(() => {
                          const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                          return isRussian ? 'Ничего не найдено' : 'No results found';
                        })()}
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Список всех друзей (если поиск пустой) */}
                {!searchQuery.trim() && friends.length > 0 && (
                  <div>
                    <p className="text-xs text-white/50 uppercase tracking-wider mb-2 px-1">
                      {(() => {
                        const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                        return isRussian ? 'Все друзья' : 'All Friends';
                      })()}
                    </p>
                    {friends.map((friend) => (
                      <motion.div
                        key={friend.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors mb-2 cursor-pointer"
                        onClick={() => {
                          setSelectedDirectChat(friend.id);
                          loadDirectChat(friend.id);
                          setIsFriendsModalOpen(false);
                          if (window.Telegram?.WebApp?.HapticFeedback) {
                            try {
                              window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                            } catch (e) {
                              console.warn('Haptic error:', e);
                            }
                          }
                        }}
                      >
                        <div className="relative">
                          {friend.avatar_url ? (
                            <img
                              src={friend.avatar_url}
                              alt={friend.full_name || friend.username || 'Friend'}
                              className="w-12 h-12 rounded-full object-cover border-2 border-white/20"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 flex items-center justify-center text-white text-sm font-bold">
                              {(friend.full_name || friend.username || 'F')[0].toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {friend.full_name || friend.username || 'Friend'}
                          </p>
                          {friend.username && friend.full_name && (
                            <p className="text-xs text-white/50 truncate">@{friend.username}</p>
                          )}
                        </div>
                        <MessageCircle size={18} className="text-white/40" />
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Profile;
