import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, Phone, User, ArrowRight, Sparkles } from 'lucide-react';
import {
  signUpWithEmail,
  signInWithEmail,
  signInWithPhone,
  verifyPhoneOTP,
  signInWithTelegram,
  isAuthenticated,
  getCurrentUser,
} from '../lib/auth-universal';
import type { AuthUser } from '../lib/auth-universal';

interface AuthScreenProps {
  onAuthSuccess: (user: AuthUser) => void;
}

type AuthMode = 'login' | 'register' | 'phone' | 'phone-verify';

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneSent, setPhoneSent] = useState(false);

  const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;

  // Проверка, открыто ли приложение через Telegram Mini App
  const isTelegramMiniApp = typeof window !== 'undefined' && !!window.Telegram?.WebApp;

  // Попытка авторизации через Telegram при открытии Mini App
  useEffect(() => {
    if (isTelegramMiniApp) {
      const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
      if (tgUser?.id) {
        handleTelegramLogin(tgUser);
      }
    }
  }, [isTelegramMiniApp]);

  const handleTelegramLogin = async (tgUser: any) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await signInWithTelegram({
        id: tgUser.id,
        first_name: tgUser.first_name,
        last_name: tgUser.last_name,
        username: tgUser.username,
        photo_url: tgUser.photo_url,
      });

      if (result.success && result.user) {
        onAuthSuccess(result.user);
      } else {
        setError(result.error || (isRussian ? 'Ошибка входа через Telegram' : 'Telegram login error'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      let result;
      if (mode === 'register') {
        result = await signUpWithEmail(email, password, fullName);
      } else {
        result = await signInWithEmail(email, password);
      }

      if (result.success && result.user) {
        onAuthSuccess(result.user);
      } else {
        setError(result.error || (isRussian ? 'Ошибка авторизации' : 'Authentication error'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await signInWithPhone(phone);
      if (result.success) {
        setPhoneSent(true);
        setMode('phone-verify');
      } else {
        setError(result.error || (isRussian ? 'Ошибка отправки SMS' : 'SMS sending error'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await verifyPhoneOTP(phone, otpCode);
      if (result.success && result.user) {
        onAuthSuccess(result.user);
      } else {
        setError(result.error || (isRussian ? 'Неверный код' : 'Invalid code'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
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
            {isRussian ? 'Найди свои моменты' : 'Find your moments'}
          </p>
        </div>

        {/* Форма авторизации */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-6 shadow-2xl"
        >
          {/* Кнопки переключения режима */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-all ${
                mode === 'login'
                  ? 'bg-purple-500/20 text-white border border-purple-400/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              {isRussian ? 'Вход' : 'Login'}
            </button>
            <button
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-all ${
                mode === 'register'
                  ? 'bg-purple-500/20 text-white border border-purple-400/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              {isRussian ? 'Регистрация' : 'Register'}
            </button>
            <button
              onClick={() => {
                setMode('phone');
                setError(null);
              }}
              className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-all ${
                mode === 'phone' || mode === 'phone-verify'
                  ? 'bg-purple-500/20 text-white border border-purple-400/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Phone size={16} className="inline mr-1" />
            </button>
          </div>

          {/* Ошибка */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Форма Email/Password */}
          {(mode === 'login' || mode === 'register') && (
            <form onSubmit={handleEmailAuth} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="block text-white/70 text-sm mb-2">
                    {isRussian ? 'Имя' : 'Full Name'}
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={isRussian ? 'Ваше имя' : 'Your name'}
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-purple-400/50 transition-colors"
                      required={mode === 'register'}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-white/70 text-sm mb-2">
                  {isRussian ? 'Email' : 'Email'}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={isRussian ? 'your@email.com' : 'your@email.com'}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-purple-400/50 transition-colors"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-white/70 text-sm mb-2">
                  {isRussian ? 'Пароль' : 'Password'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isRussian ? '••••••••' : '••••••••'}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-purple-400/50 transition-colors"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 py-3 rounded-xl text-white font-medium flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span>{isRussian ? 'Загрузка...' : 'Loading...'}</span>
                ) : (
                  <>
                    <span>{mode === 'login' ? (isRussian ? 'Войти' : 'Sign In') : (isRussian ? 'Зарегистрироваться' : 'Sign Up')}</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Форма Phone */}
          {mode === 'phone' && (
            <form onSubmit={handlePhoneAuth} className="space-y-4">
              <div>
                <label className="block text-white/70 text-sm mb-2">
                  {isRussian ? 'Номер телефона' : 'Phone Number'}
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={isRussian ? '+7 (900) 123-45-67' : '+1 (555) 123-4567'}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-purple-400/50 transition-colors"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 py-3 rounded-xl text-white font-medium flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span>{isRussian ? 'Отправка...' : 'Sending...'}</span>
                ) : (
                  <>
                    <span>{isRussian ? 'Отправить код' : 'Send Code'}</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Форма Phone Verify */}
          {mode === 'phone-verify' && (
            <form onSubmit={handlePhoneVerify} className="space-y-4">
              <div>
                <label className="block text-white/70 text-sm mb-2">
                  {isRussian ? 'Код подтверждения' : 'Verification Code'}
                </label>
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={isRussian ? '123456' : '123456'}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-center text-2xl tracking-widest placeholder:text-white/40 focus:outline-none focus:border-purple-400/50 transition-colors"
                  required
                  maxLength={6}
                />
                <p className="text-white/50 text-xs mt-2 text-center">
                  {isRussian ? `Код отправлен на ${phone}` : `Code sent to ${phone}`}
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading || otpCode.length !== 6}
                className="w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 py-3 rounded-xl text-white font-medium flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span>{isRussian ? 'Проверка...' : 'Verifying...'}</span>
                ) : (
                  <>
                    <span>{isRussian ? 'Подтвердить' : 'Verify'}</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('phone');
                  setPhoneSent(false);
                  setOtpCode('');
                }}
                className="w-full text-white/60 text-sm hover:text-white transition-colors"
              >
                {isRussian ? 'Изменить номер' : 'Change number'}
              </button>
            </form>
          )}

          {/* Кнопка Telegram (если не Mini App) */}
          {!isTelegramMiniApp && (
            <div className="mt-6 pt-6 border-t border-white/10">
              <button
                onClick={() => {
                  // Открываем Telegram OAuth
                  window.location.href = `https://oauth.telegram.org/auth?bot_id=YOUR_BOT_ID&origin=${encodeURIComponent(window.location.origin)}&request_access=write`;
                }}
                className="w-full bg-[#0088cc] hover:bg-[#006699] py-3 rounded-xl text-white font-medium flex items-center justify-center gap-2 transition-all"
              >
                <span>{isRussian ? 'Войти через Telegram' : 'Sign in with Telegram'}</span>
              </button>
            </div>
          )}
        </motion.div>

        {/* Информация о Mini App */}
        {isTelegramMiniApp && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center text-white/40 text-xs mt-4"
          >
            {isRussian ? 'Вход через Telegram Mini App' : 'Signing in via Telegram Mini App'}
          </motion.p>
        )}
      </motion.div>
    </div>
  );
};
