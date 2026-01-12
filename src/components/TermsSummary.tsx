import { motion } from 'framer-motion';
import { FileText, ExternalLink, Check } from 'lucide-react';
import { TermsOfService } from './TermsOfService';
import { useState } from 'react';
import { logConsent } from '../lib/consent-logging';

interface TermsSummaryProps {
  onAccept: () => void;
  onBack: () => void;
}

/**
 * Handle Terms of Service acceptance with consent logging (152-FZ compliance)
 */
const handleTermsAcceptance = async (onAccept: () => void) => {
  // Log consent for Terms of Service (RF 152-FZ requirement)
  // This logs ONLY: user_id, consent_type, policy_version, timestamp
  // No personal data or user-generated content is logged
  await logConsent('terms_of_service');
  await logConsent('privacy_policy'); // Privacy Policy is accepted together with Terms
  
  onAccept();
};

export const TermsSummary: React.FC<TermsSummaryProps> = ({ onAccept, onBack }) => {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showFullTerms, setShowFullTerms] = useState(false);

  // Safe window access for SSR/initial load
  const isRussian = typeof window !== 'undefined' 
    ? (window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true)
    : true;

  if (showFullTerms) {
    return <TermsOfService onClose={() => setShowFullTerms(false)} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full max-w-md"
    >
      <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-6 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring' }}
            className="inline-block mb-4"
          >
            <FileText className="w-12 h-12 text-purple-400" />
          </motion.div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {isRussian ? 'Условия использования' : 'Terms of Service'}
          </h2>
          <p className="text-white/60 text-sm">
            {isRussian 
              ? 'Пожалуйста, ознакомьтесь с правилами платформы' 
              : 'Please review the platform rules'}
          </p>
        </div>

        {/* Terms Summary */}
        <div className="space-y-4 mb-6 max-h-[400px] overflow-y-auto">
          {/* Age Requirement */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-purple-400 font-bold text-sm">1</span>
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-1">
                  {isRussian ? 'Возраст 18+' : 'Age 18+'}
                </h3>
                <p className="text-white/70 text-sm">
                  {isRussian 
                    ? 'Доступ разрешен только пользователям в возрасте 18 лет и старше. Предоставление ложных данных о возрасте приводит к постоянной блокировке.'
                    : 'Access is allowed only for users aged 18 and above. Providing false age data leads to permanent account ban.'}
                </p>
              </div>
            </div>
          </div>

          {/* User Responsibility */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-purple-400 font-bold text-sm">2</span>
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-1">
                  {isRussian ? 'Ваша ответственность' : 'Your Responsibility'}
                </h3>
                <p className="text-white/70 text-sm">
                  {isRussian 
                    ? 'Вы действуете по собственной инициативе и несете полную личную ответственность за свои действия, включая участие во встречах и обмен сообщениями.'
                    : 'You act on your own initiative and bear full personal responsibility for your actions, including participation in meetings and messaging.'}
                </p>
              </div>
            </div>
          </div>

          {/* Platform Status */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-purple-400 font-bold text-sm">3</span>
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-1">
                  {isRussian ? 'Технический сервис' : 'Technical Service'}
                </h3>
                <p className="text-white/70 text-sm">
                  {isRussian 
                    ? 'Платформа является техническим сервисом коммуникации. Мы не организуем, не рекомендуем и не контролируем встречи пользователей.'
                    : 'The platform is a technical communication service. We do not organize, recommend, or supervise user meetings.'}
                </p>
              </div>
            </div>
          </div>

          {/* Prohibited Activities */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-purple-400 font-bold text-sm">4</span>
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-1">
                  {isRussian ? 'Запрещено' : 'Prohibited'}
                </h3>
                <p className="text-white/70 text-sm">
                  {isRussian 
                    ? 'Коммерческая деятельность, платные встречи, предложение сексуальных услуг, спам и незаконная деятельность строго запрещены.'
                    : 'Commercial activity, paid meetings, offering sexual services, spam, and illegal activity are strictly prohibited.'}
                </p>
              </div>
            </div>
          </div>

          {/* Contact Exchange */}
          <div className="bg-green-500/10 rounded-xl p-4 border border-green-500/20">
            <div className="flex items-start gap-3">
              <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-1">
                  {isRussian ? 'Разрешено' : 'Allowed'}
                </h3>
                <p className="text-white/70 text-sm">
                  {isRussian 
                    ? 'Обмен контактами для личного использования разрешен. Платформа запрещает только коммерческую и незаконную деятельность.'
                    : 'Exchange of contacts for personal use is allowed. The platform prohibits only commercial and illegal activity.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Full Terms Link */}
        <button
          onClick={() => setShowFullTerms(true)}
          className="w-full mb-4 text-purple-400 hover:text-purple-300 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          {isRussian ? 'Прочитать полные Условия использования' : 'Read full Terms of Service'}
        </button>

        {/* Consent Checkbox */}
        <div className="mb-6">
          <label className="flex items-start gap-3 p-4 bg-white/5 border border-white/10 rounded-xl cursor-pointer hover:bg-white/10 transition-colors">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-1 w-5 h-5 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-400 focus:ring-2"
              required
            />
            <span className="text-white/90 text-sm leading-relaxed">
              {isRussian 
                ? 'Я подтверждаю, что мне исполнилось 18 лет и я принимаю Условия использования платформы Linger.'
                : 'I confirm that I am 18+ and accept the Terms of Service of the Linger platform.'}
            </span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 py-3 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors font-medium"
          >
            {isRussian ? 'Назад' : 'Back'}
          </button>
          <button
            onClick={() => handleTermsAcceptance(onAccept)}
            disabled={!termsAccepted}
            className="flex-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 py-3 rounded-xl text-white font-medium flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
          >
            {isRussian ? 'Создать аккаунт' : 'Create Account'}
          </button>
        </div>
      </div>
    </motion.div>
  );
};
