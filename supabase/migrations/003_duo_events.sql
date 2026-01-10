-- Миграция для режима Linger Duo (встречи строго на двоих)

-- 1. Добавляем поле is_duo_event в таблицу impulses (если еще нет)
ALTER TABLE impulses 
ADD COLUMN IF NOT EXISTS is_duo_event BOOLEAN DEFAULT FALSE;

-- 2. Добавляем поле selected_participant_id в таблицу impulses (если еще нет)
ALTER TABLE impulses 
ADD COLUMN IF NOT EXISTS selected_participant_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 3. Создаем таблицу event_requests для хранения заявок на участие в Duo-событиях
CREATE TABLE IF NOT EXISTS event_requests (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES impulses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_name TEXT,
  user_avatar TEXT,
  user_gender TEXT CHECK (user_gender IN ('male', 'female', 'prefer_not_to_say')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Уникальность: один пользователь может отправить только один pending запрос на событие
  UNIQUE(event_id, user_id, status) WHERE status = 'pending'
);

-- 4. Создаем индексы для производительности
CREATE INDEX IF NOT EXISTS event_requests_event_id_idx ON event_requests(event_id);
CREATE INDEX IF NOT EXISTS event_requests_user_id_idx ON event_requests(user_id);
CREATE INDEX IF NOT EXISTS event_requests_status_idx ON event_requests(status);
CREATE INDEX IF NOT EXISTS event_requests_event_status_idx ON event_requests(event_id, status);

-- 5. Создаем индекс для фильтрации по полу
CREATE INDEX IF NOT EXISTS event_requests_user_gender_idx ON event_requests(user_gender) WHERE user_gender IS NOT NULL;

-- 6. Создаем функцию для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_event_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Создаем триггер для автоматического обновления updated_at
DROP TRIGGER IF EXISTS event_requests_updated_at_trigger ON event_requests;
CREATE TRIGGER event_requests_updated_at_trigger
  BEFORE UPDATE ON event_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_event_requests_updated_at();

-- 8. Добавляем индекс для impulses.is_duo_event
CREATE INDEX IF NOT EXISTS impulses_is_duo_event_idx ON impulses(is_duo_event) WHERE is_duo_event = TRUE;

-- 9. Добавляем индекс для impulses.selected_participant_id
CREATE INDEX IF NOT EXISTS impulses_selected_participant_id_idx ON impulses(selected_participant_id) WHERE selected_participant_id IS NOT NULL;

-- Комментарии:
-- - is_duo_event: определяет, является ли событие Duo-событием (только для двоих)
-- - selected_participant_id: UUID выбранного участника из списка запросов
-- - event_requests: таблица для хранения всех заявок на участие в Duo-событиях
-- - status: pending (ожидает), accepted (принят), rejected (отклонен)
-- - user_gender: пол пользователя для фильтрации запросов
-- - Уникальность: один пользователь может отправить только один pending запрос на событие
