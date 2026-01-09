import React, { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured, checkSupabaseConnection } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Clock, X } from 'lucide-react';
import WebApp from '@twa-dev/sdk';

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
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [selectedEventChat, setSelectedEventChat] = useState<MyImpulse | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ id: number; user_id: number; text: string; created_at: string; profiles?: { full_name?: string } }>>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [fireRating, setFireRating] = useState<number>(0); // Рейтинг огоньков
  const channelRef = React.useRef<any>(null);

  // Загрузка профиля из базы данных
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

  // Форматирование даты и времени для событий
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const eventDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;

    if (eventDate.getTime() === today.getTime()) {
      // Сегодня
      return isRussian 
        ? `Сегодня в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
        : `Today at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      // Другая дата
      return isRussian
        ? `${date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
        : `${date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    }
  };

  useEffect(() => {
    const loadMyImpulses = async () => {
      if (!profile.telegramId) return;

      if (!isSupabaseConfigured) {
        console.warn('⚠️ Supabase не настроен, пропускаем загрузку моих импульсов');
        setIsLoadingImpulses(false);
        return;
      }

      try {
        setIsLoadingImpulses(true);
        const { data, error } = await supabase
          .from('impulses')
          .select('id, content, category, created_at, location_lat, location_lng')
          .eq('creator_id', profile.telegramId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('❌ Error loading my impulses from Supabase:', error);
          console.error('  Code:', error.code);
          console.error('  Message:', error.message);
          setMyImpulses([]);
        } else {
          // Загружаем адреса для событий с координатами (асинхронно, не блокируя отображение)
          const impulsesWithAddresses = await Promise.all(
            (data || []).map(async (impulse) => {
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
          // Рейтинг огоньков = количество созданных событий
          setFireRating(impulsesWithAddresses.length);
        }
      } catch (err) {
        console.error('Failed to load my impulses:', err);
      } finally {
        setIsLoadingImpulses(false);
      }
    };

    loadMyImpulses();
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
    };
  }, [selectedEventChat]);

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

            {/* Рейтинг огоньков */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl glass-card">
              <span className="text-lg">🔥</span>
              <span className="text-sm font-medium text-white/90">
                {fireRating} {fireRating === 1 ? (window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' ? 'Огонек' : 'Fire') : (window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' ? 'Огоньков' : 'Fires')}
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

            {/* Мои записи */}
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium tracking-[0.2em] text-white/50 uppercase">
                  {(() => {
                    const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                    return isRussian ? 'Мои записи' : 'My Messages';
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
                            <div className="flex items-center gap-1 text-[10px] text-white/30">
                              <Clock size={10} />
                              <span>{formatTime(impulse.created_at)}</span>
                            </div>
                          </div>
                          <p className="text-xs text-white/70 leading-relaxed mb-1.5">
                            <span className="font-semibold text-purple-400">{impulse.category}:</span> {impulse.content}
                          </p>
                          {/* Адрес и время в одну компактную строку */}
                          <div className="flex items-center gap-2 text-[11px] text-[#888]">
                            {impulse.address && (
                              <span className="truncate">{impulse.address}</span>
                            )}
                            {impulse.event_date && impulse.event_time && (
                              <span className="flex-shrink-0">
                                {(() => {
                                  const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;
                                  const eventDate = new Date(impulse.event_date);
                                  const today = new Date();
                                  const isToday = eventDate.toDateString() === today.toDateString();
                                  
                                  if (isToday) {
                                    return isRussian ? `Сегодня ${impulse.event_time}` : `Today ${impulse.event_time}`;
                                  } else {
                                    return isRussian
                                      ? `${eventDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${impulse.event_time}`
                                      : `${eventDate.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} ${impulse.event_time}`;
                                  }
                                })()}
                              </span>
                            )}
                          </div>
                          {/* Старый блок адреса - удален */}
                          {false && impulse.address && (
                            <div className="flex items-center gap-1 text-[10px] text-white/50 mb-1">
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                <path d="M6 1C4.34 1 3 2.34 3 4c0 2.5 3 6 3 6s3-3.5 3-6c0-1.66-1.34-3-3-3z" stroke="currentColor" strokeWidth="1" fill="none"/>
                                <circle cx="6" cy="4" r="1" fill="currentColor"/>
                              </svg>
                              <span className="truncate">📍 {impulse.address}</span>
                            </div>
                          )}
                          {/* Дата и время */}
                          <div className="flex items-center gap-1 text-[10px] text-white/50">
                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1"/>
                              <path d="M6 3v3l2 1" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                            </svg>
                            <span>📅 {formatDateTime(impulse.created_at)}</span>
                          </div>
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
                  className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[2000]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-black/90 backdrop-blur-xl border border-white/20 rounded-3xl p-6 z-[2001] max-w-md mx-auto max-h-[80vh] flex flex-col"
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
                      {formatDateTime(selectedEventChat.created_at)}
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
    </div>
  );
};

export default Profile;
