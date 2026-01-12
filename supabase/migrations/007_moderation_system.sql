-- Миграция для системы модерации и правовой защиты
-- Добавляет возрастную верификацию, систему жалоб, блокировки и логирование

-- 1. Добавляем поля для возрастной верификации в profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS age_confirmed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS banned_reason TEXT,
ADD COLUMN IF NOT EXISTS messaging_restricted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS messaging_restricted_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS report_count INTEGER DEFAULT 0;

-- 2. Создаем таблицу жалоб (reports)
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'harassment', 'explicit_content', 'commercial_activity', 'illegal_activity', 'other')),
  description TEXT,
  context_url TEXT, -- URL или ID контекста (профиль, чат, событие)
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  resolution TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для reports
CREATE INDEX IF NOT EXISTS reports_reporter_id_idx ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS reports_reported_user_id_idx ON reports(reported_user_id);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status);
CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports(created_at);

-- 3. Создаем таблицу блокировок пользователей
CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);

-- Индексы для blocked_users
CREATE INDEX IF NOT EXISTS blocked_users_blocker_id_idx ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS blocked_users_blocked_id_idx ON blocked_users(blocked_id);

-- 4. Создаем таблицу логов модерации
CREATE TABLE IF NOT EXISTS moderation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id UUID REFERENCES profiles(id), -- NULL для автоматических действий
  target_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('ban', 'unban', 'restrict_messaging', 'unrestrict_messaging', 'review_report', 'dismiss_report', 'warn')),
  reason TEXT,
  details JSONB, -- Дополнительные детали действия
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для moderation_logs
CREATE INDEX IF NOT EXISTS moderation_logs_moderator_id_idx ON moderation_logs(moderator_id);
CREATE INDEX IF NOT EXISTS moderation_logs_target_user_id_idx ON moderation_logs(target_user_id);
CREATE INDEX IF NOT EXISTS moderation_logs_action_type_idx ON moderation_logs(action_type);
CREATE INDEX IF NOT EXISTS moderation_logs_created_at_idx ON moderation_logs(created_at);

-- 5. Функция для автоматического увеличения счетчика жалоб
-- ВАЖНО: Не применяет автоматические баны, только увеличивает счетчик
-- Модерация требует ручного подтверждения администратором
CREATE OR REPLACE FUNCTION increment_report_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles
  SET report_count = report_count + 1
  WHERE id = NEW.reported_user_id;
  
  -- НЕ применяем автоматические ограничения или баны
  -- Все действия требуют ручного подтверждения администратором
  -- Счетчик жалоб используется только для приоритизации в панели модерации
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Триггер для автоматического увеличения счетчика жалоб
DROP TRIGGER IF EXISTS on_report_created ON reports;
CREATE TRIGGER on_report_created
  AFTER INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION increment_report_count();

-- 6. Функция для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для обновления updated_at в reports
DROP TRIGGER IF EXISTS update_reports_updated_at ON reports;
CREATE TRIGGER update_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. RLS политики для reports (пользователи могут создавать жалобы, админы могут просматривать все)
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create reports" ON reports
  FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view their own reports" ON reports
  FOR SELECT
  USING (auth.uid() = reporter_id OR auth.uid() = reported_user_id);

-- 8. RLS политики для blocked_users
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can block others" ON blocked_users
  FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can view their blocks" ON blocked_users
  FOR SELECT
  USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

CREATE POLICY "Users can unblock" ON blocked_users
  FOR DELETE
  USING (auth.uid() = blocker_id);

-- 9. RLS политики для moderation_logs (только для просмотра админами, но создавать могут все)
ALTER TABLE moderation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create moderation logs" ON moderation_logs
  FOR INSERT
  WITH CHECK (true);

-- Примечание: Политики для просмотра логов модерации должны быть настроены отдельно
-- в зависимости от роли пользователя (админ/модератор)

-- 10. Функция для проверки возраста (18+)
CREATE OR REPLACE FUNCTION is_adult(date_of_birth DATE)
RETURNS BOOLEAN AS $$
BEGIN
  IF date_of_birth IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXTRACT(YEAR FROM AGE(date_of_birth)) >= 18;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 11. Комментарии к таблицам
COMMENT ON TABLE reports IS 'Жалобы пользователей на других пользователей';
COMMENT ON TABLE blocked_users IS 'Блокировки пользователей друг другом';
COMMENT ON TABLE moderation_logs IS 'Логи действий модерации для юридического соответствия';
COMMENT ON COLUMN profiles.date_of_birth IS 'Дата рождения пользователя (обязательна для регистрации)';
COMMENT ON COLUMN profiles.age_confirmed IS 'Подтверждение возраста 18+';
COMMENT ON COLUMN profiles.age_confirmed_at IS 'Время подтверждения возраста';
COMMENT ON COLUMN profiles.is_banned IS 'Заблокирован ли пользователь';
COMMENT ON COLUMN profiles.messaging_restricted IS 'Ограничены ли сообщения пользователя';
