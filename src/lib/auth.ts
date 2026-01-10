import { supabase, isSupabaseConfigured } from './supabase';

interface TelegramWebAppUser {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
}

/**
 * Синхронизация профиля пользователя с базой данных
 * Гарантирует единый аккаунт на всех устройствах через telegram_id
 */
export const syncUserProfile = async (
  telegramUser: TelegramWebAppUser
): Promise<{ success: boolean; profileId?: number; error?: string }> => {
  if (!telegramUser?.id) {
    return { success: false, error: 'Telegram user ID is missing' };
  }

  if (!isSupabaseConfigured) {
    console.warn('⚠️ Supabase не настроен, пропускаем синхронизацию профиля');
    return { success: false, error: 'Database not configured' };
  }

  try {
    // Используем upsert для создания или обновления профиля
    // telegram_id используется как уникальный идентификатор
    const { data, error } = await supabase
      .from('profiles')
      .upsert(
        {
          id: telegramUser.id, // telegram_id используется как primary key
          telegram_id: telegramUser.id,
          full_name: telegramUser.first_name || telegramUser.username || null,
          avatar_url: telegramUser.photo_url || null,
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'telegram_id', // Используем telegram_id как уникальный ключ
        }
      )
      .select()
      .single();

    if (error) {
      console.error('❌ Error syncing user profile:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ User profile synced successfully:', data);
    return { success: true, profileId: data?.id };
  } catch (error) {
    console.error('Failed to sync user profile:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Проверка авторизации пользователя в Telegram
 */
export const isAuthenticated = (): boolean => {
  return !!window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
};

/**
 * Получение данных текущего пользователя из Telegram
 */
export const getCurrentTelegramUser = (): TelegramWebAppUser | null => {
  return window.Telegram?.WebApp?.initDataUnsafe?.user || null;
};

/**
 * Получение Telegram ID текущего пользователя
 */
export const getCurrentTelegramUserId = (): number | null => {
  return window.Telegram?.WebApp?.initDataUnsafe?.user?.id || null;
};

/**
 * Инициализация и синхронизация пользователя при запуске приложения
 * Гарантирует единый аккаунт на всех устройствах
 */
export const initializeUser = async (): Promise<{
  success: boolean;
  profileId?: number;
  error?: string;
}> => {
  // Проверяем авторизацию
  if (!isAuthenticated()) {
    return { success: false, error: 'User not authenticated' };
  }

  // Получаем данные пользователя из Telegram
  const telegramUser = getCurrentTelegramUser();
  if (!telegramUser) {
    return { success: false, error: 'Telegram user data not available' };
  }

  // Синхронизируем профиль с базой данных
  const result = await syncUserProfile(telegramUser);
  
  return result;
};

/**
 * Проверка, изменился ли аккаунт пользователя
 * Полезно для обработки смены аккаунта в Telegram клиенте
 */
export const checkUserChanged = (
  previousUserId: number | null
): { changed: boolean; newUserId: number | null } => {
  const currentUserId = getCurrentTelegramUserId();
  
  if (currentUserId === null) {
    return { changed: false, newUserId: null };
  }

  if (previousUserId === null) {
    return { changed: true, newUserId: currentUserId };
  }

  return {
    changed: currentUserId !== previousUserId,
    newUserId: currentUserId,
  };
};
