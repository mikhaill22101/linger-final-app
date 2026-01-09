import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Проверка наличия переменных окружения
const isConfigValid = supabaseUrl && 
                      supabaseAnonKey && 
                      supabaseUrl !== 'https://placeholder.supabase.co' &&
                      supabaseUrl.startsWith('https://') &&
                      supabaseAnonKey.length > 20;

let supabaseClient: SupabaseClient;

try {
  if (!isConfigValid) {
    console.error('❌ Missing or invalid Supabase environment variables:');
    console.error('  - VITE_SUPABASE_URL:', supabaseUrl ? 'Set (but invalid)' : 'NOT SET');
    console.error('  - VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'Set (but invalid)' : 'NOT SET');
    console.warn('⚠️ Using placeholder client. Database operations will fail.');
    
    // Создаем клиент с заглушками для предотвращения падения приложения
    supabaseClient = createClient(
      'https://placeholder.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder'
    );
  } else {
    console.log('✅ Supabase client initialized successfully');
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Проверка подключения к Supabase (async, не блокирует запуск)
    (async () => {
      try {
        const { data, error } = await supabaseClient
          .from('profiles')
          .select('count')
          .limit(1);
        
        if (error && error.code !== 'PGRST116') {
          console.warn('⚠️ Supabase connection check:', error.message);
        } else {
          console.log('✅ Supabase connection verified');
        }
      } catch (err) {
        console.error('❌ Supabase connection check failed:', err);
      }
    })();
  }
} catch (error) {
  console.error('❌ Error creating Supabase client:', error);
  // Создаем минимальный клиент для предотвращения падения приложения
  supabaseClient = createClient(
    'https://placeholder.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder'
  );
}

// Функция для проверки доступности Supabase
export const checkSupabaseConnection = async (): Promise<boolean> => {
  try {
    if (!isConfigValid) {
      return false;
    }
    const { error } = await supabaseClient.from('profiles').select('count').limit(1);
    return !error || error.code === 'PGRST116'; // PGRST116 - "not found" is OK
  } catch {
    return false;
  }
};

export const supabase = supabaseClient;
export const isSupabaseConfigured = isConfigValid;
