-- Миграция для поддержки email как основного логического ключа для связывания аккаунтов
-- Это позволяет в будущем связывать аккаунты Google и Apple через email

-- 1. Убеждаемся, что email может быть уникальным (для связывания аккаунтов)
-- Уникальный индекс для email (если не NULL) уже создан в миграции 002
-- Проверяем, что он существует
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique 
ON profiles(email) 
WHERE email IS NOT NULL;

-- 2. Добавляем комментарий для документации
COMMENT ON COLUMN profiles.email IS 'Основной логический ключ для связывания аккаунтов (Email, Google, Apple). Используется для поиска существующих пользователей при авторизации.';
COMMENT ON COLUMN profiles.phone IS 'Логический ключ для Phone/OTP авторизации. Используется для поиска существующих пользователей при входе по телефону.';
COMMENT ON COLUMN profiles.telegram_id IS 'Логический ключ для Telegram авторизации. Опциональный. Используется для быстрого поиска при входе через Telegram.';
COMMENT ON COLUMN profiles.gender IS 'Пол пользователя (обязателен для доступа к приложению). NULL означает, что профиль не завершен - пользователь должен выбрать пол перед доступом к карте.';

-- 3. Создаем функцию для поиска существующего профиля по email (для связывания аккаунтов)
-- Это позволяет в будущем связать Google/Apple аккаунты с существующим Email аккаунтом
CREATE OR REPLACE FUNCTION public.find_profile_by_email(p_email TEXT)
RETURNS TABLE (
  id UUID,
  email TEXT,
  phone TEXT,
  telegram_id BIGINT,
  gender TEXT,
  full_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    profiles.id,
    profiles.email,
    profiles.phone,
    profiles.telegram_id,
    profiles.gender,
    profiles.full_name
  FROM profiles
  WHERE profiles.email = LOWER(TRIM(p_email))
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Создаем функцию для поиска существующего профиля по phone (для связывания аккаунтов)
CREATE OR REPLACE FUNCTION public.find_profile_by_phone(p_phone TEXT)
RETURNS TABLE (
  id UUID,
  email TEXT,
  phone TEXT,
  telegram_id BIGINT,
  gender TEXT,
  full_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    profiles.id,
    profiles.email,
    profiles.phone,
    profiles.telegram_id,
    profiles.gender,
    profiles.full_name
  FROM profiles
  WHERE profiles.phone = REGEXP_REPLACE(p_phone, '[^\d+]', '', 'g')
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Убеждаемся, что все поля id в таблицах используют UUID (не bigint)
-- Проверяем типы полей для избежания ошибок "operator does not exist: uuid = bigint"

-- Для таблицы profiles: id уже UUID (из миграции 002)
-- Проверяем, что creator_id в impulses - UUID
DO $$
BEGIN
  -- Проверяем тип creator_id в impulses
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'impulses' 
    AND column_name = 'creator_id'
    AND data_type != 'uuid'
  ) THEN
    RAISE NOTICE 'Warning: creator_id in impulses is not UUID. Please update manually.';
  END IF;
END $$;

-- Для таблицы friendships: user_id и friend_id должны быть UUID
DO $$
BEGIN
  -- Проверяем тип user_id в friendships
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'friendships' 
    AND column_name = 'user_id'
    AND data_type != 'uuid'
  ) THEN
    RAISE NOTICE 'Warning: user_id in friendships is not UUID. Please update manually.';
  END IF;
  
  -- Проверяем тип friend_id в friendships
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'friendships' 
    AND column_name = 'friend_id'
    AND data_type != 'uuid'
  ) THEN
    RAISE NOTICE 'Warning: friend_id in friendships is not UUID. Please update manually.';
  END IF;
END $$;

-- 6. Создаем индексы для быстрого поиска по email и phone (для связывания аккаунтов)
CREATE INDEX IF NOT EXISTS profiles_email_lower_idx ON profiles(LOWER(TRIM(email))) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_phone_normalized_idx ON profiles(REGEXP_REPLACE(phone, '[^\d+]', '', 'g')) WHERE phone IS NOT NULL;

-- 7. Обновляем триггер handle_new_user для поддержки email как логического ключа
-- Триггер уже обновлен в миграции 002, но убеждаемся, что email сохраняется в нижнем регистре
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, phone, gender, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(LOWER(TRIM(NEW.email)), NULL), -- email в нижнем регистре для консистентности
    COALESCE(REGEXP_REPLACE(NEW.phone, '[^\d+]', '', 'g'), NULL), -- phone нормализован
    NULL, -- gender по умолчанию NULL (пользователь должен выбрать позже)
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    email = COALESCE(LOWER(TRIM(EXCLUDED.email)), profiles.email),
    phone = COALESCE(REGEXP_REPLACE(EXCLUDED.phone, '[^\d+]', '', 'g'), profiles.phone),
    gender = COALESCE(profiles.gender, EXCLUDED.gender), -- Сохраняем существующее значение gender, если есть
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Комментарий к миграции:
-- Эта миграция настраивает архитектуру "Единого Аккаунта", где:
-- - email используется как основной логический ключ для связывания аккаунтов
-- - phone используется как логический ключ для Phone/OTP авторизации
-- - telegram_id используется как логический ключ для Telegram авторизации
-- - Все поля id используют UUID (не bigint) для избежания ошибок типов
-- - В будущем можно будет связать Google и Apple аккаунты через email
