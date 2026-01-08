import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Clock } from 'lucide-react';
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
            const { data, error } = await supabase
              .from('profiles')
              .select('bio, full_name')
              .eq('id', telegramId)
              .single();

            if (error && error.code !== 'PGRST116') {
              // PGRST116 - это "not found", что нормально для нового пользователя
              console.error('Error loading profile:', error);
            } else if (data) {
              setProfile((prev) => ({
                ...prev,
                bio: data.bio || '',
                firstName: data.full_name || prev.firstName,
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

  useEffect(() => {
    const loadMyImpulses = async () => {
      if (!profile.telegramId) return;

      try {
        setIsLoadingImpulses(true);
        const { data, error } = await supabase
          .from('impulses')
          .select('id, content, category, created_at')
          .eq('creator_id', profile.telegramId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error loading my impulses:', error);
        } else {
          setMyImpulses(data || []);
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
    try {
      setDeletingIds(prev => new Set(prev).add(id));
      
      const { error } = await supabase
        .from('impulses')
        .delete()
        .eq('id', id)
        .eq('creator_id', profile.telegramId);

      if (error) {
        console.error('Error deleting impulse:', error);
        WebApp.showAlert('Error deleting message');
      } else {
        // Удаляем из локального состояния
        setMyImpulses(prev => prev.filter(impulse => impulse.id !== id));
        WebApp.HapticFeedback.impactOccurred('light');
      }
    } catch (err) {
      console.error('Failed to delete impulse:', err);
      WebApp.showAlert('Error deleting message');
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

    try {
      // Сохраняем данные в Supabase методом upsert
      // id должен быть bigint из Telegram user.id
      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          id: profile.telegramId, // bigint из Telegram user.id
          full_name: profile.firstName,
          bio: profile.bio,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id', // Конфликт по полю id
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving profile:', error);
        // Optional: показать уведомление об ошибке
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
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-black/80 overflow-hidden">
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
                </div>
              </div>

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
                        className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-start justify-between gap-3"
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
                          <p className="text-xs text-white/70 leading-relaxed line-clamp-2">
                            {impulse.content}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteImpulse(impulse.id)}
                          disabled={deletingIds.has(impulse.id)}
                          className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Trash2 
                            size={14} 
                            className="text-white/40 hover:text-red-400 transition-colors" 
                          />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
