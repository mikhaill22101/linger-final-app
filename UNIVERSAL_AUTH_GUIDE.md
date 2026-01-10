# Универсальная система авторизации с единым ID

## Обзор

Приложение теперь поддерживает:
- ✅ **Единый уникальный ID** (UUID из Supabase Auth) для всех платформ
- ✅ **Независимость от Telegram** - работает как standalone приложение
- ✅ **Поддержка Telegram Mini App** - можно заходить через Telegram
- ✅ **Нативные приложения iOS/Android** через Capacitor

## Методы авторизации

### 1. Email/Password
```typescript
signUpWithEmail(email, password, fullName)
signInWithEmail(email, password)
```

### 2. Phone (OTP)
```typescript
signInWithPhone(phone) // Отправляет код
verifyPhoneOTP(phone, token) // Подтверждает код
```

### 3. Telegram OAuth
```typescript
signInWithTelegram(telegramUser) // Автоматически при открытии Mini App
linkTelegramAccount(telegramUser) // Связывает Telegram с существующим аккаунтом
```

## Единый ID (UUID)

**Все пользователи идентифицируются через UUID из Supabase Auth:**
- `id` (UUID) - основной идентификатор
- `telegram_id` - опциональный, если вход через Telegram
- `email` - опциональный, если вход через Email
- `phone` - опциональный, если вход через Phone

**Преимущества:**
- Один аккаунт на всех устройствах (iOS, Android, Web, Telegram)
- Независимость от платформы
- Возможность связывания нескольких методов входа

## Установка и настройка

### 1. Применить SQL миграции

В Supabase Dashboard -> SQL Editor выполните:

```sql
-- Файл: supabase/migrations/002_universal_user_id.sql
-- Обновляет схему БД для универсальной авторизации
```

Или через CLI:
```bash
supabase db push
```

### 2. Настроить Supabase Auth

В Supabase Dashboard -> Authentication -> Providers:

- ✅ Enable Email provider
- ✅ Enable Phone provider
- ⚠️ Telegram OAuth требует дополнительной настройки (через Bot API)

### 3. Настроить переменные окружения

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Подготовка нативного приложения (iOS/Android)

### Установка Capacitor

Capacitor уже установлен. Теперь нужно:

```bash
# Инициализировать Capacitor (если еще не сделано)
npx cap init

# Добавить платформы
npm run capacitor:add:ios
npm run capacitor:add:android

# Синхронизировать код
npm run capacitor:sync

# Открыть в Xcode/Android Studio
npm run capacitor:open:ios
npm run capacitor:open:android
```

### Сборка для production

```bash
# Собрать веб-версию
npm run build

# Синхронизировать с нативными проектами
npm run capacitor:sync

# Или одной командой
npm run capacitor:build:ios
npm run capacitor:build:android
```

## Миграция существующих данных

Если у вас уже есть пользователи с `telegram_id`, нужно мигрировать их:

```sql
-- 1. Создать пользователей в Supabase Auth через email (временный)
-- 2. Обновить profiles, связав telegram_id с новым UUID

-- Пример миграции (выполнять осторожно!)
UPDATE profiles p
SET id = (
  SELECT id FROM auth.users 
  WHERE raw_user_meta_data->>'telegram_id' = p.telegram_id::text
  LIMIT 1
)
WHERE telegram_id IS NOT NULL;
```

## Структура БД

### Таблица profiles

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id), -- Единый ID
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  telegram_id BIGINT UNIQUE, -- Опциональный
  telegram_username TEXT,
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  gender TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Таблица impulses

```sql
CREATE TABLE impulses (
  id SERIAL PRIMARY KEY,
  creator_id UUID REFERENCES profiles(id), -- UUID вместо telegram_id
  content TEXT,
  category TEXT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  is_duo_event BOOLEAN DEFAULT FALSE,
  selected_participant_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Использование в коде

### Получение текущего пользователя

```typescript
import { getCurrentUser, getUserId } from './lib/auth-universal';

const user = await getCurrentUser();
const userId = await getUserId(); // UUID
```

### Создание события

```typescript
const userId = await getUserId(); // UUID

await supabase.from('impulses').insert({
  creator_id: userId, // UUID
  content: '...',
  category: 'spark',
});
```

### Проверка авторизации

```typescript
import { isAuthenticated } from './lib/auth-universal';

if (await isAuthenticated()) {
  // Пользователь авторизован
}
```

## Telegram Mini App

Приложение автоматически определяет, открыто ли оно через Telegram Mini App:

```typescript
const isTelegramMiniApp = typeof window !== 'undefined' && !!window.Telegram?.WebApp;

if (isTelegramMiniApp) {
  // Автоматический вход через Telegram
  const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
  await signInWithTelegram(tgUser);
}
```

## Связывание аккаунтов

Если пользователь сначала зарегистрировался через Email, а потом хочет связать Telegram:

```typescript
import { linkTelegramAccount } from './lib/auth-universal';

const tgUser = window.Telegram.WebApp.initDataUnsafe.user;
await linkTelegramAccount(tgUser);
```

## Тестирование

### Тест единого аккаунта:

1. Зарегистрируйтесь через Email на iOS
2. Войдите через тот же Email на Android
3. Проверьте, что профиль и данные синхронизированы ✅

### Тест Telegram Mini App:

1. Откройте приложение через Telegram
2. Проверьте автоматический вход через Telegram ✅
3. Свяжите Telegram с существующим аккаунтом (если есть) ✅

## Публикация в App Store/Google Play

### iOS:

1. Откройте проект в Xcode: `npm run capacitor:open:ios`
2. Настройте Signing & Capabilities
3. Archive -> Distribute App
4. Загрузите в App Store Connect

### Android:

1. Откройте проект в Android Studio: `npm run capacitor:open:android`
2. Build -> Generate Signed Bundle / APK
3. Загрузите в Google Play Console

## Резюме

✅ **Единый ID**: UUID из Supabase Auth для всех платформ
✅ **Независимость**: Работает без Telegram
✅ **Telegram поддержка**: Можно заходить через Mini App
✅ **Нативные приложения**: iOS/Android через Capacitor
✅ **Гибкая авторизация**: Email, Phone, Telegram OAuth

Приложение готово к использованию на всех платформах с единым аккаунтом! 🚀
