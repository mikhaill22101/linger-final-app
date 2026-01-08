import WebApp from '@twa-dev/sdk'; 
import { useState, useEffect } from 'react';
import { Sparkles, Zap, Film, MapPin, Utensils, Users, Heart, ChevronDown, Home, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Profile from './components/Profile';
// Определяем категории с их цветами и описаниями
const categories = [
  { 
    id: 'spark', 
    icon: Sparkles, 
    label: { ru: 'Искра', en: 'Spark' }, 
    color: 'from-amber-400/20 to-orange-600/20',
    border: 'border-amber-500/30',
    text: { 
      ru: 'Вечеринки, бары и супер мероприятия', 
      en: 'Parties, bars and major vibes' 
    }
  },
  { 
    id: 'impulse', 
    icon: Zap, 
    label: { ru: 'Импульс', en: 'Impulse' }, 
    color: 'from-blue-400/20 to-indigo-600/20',
    border: 'border-blue-500/30',
    text: { 
      ru: 'Спорт, тренировки и активный отдых', 
      en: 'Workout, energy and active life' 
    }
  },
  { 
    id: 'artgo', 
    icon: Film, 
    label: { ru: 'Афиша', en: 'ArtGo' }, 
    color: 'from-purple-400/20 to-pink-600/20',
    border: 'border-purple-500/30',
    text: { 
      ru: 'Выставки, кино и культурные события', 
      en: 'Exhibitions, cinema and cultural scenes' 
    }
  },
  { 
    id: 'walk', 
    icon: MapPin, 
    label: { ru: 'Исследуй', en: 'Walk Around' }, 
    color: 'from-emerald-400/20 to-teal-600/20',
    border: 'border-emerald-500/30',
    text: { 
      ru: 'Прогулки и секретные места города', 
      en: 'City walks and hidden gems' 
    }
  },
  { 
    id: 'tasty', 
    icon: Utensils, 
    label: { ru: 'Гастротур', en: 'Tasty Spots' }, 
    color: 'from-red-400/20 to-rose-600/20',
    border: 'border-red-500/30',
    text: { 
      ru: 'Вкусная еда, особенный кофе и столовая 2.0', 
      en: 'Tasty food, specialty coffee and Canteen 2.0' 
    }
  },
  { 
    id: 'sync', 
    icon: Users, 
    label: { ru: 'В ритме', en: 'In Sync' }, 
    color: 'from-cyan-400/20 to-blue-500/20',
    border: 'border-cyan-500/30',
    text: { 
      ru: 'Совместная работа, учеба и коворкинг', 
      en: 'Co-working, study sessions and flow' 
    }
  },
  { 
    id: 'hobby', 
    icon: Heart, 
    label: { ru: 'Хобби', en: 'Hobby' }, 
    color: 'from-pink-400/20 to-red-500/20',
    border: 'border-pink-500/30',
    text: { 
      ru: 'Джем-сейшн, рыбалка и общие увлечения', 
      en: 'Jam sessions, fishing and shared passions' 
    }
  }
];

function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'profile'>('home');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    WebApp.ready();
    WebApp.expand(); // Развернет приложение на весь экран в Telegram
  }, []);
  
  const handleCategoryClick = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
    // Добавляем легкую вибрацию при клике
    WebApp.HapticFeedback.impactOccurred('light');
  };

  const handleTabChange = (tab: 'home' | 'profile') => {
    setActiveTab(tab);
    // Добавляем легкую вибрацию при переключении таба
    WebApp.HapticFeedback.impactOccurred('light');
  };
  
  // Определяем язык (по умолчанию русский, если в Telegram стоит 'ru')
  const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white/20 flex flex-col">
      {/* Контент */}
      <div className="flex-1 pb-20">
        {activeTab === 'home' ? (
          <>
            {/* Шапка */}
            <header className="pt-16 pb-8 px-6 text-center">
              <motion.h1 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-5xl font-light tracking-[0.2em] mb-2"
              >
                LINGER
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-gray-500 uppercase tracking-widest text-[10px]"
              >
                Meet the Moment
              </motion.p>
            </header>

            {/* Список категорий */}
            <main className="px-4 pb-12 space-y-4">
              {categories.map((cat) => (
                <div key={cat.id} className="relative overflow-visible">
                  {/* Эффект свечения сзади активной кнопки */}
                  <AnimatePresence>
                    {expandedId === cat.id && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={`glow-effect bg-gradient-to-r ${cat.color}`}
                      />
                    )}
                  </AnimatePresence>

                  <motion.button
                    onClick={() => handleCategoryClick(cat.id)}
                    className={`relative w-full p-5 rounded-2xl flex items-center justify-between border transition-all duration-500 ${
                      expandedId === cat.id 
                      ? `bg-black/40 ${cat.border} shadow-2xl` 
                      : 'bg-white/5 border-white/10'
                    } backdrop-blur-xl z-10`}
                  >
                    <div className="flex items-center gap-4">
                      <cat.icon size={22} className={expandedId === cat.id ? 'text-white' : 'text-gray-400'} />
                      <span className="text-lg font-light tracking-wide">
                        {isRussian ? cat.label.ru : cat.label.en}
                      </span>
                    </div>
                    <motion.div
                      animate={{ rotate: expandedId === cat.id ? 180 : 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <ChevronDown size={20} className="text-gray-500" />
                    </motion.div>
                  </motion.button>

                  <AnimatePresence>
                    {expandedId === cat.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="relative z-10 bg-black/20 mx-2 rounded-b-2xl border-x border-b border-white/5 backdrop-blur-md"
                      >
                        <div className="p-6 text-gray-300 font-light leading-relaxed">
                          {isRussian ? cat.text.ru : cat.text.en}
                          <div className="mt-4 pt-4 border-t border-white/5 flex justify-end">
                            <button className="text-xs uppercase tracking-widest text-white/40 hover:text-white transition-colors">
                              Explore →
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </main>
          </>
        ) : (
          <Profile />
        )}
      </div>

      {/* Нижняя панель навигации */}
      <nav className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md border-t border-white/10 z-50">
        <div className="flex items-center justify-around h-16 px-4">
          <button
            onClick={() => handleTabChange('home')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors ${
              activeTab === 'home' ? 'text-white' : 'text-white/50'
            }`}
          >
            <Home size={22} className={activeTab === 'home' ? 'text-white' : 'text-white/50'} />
            <span className="text-xs font-light">
              {isRussian ? 'Главная' : 'Home'}
            </span>
          </button>
          <button
            onClick={() => handleTabChange('profile')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors ${
              activeTab === 'profile' ? 'text-white' : 'text-white/50'
            }`}
          >
            <User size={22} className={activeTab === 'profile' ? 'text-white' : 'text-white/50'} />
            <span className="text-xs font-light">
              {isRussian ? 'Профиль' : 'Profile'}
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export default App;