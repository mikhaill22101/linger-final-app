import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, Phone, User, ArrowRight, Sparkles, Users } from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import {
  signUpWithEmail,
  signInWithEmail,
  signInWithPhone,
  verifyPhoneOTP,
  signInWithTelegram,
  signInWithGoogle,
  signInWithApple,
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
  const [gender, setGender] = useState<'male' | 'female' | null>(null); // Обязательное поле при регистрации
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
        console.log('🔄 Attempting registration with email:', email, 'gender:', gender, 'gender type:', typeof gender);
        if (!gender || (gender !== 'male' && gender !== 'female')) {
          console.error('❌ Gender validation failed:', gender);
          setError(isRussian ? 'Пожалуйста, выберите пол (М или Ж)' : 'Please select gender (M or F)');
          setIsLoading(false);
          return;
        }
        console.log('✅ Gender validated, proceeding with registration...');
        result = await signUpWithEmail(email, password, fullName, gender);
        console.log('📝 Registration result:', result.success ? 'Success' : 'Failed', result.error || '');
        if (result.success && result.user) {
          console.log('✅ User registered successfully, gender in user object:', result.user.gender);
        }
      } else {
        console.log('🔄 Attempting login with email:', email);
        result = await signInWithEmail(email, password);
        console.log('📝 Login result:', result.success ? 'Success' : 'Failed', result.error || '');
      }

      if (result.success && result.user) {
        console.log('✅ Authentication successful, user:', result.user.id);
        onAuthSuccess(result.user);
      } else {
        // Детальное сообщение об ошибке
        const errorMsg = result.error || (isRussian ? 'Ошибка авторизации' : 'Authentication error');
        console.error('❌ Authentication error:', errorMsg);
        setError(errorMsg);
        
        // Показываем детальную ошибку пользователю через alert (если доступен)
        if (window.Telegram?.WebApp?.showAlert) {
          WebApp.showAlert(errorMsg);
        } else {
          // Fallback на стандартный alert
          alert(errorMsg);
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Authentication exception:', err);
      setError(errorMsg);
      
      // Показываем ошибку пользователю
      if (window.Telegram?.WebApp?.showAlert) {
        WebApp.showAlert(errorMsg);
      } else {
        alert(errorMsg);
      }
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
    <div 
      className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-indigo-950 flex items-center justify-center p-4"
      style={{
        // Убеждаемся, что форма регистрации всегда отображается в обычном виде
        // даже если родительский компонент перевернут в режиме Duo
        transform: 'none',
        backfaceVisibility: 'visible',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
        style={{
          // Форма регистрации не должна вращаться вместе с интерфейсом
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

              {/* Обязательный выбор пола при регистрации */}
              {mode === 'register' && (
                <div>
                  <label className="block text-white/70 text-sm mb-2">
                    {isRussian ? 'Пол' : 'Gender'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        console.log('🔘 Gender selected: male');
                        setGender('male');
                      }}
                      className={`py-3 rounded-xl text-base font-medium transition-all ${
                        gender === 'male'
                          ? 'bg-purple-500/30 text-white border-2 border-purple-400/50'
                          : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {isRussian ? 'М' : 'M'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        console.log('🔘 Gender selected: female');
                        setGender('female');
                      }}
                      className={`py-3 rounded-xl text-base font-medium transition-all ${
                        gender === 'female'
                          ? 'bg-purple-500/30 text-white border-2 border-purple-400/50'
                          : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {isRussian ? 'Ж' : 'F'}
                    </button>
                  </div>
                  {/* Отладочная информация */}
                  {process.env.NODE_ENV === 'development' && (
                    <p className="text-white/30 text-xs mt-1">
                      Selected: {gender || 'none'}
                    </p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || (mode === 'register' && !gender)}
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

          {/* OAuth кнопки (Google, Apple) - только для Email/Password форм */}
          {(mode === 'login' || mode === 'register') && (
            <div className="mt-6 pt-6 border-t border-white/10 space-y-3">
              <p className="text-white/60 text-xs text-center mb-3">
                {isRussian ? 'Или войдите через' : 'Or sign in with'}
              </p>
              
              {/* Google OAuth */}
              <button
                onClick={async () => {
                  setIsLoading(true);
                  setError(null);
                  try {
                    const result = await signInWithGoogle();
                    if (!result.success) {
                      setError(result.error || (isRussian ? 'Ошибка входа через Google' : 'Google sign in error'));
                      if (window.Telegram?.WebApp?.showAlert) {
                        WebApp.showAlert(result.error || (isRussian ? 'Ошибка входа через Google' : 'Google sign in error'));
                      } else {
                        alert(result.error || (isRussian ? 'Ошибка входа через Google' : 'Google sign in error'));
                      }
                    }
                    // OAuth редирект произойдет автоматически
                  } catch (err) {
                    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
                    setError(errorMsg);
                    if (window.Telegram?.WebApp?.showAlert) {
                      WebApp.showAlert(errorMsg);
                    } else {
                      alert(errorMsg);
                    }
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={isLoading}
                className="w-full bg-white hover:bg-white/90 py-3 rounded-xl text-gray-900 font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>{isRussian ? 'Войти через Google' : 'Sign in with Google'}</span>
              </button>

              {/* Apple OAuth */}
              <button
                onClick={async () => {
                  setIsLoading(true);
                  setError(null);
                  try {
                    const result = await signInWithApple();
                    if (!result.success) {
                      setError(result.error || (isRussian ? 'Ошибка входа через Apple' : 'Apple sign in error'));
                      if (window.Telegram?.WebApp?.showAlert) {
                        WebApp.showAlert(result.error || (isRussian ? 'Ошибка входа через Apple' : 'Apple sign in error'));
                      } else {
                        alert(result.error || (isRussian ? 'Ошибка входа через Apple' : 'Apple sign in error'));
                      }
                    }
                    // OAuth редирект произойдет автоматически
                  } catch (err) {
                    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
                    setError(errorMsg);
                    if (window.Telegram?.WebApp?.showAlert) {
                      WebApp.showAlert(errorMsg);
                    } else {
                      alert(errorMsg);
                    }
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={isLoading}
                className="w-full bg-black hover:bg-gray-900 border border-white/20 py-3 rounded-xl text-white font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C1.79 15.25 2.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                <span>{isRussian ? 'Войти через Apple' : 'Sign in with Apple'}</span>
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
