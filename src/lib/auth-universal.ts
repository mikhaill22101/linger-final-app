import { supabase, isSupabaseConfigured } from './supabase';
import type { User, AuthError, Session } from '@supabase/supabase-js';

export interface AuthUser {
  id: string; // UUID из Supabase Auth (единый ID для всех платформ)
  email?: string;
  phone?: string;
  telegram_id?: number; // Опционально, если вход через Telegram
  telegram_username?: string;
  full_name?: string;
  avatar_url?: string;
}

export interface AuthSession {
  user: AuthUser;
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}

/**
 * Универсальная система авторизации с единым user_id
 * Поддерживает: Email/Password, Phone, Telegram OAuth
 */

/**
 * Проверка авторизации пользователя
 */
export const isAuthenticated = async (): Promise<boolean> => {
  if (!isSupabaseConfigured) return false;
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return !!session;
  } catch (error) {
    console.error('Error checking authentication:', error);
    return false;
  }
};

/**
 * Получение текущей сессии
 */
export const getCurrentSession = async (): Promise<Session | null> => {
  if (!isSupabaseConfigured) return null;
  
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Error getting session:', error);
      return null;
    }
    return session;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
};

/**
 * Получение текущего пользователя
 */
export const getCurrentUser = async (): Promise<AuthUser | null> => {
  if (!isSupabaseConfigured) return null;
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return null;
    }

    // Загружаем профиль пользователя из таблицы profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('telegram_id, telegram_username, full_name, avatar_url')
      .eq('id', user.id)
      .single();

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      telegram_id: profile?.telegram_id,
      telegram_username: profile?.telegram_username,
      full_name: profile?.full_name || user.user_metadata?.full_name,
      avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url,
    };
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
};

/**
 * Регистрация через Email и Password
 */
export const signUpWithEmail = async (
  email: string,
  password: string,
  fullName?: string
): Promise<{ success: boolean; user?: AuthUser; error?: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data.user) {
      return { success: false, error: 'User creation failed' };
    }

    // Создаем профиль пользователя
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: data.user.id, // Используем UUID из Supabase Auth
        email: email,
        full_name: fullName || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id',
      });

    if (profileError) {
      console.error('Error creating profile:', profileError);
      return { success: false, error: 'Profile creation failed' };
    }

    return {
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: fullName,
      },
    };
  } catch (error) {
    console.error('Error signing up:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Вход через Email и Password
 */
export const signInWithEmail = async (
  email: string,
  password: string
): Promise<{ success: boolean; user?: AuthUser; error?: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data.user) {
      return { success: false, error: 'Sign in failed' };
    }

    const user = await getCurrentUser();
    return { success: true, user: user || undefined };
  } catch (error) {
    console.error('Error signing in:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Регистрация/Вход через Phone (OTP)
 */
export const signInWithPhone = async (
  phone: string
): Promise<{ success: boolean; error?: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: {
        channel: 'sms',
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error signing in with phone:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Подтверждение OTP кода для Phone
 */
export const verifyPhoneOTP = async (
  phone: string,
  token: string
): Promise<{ success: boolean; user?: AuthUser; error?: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data.user) {
      return { success: false, error: 'Verification failed' };
    }

    // Создаем или обновляем профиль пользователя
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: data.user.id,
        phone: phone,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id',
      });

    if (profileError) {
      console.error('Error creating profile:', profileError);
    }

    const user = await getCurrentUser();
    return { success: true, user: user || undefined };
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Вход через Telegram (Mini App или OAuth)
 * Если пользователь уже существует по telegram_id, связываем аккаунты
 * Если нет, создаем новый аккаунт
 */
export const signInWithTelegram = async (
  telegramUser: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    auth_date?: number;
    hash?: string;
  },
  initData?: string // Telegram initData для проверки подлинности
): Promise<{ success: boolean; user?: AuthUser; error?: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    // Проверяем, существует ли уже пользователь с таким telegram_id
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, telegram_id')
      .eq('telegram_id', telegramUser.id)
      .single();

    if (existingProfile) {
      // Пользователь существует, входим через его аккаунт
      // Нужно получить сессию для существующего пользователя
      // Для этого используем специальный метод или создаем сессию через service role
      // В данном случае мы обновляем профиль и возвращаем данные
      await supabase
        .from('profiles')
        .update({
          telegram_username: telegramUser.username || null,
          full_name: telegramUser.first_name || null,
          avatar_url: telegramUser.photo_url || null,
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingProfile.id);

      // Здесь нужно авторизовать пользователя через Supabase Auth
      // Для этого создаем magic link или используем другой метод
      // Временно возвращаем профиль (реальная авторизация требует backend)
      const user = await getCurrentUser();
      return {
        success: true,
        user: {
          id: existingProfile.id,
          telegram_id: telegramUser.id,
          telegram_username: telegramUser.username,
          full_name: telegramUser.first_name,
          avatar_url: telegramUser.photo_url,
          ...user,
        },
      };
    } else {
      // Новый пользователь, создаем аккаунт
      // Используем email на основе telegram_id (временный)
      const tempEmail = `telegram_${telegramUser.id}@telegram.local`;
      
      // Создаем пользователя через Supabase Auth (с временным паролем или без)
      // Для Telegram нужно использовать специальный flow
      // Временно создаем профиль напрямую (для полной реализации нужен backend)
      
      // Альтернативный подход: создаем пользователя через email с временным паролем
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: tempEmail,
        password: crypto.randomUUID(), // Временный пароль, не используется
        options: {
          data: {
            telegram_id: telegramUser.id,
            full_name: telegramUser.first_name,
            avatar_url: telegramUser.photo_url,
          },
          emailRedirectTo: undefined, // Не требуем подтверждения email
        },
      });

      if (authError || !authData.user) {
        return { success: false, error: authError?.message || 'User creation failed' };
      }

      // Создаем профиль пользователя
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: authData.user.id,
          telegram_id: telegramUser.id,
          telegram_username: telegramUser.username || null,
          full_name: telegramUser.first_name || null,
          avatar_url: telegramUser.photo_url || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id',
        });

      if (profileError) {
        console.error('Error creating profile:', profileError);
        return { success: false, error: 'Profile creation failed' };
      }

      return {
        success: true,
        user: {
          id: authData.user.id,
          telegram_id: telegramUser.id,
          telegram_username: telegramUser.username,
          full_name: telegramUser.first_name,
          avatar_url: telegramUser.photo_url,
        },
      };
    }
  } catch (error) {
    console.error('Error signing in with Telegram:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Связывание Telegram аккаунта с существующим аккаунтом
 */
export const linkTelegramAccount = async (
  telegramUser: {
    id: number;
    first_name?: string;
    username?: string;
    photo_url?: string;
  }
): Promise<{ success: boolean; error?: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'User not authenticated' };
    }

    // Проверяем, не связан ли уже этот Telegram аккаунт с другим пользователем
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('telegram_id', telegramUser.id)
      .single();

    if (existingProfile && existingProfile.id !== currentUser.id) {
      return { success: false, error: 'Telegram account already linked to another user' };
    }

    // Обновляем профиль пользователя, добавляя Telegram данные
    const { error } = await supabase
      .from('profiles')
      .update({
        telegram_id: telegramUser.id,
        telegram_username: telegramUser.username || null,
        full_name: currentUser.full_name || telegramUser.first_name || null,
        avatar_url: currentUser.avatar_url || telegramUser.photo_url || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentUser.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error linking Telegram account:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Выход из аккаунта
 */
export const signOut = async (): Promise<{ success: boolean; error?: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    console.error('Error signing out:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Получение единого ID пользователя (UUID из Supabase Auth)
 */
export const getUserId = async (): Promise<string | null> => {
  const user = await getCurrentUser();
  return user?.id || null;
};
