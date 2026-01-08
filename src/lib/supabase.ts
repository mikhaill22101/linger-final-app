import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Создаем клиент с заглушками, если переменные отсутствуют, чтобы приложение не падало
// В продакшене эти переменные должны быть установлены
let supabaseClient;

try {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase environment variables. Using placeholder client.');
    // Создаем клиент с заглушками
    supabaseClient = createClient(
      'https://placeholder.supabase.co',
      'placeholder-key'
    );
  } else {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  }
} catch (error) {
  console.error('Error creating Supabase client:', error);
  // Создаем минимальный клиент для предотвращения падения приложения
  supabaseClient = createClient(
    'https://placeholder.supabase.co',
    'placeholder-key'
  );
}

export const supabase = supabaseClient;
