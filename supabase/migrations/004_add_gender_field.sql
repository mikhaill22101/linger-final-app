-- Миграция для добавления поля gender (пол) в таблицу profiles
-- Поле необязательное (NULL) для поддержки существующих пользователей и новых регистраций

-- Добавляем поле gender в таблицу profiles, если его еще нет
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'prefer_not_to_say'));

-- Убеждаемся, что поле может быть NULL (необязательное)
ALTER TABLE profiles 
ALTER COLUMN gender DROP NOT NULL;

-- Создаем индекс для фильтрации по полу (если нужно)
CREATE INDEX IF NOT EXISTS profiles_gender_idx ON profiles(gender) WHERE gender IS NOT NULL;

-- Комментарий:
-- - gender: пол пользователя (male, female, prefer_not_to_say) или NULL
-- - Поле необязательное, чтобы не блокировать регистрацию
-- - Используется в режиме Linger Duo для фильтрации заявок на участие
