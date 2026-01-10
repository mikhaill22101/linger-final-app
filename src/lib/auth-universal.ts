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
  gender?: 'male' | 'female' | 'prefer_not_to_say' | null; // Пол пользователя (обязателен для доступа к приложению)
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
      gender: profile?.gender || null,
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
  fullName?: string,
  gender?: 'male' | 'female' | 'prefer_not_to_say' | null
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
      console.error('❌ Supabase Auth signUp error:', error);
      console.error('  Status:', error.status);
      console.error('  Message:', error.message);
      
      // Детальное сообщение об ошибке для пользователя
      let errorMessage = error.message || 'Registration failed';
      if (error.message?.includes('User already registered')) {
        errorMessage = 'Email already registered. Please sign in instead.';
      } else if (error.message?.includes('Invalid email')) {
        errorMessage = 'Invalid email address';
      } else if (error.message?.includes('Password')) {
        errorMessage = 'Password does not meet requirements (minimum 6 characters)';
      } else if (error.status === 422) {
        errorMessage = 'Invalid input data. Please check your email and password.';
      }
      
      return { success: false, error: errorMessage };
    }

    if (!data.user) {
      console.error('❌ User creation failed: data.user is null');
      return { success: false, error: 'User creation failed: no user data returned' };
    }

    // Проверяем, что пол указан при регистрации
    if (!gender) {
      return { success: false, error: 'Gender is required for registration' };
    }

    // Создаем или обновляем профиль пользователя
    // Примечание: Триггер handle_new_user может уже создать профиль автоматически,
    // поэтому используем upsert для обновления существующего или создания нового
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: data.user.id, // Используем UUID из Supabase Auth
        email: email,
        full_name: fullName || null,
        gender: gender, // Поле gender обязательное при регистрации
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id',
      });

    if (profileError) {
      console.error('❌ Error creating/updating profile:', profileError);
      console.error('  Code:', profileError.code);
      console.error('  Message:', profileError.message);
      console.error('  Details:', profileError.details);
      console.error('  Hint:', profileError.hint);
      
      // Детальное сообщение об ошибке для пользователя
      let errorMessage = 'Profile creation failed';
      
      if (profileError.code === '23505') {
        // Unique constraint violation - профиль уже существует, это нормально
        console.log('ℹ️ Profile already exists (trigger may have created it), continuing...');
        // Не возвращаем ошибку, т.к. профиль уже существует и это нормально
      } else if (profileError.code === '23503') {
        errorMessage = 'Foreign key constraint violation: ' + (profileError.details || 'Check related records');
      } else if (profileError.code === '23502') {
        errorMessage = 'Required field is missing: ' + (profileError.details || 'unknown field');
      } else if (profileError.code === '42P01') {
        errorMessage = 'Table profiles does not exist. Please run database migrations.';
      } else if (profileError.message) {
        errorMessage = profileError.message;
      }
      
      // Если это не ошибка уникальности (профиль уже существует), возвращаем ошибку
      if (profileError.code !== '23505') {
        return { success: false, error: errorMessage };
      }
      // Если профиль уже существует, продолжаем (это нормально при работе триггера)
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
    console.error('❌ Error signing up (catch):', error);
    let errorMessage = 'Unknown error occurred during registration';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      console.error('  Error name:', error.name);
      console.error('  Error stack:', error.stack);
    } else if (typeof error === 'object' && error !== null) {
      const errorObj = error as any;
      if (errorObj.message) {
        errorMessage = errorObj.message;
      }
      console.error('  Error object:', errorObj);
    }
    
    return {
      success: false,
      error: errorMessage,
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
        gender: null, // Поле gender необязательное
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id',
      });

    if (profileError) {
      console.error('❌ Error creating profile (phone):', profileError);
      console.error('  Code:', profileError.code);
      console.error('  Message:', profileError.message);
      console.error('  Details:', profileError.details);
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
          gender: existingProfile.gender || null, // Возвращаем gender из профиля
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
          gender: null, // Поле gender необязательное, можно указать позже в профиле
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id',
        });

      if (profileError) {
        console.error('❌ Error creating profile (telegram):', profileError);
        console.error('  Code:', profileError.code);
        console.error('  Message:', profileError.message);
        console.error('  Details:', profileError.details);
        
        let errorMessage = 'Profile creation failed';
        if (profileError.message) {
          errorMessage = profileError.message;
        }
        
        return { success: false, error: errorMessage };
      }

      // Загружаем созданный профиль для получения gender
      const createdUser = await getCurrentUser();
      
      return {
        success: true,
        user: {
          id: authData.user.id,
          telegram_id: telegramUser.id,
          telegram_username: telegramUser.username,
          full_name: telegramUser.first_name,
          avatar_url: telegramUser.photo_url,
          gender: createdUser?.gender || null, // gender будет null для нового пользователя
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

/**
 * Вход через Google OAuth
 */
export const signInWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${window.location.pathname}`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      console.error('❌ Google OAuth error:', error);
      return { success: false, error: error.message };
    }

    // OAuth редирект произойдет автоматически
    return { success: true };
  } catch (error) {
    console.error('Error signing in with Google:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Вход через Apple OAuth
 */
export const signInWithApple = async (): Promise<{ success: boolean; error?: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}${window.location.pathname}`,
      },
    });

    if (error) {
      console.error('❌ Apple OAuth error:', error);
      return { success: false, error: error.message };
    }

    // OAuth редирект произойдет автоматически
    return { success: true };
  } catch (error) {
    console.error('Error signing in with Apple:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Сохранение пола пользователя в профиле
 */
export const updateUserGender = async (
  userId: string,
  gender: 'male' | 'female' | 'prefer_not_to_say'
): Promise<{ success: boolean; error?: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        gender: gender,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('❌ Error updating gender:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating gender:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
