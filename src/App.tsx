import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { Sparkles, Zap, Film, MapPin, Utensils, Users, Heart, Home, User, X, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Profile from './components/Profile';
import MapScreen from './components/MapScreen';
import { supabase } from './lib/supabase';

interface Impulse {
  id: number;
  content: string;
  category: string;
  creator_id: number;
  created_at: string;
  author_name?: string;
  location_lat?: number;
  location_lng?: number;
}

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

import { categoryColors } from './lib/categoryColors';

function App() {
  console.log('App started');
  
  const [activeTab, setActiveTab] = useState<'home' | 'profile' | 'map'>('home');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [messageContent, setMessageContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feed, setFeed] = useState<Impulse[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);

  const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;

  useEffect(() => {
    try {
      WebApp.ready();
      WebApp.expand();
      loadFeed();
    } catch (e) {
      console.error('Error in App useEffect:', e);
    }
  }, []);

  const loadFeed = async () => {
    try {
      setIsLoadingFeed(true);
      const { data, error } = await supabase
        .from('impulse_with_author')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error loading feed:', error);
      } else {
        setFeed(data || []);
      }
    } catch (err) {
      console.error('Failed to load feed:', err);
    } finally {
      setIsLoadingFeed(false);
    }
  };

  const handleCategoryClick = (id: string) => {
    setSelectedCategory(id);
    setModalOpen(true);
    setMessageContent('');
    
    // Устанавливаем активную категорию для подсветки маркеров на карте
    const category = categories.find(cat => cat.id === id);
    if (category) {
      const categoryName = isRussian ? category.label.ru : category.label.en;
      setActiveCategory(categoryName);
    }
    
    // Вибрация при клике на категорию
    if (WebApp.HapticFeedback) {
      try {
        WebApp.HapticFeedback.impactOccurred('medium');
      } catch (e) {
        console.warn('Haptic feedback error:', e);
      }
    }
  };

  const handleTabChange = (tab: 'home' | 'profile' | 'map') => {
    setActiveTab(tab);
    WebApp.HapticFeedback.impactOccurred('light');
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedCategory(null);
    setMessageContent('');
    // Сбрасываем активную категорию при закрытии модального окна
    setActiveCategory(null);
  };

  const getCurrentLocation = (): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.log('Geolocation error:', error);
          resolve(null);
        },
        { timeout: 5000, maximumAge: 60000 }
      );
    });
  };

  const handleSendMessage = async () => {
    if (!messageContent.trim() || !selectedCategory) {
      return;
    }

    setIsSubmitting(true);

    try {
      const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      
      if (!userId) {
        console.error('User ID is missing');
        WebApp.showAlert('Error: User ID not found');
        setIsSubmitting(false);
        return;
      }

      const category = categories.find(cat => cat.id === selectedCategory);
      const categoryName = category ? (isRussian ? category.label.ru : category.label.en) : selectedCategory;

      const location = await getCurrentLocation();
      const locationData: { location_lat?: number; location_lng?: number } = {};
      if (location) {
        locationData.location_lat = location.lat;
        locationData.location_lng = location.lng;
      }

      const { data, error } = await supabase
        .from('impulses')
        .insert({
          content: messageContent.trim(),
          category: categoryName,
          creator_id: userId,
          ...locationData,
        })
        .select()
        .single();

      if (error) {
        console.error('Error sending message:', error);
        WebApp.showAlert(isRussian ? 'Ошибка при отправке сообщения' : 'Error sending message');
      } else {
        console.log('Message sent successfully:', data);
        WebApp.showAlert(isRussian ? 'Сообщение успешно отправлено!' : 'Message sent successfully!');
        handleCloseModal();
        loadFeed();
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      try {
        WebApp.showAlert(JSON.stringify(err));
      } catch (alertError) {
        console.error('Failed to show error alert:', alertError);
        WebApp.showAlert(isRussian ? 'Ошибка при отправке сообщения' : 'Error sending message');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return isRussian ? 'только что' : 'just now';
    if (minutes < 60) return isRussian ? `${minutes} мин назад` : `${minutes}m ago`;
    if (hours < 24) return isRussian ? `${hours} ч назад` : `${hours}h ago`;
    if (days < 7) return isRussian ? `${days} дн назад` : `${days}d ago`;
    return date.toLocaleDateString(isRussian ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white/20 flex flex-col">
      <div className={`flex-1 ${activeTab === 'map' ? '' : 'pb-20'}`}>
        {activeTab === 'home' ? (
          <>
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

            <main className="px-4 pb-6 space-y-4">
              {categories.map((cat) => (
                <div key={cat.id} className="relative overflow-visible">
                  <motion.button
                    onClick={() => handleCategoryClick(cat.id)}
                    className="relative w-full p-5 rounded-2xl flex items-center justify-between border bg-white/5 border-white/10 hover:bg-black/40 hover:border-white/20 transition-all duration-500 backdrop-blur-xl z-10"
                  >
                    <div className="flex items-center gap-4">
                      <cat.icon size={22} className="text-gray-400" />
                      <span className="text-lg font-light tracking-wide">
                        {isRussian ? cat.label.ru : cat.label.en}
                      </span>
                    </div>
                    <span className="text-xs text-white/40">
                      {isRussian ? 'Нажмите' : 'Tap'}
                    </span>
                  </motion.button>
                </div>
              ))}
            </main>

            <section className="px-4 pb-12">
              <h2 className="text-xl font-light mb-4 text-white/80">
                {isRussian ? 'Лента активности' : 'Activity Feed'}
              </h2>
              {isLoadingFeed ? (
                <div className="text-center py-8 text-white/40">
                  {isRussian ? 'Загрузка...' : 'Loading...'}
                </div>
              ) : feed.length === 0 ? (
                <div className="text-center py-8 text-white/40">
                  {isRussian ? 'Пока нет сообщений' : 'No messages yet'}
                </div>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence>
                    {feed.map((impulse, index) => (
                      <motion.div
                        key={impulse.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ delay: index * 0.05 }}
                        className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">
                              {impulse.author_name || (isRussian ? 'Аноним' : 'Anonymous')}
                            </span>
                            <span className="text-xs text-white/40 px-2 py-0.5 bg-white/5 rounded-full">
                              {impulse.category}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-white/40">
                            <Clock size={12} />
                            <span>{formatTime(impulse.created_at)}</span>
                          </div>
                        </div>
                        <p className="text-sm text-white/80 leading-relaxed">
                          {impulse.content}
                        </p>
                        {impulse.location_lat && impulse.location_lng && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-white/40">
                            <MapPin size={12} />
                            <span>{isRussian ? 'С геолокацией' : 'With location'}</span>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </section>
          </>
        ) : activeTab === 'profile' ? (
          <Profile />
        ) : (
          <MapScreen activeCategory={activeCategory} onCategoryChange={setActiveCategory} />
        )}
      </div>

      <AnimatePresence>
        {modalOpen && selectedCategory && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseModal}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-black/90 backdrop-blur-xl border border-white/20 rounded-3xl p-6 z-50 max-w-md mx-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-light text-white">
                  {(() => {
                    const category = categories.find(cat => cat.id === selectedCategory);
                    return category ? (isRussian ? category.label.ru : category.label.en) : selectedCategory;
                  })()}
                </h3>
                <button
                  onClick={handleCloseModal}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={20} className="text-white/60" />
                </button>
              </div>

              <textarea
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                placeholder={isRussian ? 'Напишите ваше сообщение...' : 'Write your message...'}
                className="w-full rounded-2xl bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 text-sm text-white placeholder:text-white/35 resize-none min-h-[120px] px-4 py-3 leading-relaxed mb-4"
                autoFocus
              />

              <div className="flex gap-3">
                <button
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="flex-1 rounded-2xl bg-white/5 border border-white/20 py-3 text-sm font-medium text.white/80 hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  {isRussian ? 'Отмена' : 'Cancel'}
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={isSubmitting || !messageContent.trim()}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting 
                    ? (isRussian ? 'Отправка...' : 'Sending...') 
                    : (isRussian ? 'Отправить' : 'Send')
                  }
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md border-t border-white/10 z-40">
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
            onClick={() => handleTabChange('map')}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors ${
              activeTab === 'map' ? 'text-white' : 'text-white/50'
            }`}
          >
            <MapPin size={22} className={activeTab === 'map' ? 'text-white' : 'text-white/50'} />
            <span className="text-xs font-light">
              {isRussian ? 'Карта' : 'Map'}
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
