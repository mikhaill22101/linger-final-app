-- Миграция для универсальной системы авторизации с единым user_id
-- Поддержка: Email/Password, Phone, Telegram OAuth

-- 1. Обновляем таблицу profiles для использования UUID из Supabase Auth
-- Добавляем email и phone, если их нет
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS telegram_username TEXT;

-- 2. telegram_id теперь опциональный (может быть NULL)
-- Удаляем уникальное ограничение на telegram_id (если было), т.к. он опциональный
-- Оставляем уникальный индекс только для email и phone

-- Уникальный индекс для email (если не NULL)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique 
ON profiles(email) 
WHERE email IS NOT NULL;

-- Уникальный индекс для phone (если не NULL)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique 
ON profiles(phone) 
WHERE phone IS NOT NULL;

-- Уникальный индекс для telegram_id (если не NULL) - теперь опциональный
DROP INDEX IF EXISTS profiles_telegram_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_telegram_id_unique 
ON profiles(telegram_id) 
WHERE telegram_id IS NOT NULL;

-- 3. Обновляем таблицу impulses для использования UUID вместо telegram_id
-- creator_id должен быть UUID (из таблицы profiles.id)
-- Если есть старые данные с числовым creator_id, нужно мигрировать их

-- Проверяем тип creator_id
-- Если creator_id - integer, нужно будет мигрировать данные
-- В данном случае предполагаем, что creator_id уже UUID или будет обновлен через миграцию данных

-- 4. Обновляем таблицу friendships для использования UUID
-- user_id и friend_id должны быть UUID (из таблицы profiles.id)

-- 5. Добавляем индексы для производительности
CREATE INDEX IF NOT EXISTS profiles_telegram_id_idx ON profiles(telegram_id) WHERE telegram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_email_idx ON profiles(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_phone_idx ON profiles(phone) WHERE phone IS NOT NULL;

-- 6. Создаем функцию для автоматического создания профиля при регистрации через Supabase Auth
-- Это будет настроено через Supabase Dashboard -> Database -> Functions или через Edge Functions
-- Но можно также использовать триггеры:

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, phone, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    email = COALESCE(EXCLUDED.email, profiles.email),
    phone = COALESCE(EXCLUDED.phone, profiles.phone),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Создаем триггер для автоматического создания профиля при регистрации
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Обновляем существующие профили (если есть telegram_id без UUID)
-- Это нужно выполнить вручную для миграции существующих данных:
-- UPDATE profiles SET id = gen_random_uuid() WHERE telegram_id IS NOT NULL AND id IS NULL;

-- Комментарий: 
-- - id (UUID) - единый идентификатор пользователя из Supabase Auth
-- - telegram_id - опциональный, если вход через Telegram
-- - email - опциональный, если вход через Email
-- - phone - опциональный, если вход через Phone
-- Все методы входа связаны с одним и тем же id (UUID)
