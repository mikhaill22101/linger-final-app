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
    // Приводим UUID к строке для избежания ошибок типов
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, phone, telegram_id, telegram_username, full_name, avatar_url, gender')
      .eq('id', String(user.id)) // Приводим UUID к строке
      .single();

    return {
      id: String(user.id), // UUID всегда строка
      email: profile?.email || user.email || undefined,
      phone: profile?.phone || user.phone || undefined,
      telegram_id: profile?.telegram_id,
      telegram_username: profile?.telegram_username,
      full_name: profile?.full_name || user.user_metadata?.full_name,
      avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url,
      gender: profile?.gender || null, // Пол обязателен для доступа к приложению
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

    // Ищем существующий профиль по email (основной логический ключ для связывания аккаунтов)
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, email, gender')
      .eq('email', email.toLowerCase().trim()) // email как логический ключ
      .single();

    let profileId = String(data.user.id); // UUID из Supabase Auth

    // Если профиль с таким email уже существует, используем его ID
    if (existingProfile && existingProfile.id) {
      profileId = String(existingProfile.id);
      console.log('ℹ️ Found existing profile by email, linking accounts:', profileId);
    }

    // Создаем или обновляем профиль пользователя
    // Примечание: Триггер handle_new_user может уже создать профиль автоматически,
    // поэтому используем upsert для обновления существующего или создания нового
    // При регистрации всегда используем переданный gender (не сохраняем существующий, т.к. это новая регистрация)
    const genderToSave = gender; // Используем переданный gender при регистрации
    
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: String(profileId), // Используем существующий UUID если найден по email, иначе новый (UUID как строка)
        email: email.toLowerCase().trim(), // email как основной логический ключ для связывания аккаунтов
        full_name: fullName || null,
        gender: genderToSave, // Сохраняем переданный gender при регистрации
        created_at: existingProfile?.id ? undefined : new Date().toISOString(), // Не обновляем created_at для существующего профиля
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

    // Небольшая задержка для гарантии, что база данных успела обработать запрос
    await new Promise(resolve => setTimeout(resolve, 100));

    // Получаем обновленного пользователя из базы данных с полными данными
    // Это гарантирует, что мы получим актуальный gender после сохранения
    const updatedUser = await getCurrentUser();
    
    if (updatedUser) {
      // Если getCurrentUser вернул пользователя, используем его данные
      // Убеждаемся, что gender сохранен корректно (используем gender из базы данных)
      console.log('✅ User profile saved successfully, gender from DB:', updatedUser.gender || genderToSave);
      return {
        success: true,
        user: {
          ...updatedUser,
          gender: updatedUser.gender || genderToSave, // Используем gender из базы, если есть, иначе переданный
        },
      };
    }

    // Fallback: если getCurrentUser не вернул пользователя, создаем объект вручную
    console.warn('⚠️ getCurrentUser did not return user, using fallback');
    return {
      success: true,
      user: {
        id: String(profileId), // Используем ID найденного или созданного профиля (UUID как строка)
        email: email.toLowerCase().trim(), // email как основной логический ключ
        full_name: fullName,
        gender: genderToSave, // Возвращаем сохраненный gender
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
    // Нормализуем email для поиска (приводим к нижнему регистру и убираем пробелы)
    const normalizedEmail = email.toLowerCase().trim();

    // Ищем существующий профиль по email (основной логический ключ)
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, email, gender')
      .eq('email', normalizedEmail)
      .single();

    // Входим через Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data.user) {
      return { success: false, error: 'Sign in failed' };
    }

    // Если найден существующий профиль, убеждаемся что auth.users.id совпадает
    // Если нет - создаем связь
    if (existingProfile && String(existingProfile.id) !== String(data.user.id)) {
      console.warn('⚠️ Profile ID mismatch. Linking accounts...');
      // В будущем здесь можно добавить логику связывания аккаунтов
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
    // Нормализуем phone (убираем пробелы и символы форматирования)
    const normalizedPhone = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');

    // Ищем существующий профиль по phone (логический ключ для Phone авторизации)
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, phone, email, gender')
      .eq('phone', normalizedPhone)
      .single();

    // Подтверждаем OTP
    const { data, error } = await supabase.auth.verifyOtp({
      phone: normalizedPhone,
      token,
      type: 'sms',
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data.user) {
      return { success: false, error: 'Verification failed' };
    }

    let profileId = String(data.user.id); // UUID из Supabase Auth

    // Если профиль с таким phone уже существует, используем его ID
    if (existingProfile && existingProfile.id) {
      profileId = String(existingProfile.id);
      console.log('ℹ️ Found existing profile by phone, linking accounts:', profileId);
    }

    // Создаем или обновляем профиль пользователя
    // Поле gender остается null - пользователь должен выбрать его позже
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: String(profileId), // Используем существующий UUID если найден по phone, иначе новый (UUID как строка)
        phone: normalizedPhone,
        email: existingProfile?.email || null, // Сохраняем email если есть в существующем профиле
        gender: existingProfile?.gender || null, // Сохраняем существующий gender или null
        created_at: existingProfile?.id ? undefined : new Date().toISOString(), // Не обновляем created_at для существующего профиля
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
    // Архитектура единого аккаунта: ищем существующий профиль по email (основной ключ)
    // Если email нет в initData, проверяем по telegram_id
    // Это позволяет связывать аккаунты Google/Apple в будущем

    // Пробуем получить email из initData (если есть)
    // В будущем можно добавить парсинг initData для получения email
    let userEmail: string | null = null;
    
    // Сначала проверяем по telegram_id (быстрая проверка для существующих пользователей Telegram)
    const { data: existingProfileByTelegramId } = await supabase
      .from('profiles')
      .select('id, email, phone, telegram_id, gender')
      .eq('telegram_id', telegramUser.id)
      .single();

    if (existingProfileByTelegramId && existingProfileByTelegramId.id) {
      // Пользователь существует по telegram_id
      console.log('ℹ️ Found existing profile by telegram_id, updating...');
      
      const profileId = String(existingProfileByTelegramId.id);
      
      // Обновляем профиль с актуальными данными Telegram
      await supabase
        .from('profiles')
        .update({
          telegram_username: telegramUser.username || null,
          full_name: telegramUser.first_name || existingProfileByTelegramId.full_name || null,
          avatar_url: telegramUser.photo_url || null,
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', String(profileId)); // Приводим UUID к строке для избежания ошибок типов

      // Возвращаем существующий профиль
      const user = await getCurrentUser();
      return {
        success: true,
        user: {
          id: String(profileId), // UUID всегда строка
          email: existingProfileByTelegramId.email || undefined,
          phone: existingProfileByTelegramId.phone || undefined,
          telegram_id: telegramUser.id,
          telegram_username: telegramUser.username,
          full_name: telegramUser.first_name || existingProfileByTelegramId.full_name,
          avatar_url: telegramUser.photo_url,
          gender: existingProfileByTelegramId.gender || null, // Возвращаем gender из профиля
        },
      };
    }

    // Если профиль по telegram_id не найден, создаем новый
    // Используем временный email на основе telegram_id (для будущего связывания аккаунтов)
    // В будущем можно будет связать этот аккаунт с Google/Apple через email
    const tempEmail = `telegram_${telegramUser.id}@telegram.local`;
    
    // Проверяем, нет ли профиля с таким временным email (на случай повторной регистрации)
    const { data: existingProfileByEmail } = await supabase
      .from('profiles')
      .select('id, email, phone, gender')
      .eq('email', tempEmail)
      .single();

    let profileId: string;
    if (existingProfileByEmail && existingProfileByEmail.id) {
      // Профиль с таким временным email уже существует, обновляем его
      profileId = String(existingProfileByEmail.id);
      console.log('ℹ️ Found existing profile by temp email, linking telegram account:', profileId);
    } else {
      // Создаем нового пользователя через Supabase Auth
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

      profileId = String(authData.user.id);
    }

    // Создаем или обновляем профиль пользователя
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: String(profileId), // Используем существующий UUID если найден по email, иначе новый (UUID как строка)
        email: tempEmail, // Временный email для будущего связывания аккаунтов (Google, Apple)
        telegram_id: telegramUser.id,
        telegram_username: telegramUser.username || null,
        full_name: telegramUser.first_name || null,
        avatar_url: telegramUser.photo_url || null,
        gender: existingProfileByEmail?.gender || null, // Сохраняем существующий gender или null (пользователь должен выбрать позже)
        created_at: existingProfileByEmail?.id ? undefined : new Date().toISOString(), // Не обновляем created_at для существующего профиля
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

    // Загружаем созданный/обновленный профиль
    const createdUser = await getCurrentUser();
    
    return {
      success: true,
      user: {
        id: String(profileId), // UUID всегда строка
        email: tempEmail, // Временный email для будущего связывания аккаунтов
        telegram_id: telegramUser.id,
        telegram_username: telegramUser.username,
        full_name: telegramUser.first_name,
        avatar_url: telegramUser.photo_url,
        gender: createdUser?.gender || null, // gender будет null для нового пользователя (обязательно выбрать позже)
      },
    };
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

    // Сравнение UUID (строки): приводим к строкам для надежности
    if (existingProfile && String(existingProfile.id) !== String(currentUser.id)) {
      return { success: false, error: 'Telegram account already linked to another user' };
    }

    // Обновляем профиль пользователя, добавляя Telegram данные
    // Приводим UUID к строке для избежания ошибок типов
    const { error } = await supabase
      .from('profiles')
      .update({
        telegram_id: telegramUser.id,
        telegram_username: telegramUser.username || null,
        full_name: currentUser.full_name || telegramUser.first_name || null,
        avatar_url: currentUser.avatar_url || telegramUser.photo_url || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', String(currentUser.id)); // Приводим UUID к строке

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
      .eq('id', String(userId)); // Приводим UUID к строке для избежания ошибок типов

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
