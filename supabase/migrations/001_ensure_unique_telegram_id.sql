-- Миграция для обеспечения единого аккаунта через telegram_id
-- Гарантирует уникальность telegram_id на всех платформах (iOS, Android, Web, Desktop)

-- Создаем уникальный индекс на telegram_id, если его еще нет
CREATE UNIQUE INDEX IF NOT EXISTS profiles_telegram_id_unique 
ON profiles(telegram_id) 
WHERE telegram_id IS NOT NULL;

-- Альтернативный вариант: добавление constraint (если таблица еще не имеет его)
-- ALTER TABLE profiles 
-- ADD CONSTRAINT profiles_telegram_id_unique 
-- UNIQUE (telegram_id);

-- Комментарий: telegram_id используется как основной идентификатор пользователя
-- для обеспечения единого аккаунта на всех платформах (iOS, Android, Web, Desktop)
