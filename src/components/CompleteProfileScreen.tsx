import { useState } from 'react';
import { motion } from 'framer-motion';
import { Users, ArrowRight, Sparkles } from 'lucide-react';
import { updateUserGender, getCurrentUser } from '../lib/auth-universal';
import type { AuthUser } from '../lib/auth-universal';

interface CompleteProfileScreenProps {
  onComplete: (user: AuthUser) => void;
}

export const CompleteProfileScreen: React.FC<CompleteProfileScreenProps> = ({ onComplete }) => {
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;

  const handleComplete = async () => {
    if (!gender) {
      setError(isRussian ? 'Пожалуйста, выберите пол' : 'Please select gender');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        setError(isRussian ? 'Пользователь не найден' : 'User not found');
        setIsLoading(false);
        return;
      }

      const result = await updateUserGender(currentUser.id, gender);
      
      if (result.success) {
        // Обновляем пользователя с новым полом
        const updatedUser: AuthUser = {
          ...currentUser,
          gender: gender,
        };
        onComplete(updatedUser);
      } else {
        setError(result.error || (isRussian ? 'Ошибка сохранения' : 'Save error'));
        if (window.Telegram?.WebApp?.showAlert) {
          WebApp.showAlert(result.error || (isRussian ? 'Ошибка сохранения' : 'Save error'));
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      if (window.Telegram?.WebApp?.showAlert) {
        WebApp.showAlert(errorMsg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-indigo-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
        style={{
          transform: 'none',
          backfaceVisibility: 'visible',
        }}
      >
        {/* Логотип/Заголовок */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="inline-block mb-4"
          >
            <Sparkles className="w-16 h-16 text-purple-400" />
          </motion.div>
          <h1 className="text-3xl font-light text-white mb-2">Linger</h1>
          <p className="text-white/60 text-sm">
            {isRussian ? 'Завершите настройку профиля' : 'Complete your profile'}
          </p>
        </div>

        {/* Форма завершения профиля */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-6 shadow-2xl"
        >
          <div className="space-y-6">
            {/* Выбор пола */}
            <div>
              <label className="block text-white/70 text-sm mb-3 flex items-center gap-2">
                <Users size={16} />
                <span>{isRussian ? 'Выберите пол' : 'Select Gender'}</span>
                <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setGender('male')}
                  className={`py-4 rounded-xl text-sm font-medium transition-all ${
                    gender === 'male'
                      ? 'bg-purple-500/30 text-white border-2 border-purple-400/50 shadow-lg shadow-purple-500/20'
                      : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white hover:border-purple-400/30'
                  }`}
                >
                  {isRussian ? 'Мужчина' : 'Male'}
                </button>
                <button
                  type="button"
                  onClick={() => setGender('female')}
                  className={`py-4 rounded-xl text-sm font-medium transition-all ${
                    gender === 'female'
                      ? 'bg-purple-500/30 text-white border-2 border-purple-400/50 shadow-lg shadow-purple-500/20'
                      : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white hover:border-purple-400/30'
                  }`}
                >
                  {isRussian ? 'Женщина' : 'Female'}
                </button>
              </div>
              {!gender && (
                <p className="text-red-400/80 text-xs mt-2">
                  {isRussian ? 'Пожалуйста, выберите пол для продолжения' : 'Please select gender to continue'}
                </p>
              )}
            </div>

            {/* Ошибка */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm"
              >
                {error}
              </motion.div>
            )}

            {/* Кнопка завершения */}
            <button
              onClick={handleComplete}
              disabled={isLoading || !gender}
              className="w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 py-3 rounded-xl text-white font-medium flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span>{isRussian ? 'Сохранение...' : 'Saving...'}</span>
              ) : (
                <>
                  <span>{isRussian ? 'Завершить' : 'Complete'}</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            {/* Информация */}
            <p className="text-white/40 text-xs text-center">
              {isRussian 
                ? 'Эта информация используется для режима Linger Duo и помогает создавать более подходящие встречи.'
                : 'This information is used for Linger Duo mode and helps create more suitable meetings.'}
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};
