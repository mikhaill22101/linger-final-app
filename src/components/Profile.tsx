import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

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

  // Загрузка профиля из базы данных
  useEffect(() => {
    const loadProfile = async () => {
      if (typeof window === 'undefined') return;

      const tgWebApp = (window as any).Telegram?.WebApp;

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
      ? (window as any).Telegram?.WebApp
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
        } catch (err) {
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
