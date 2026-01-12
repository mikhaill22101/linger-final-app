import { motion } from 'framer-motion';
import { ArrowLeft, Shield } from 'lucide-react';

interface PrivacyPolicyProps {
  onBack?: () => void;
}

export const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onBack }) => {
  const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;

  const policyRu = {
    title: 'ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ',
    sections: [
      {
        title: '1. Обработка данных',
        content: 'Приложение обрабатывает персональные данные в минимально необходимом объеме и исключительно для предоставления сервиса.'
      },
      {
        title: '2. Верификация',
        content: 'Изображения используются только для подтверждения того, что аккаунт управляется реальным человеком.\n\nПо возможности обработка выполняется на устройстве пользователя.\n\nИзображения не хранятся без необходимости и не передаются третьим лицам.'
      },
      {
        title: '3. Удаление данных',
        content: 'Пользователь имеет право удалить аккаунт в любой момент.\n\nПри удалении аккаунта все персональные данные удаляются полностью либо обезличиваются без возможности восстановления.'
      },
      {
        title: '4. Передача данных',
        content: 'Приложение не передает персональные данные государственным системам и не использует государственные биометрические сервисы.'
      }
    ]
  };

  const policyEn = {
    title: 'PRIVACY POLICY',
    sections: [
      {
        title: '1. Data Processing',
        content: 'The application processes personal data only to the extent necessary to provide the service.'
      },
      {
        title: '2. Verification',
        content: 'Images are used solely to confirm that an account is operated by a real person.\n\nWhenever possible, processing is performed on the user\'s device.\n\nImages are not stored unnecessarily and are not shared with third parties.'
      },
      {
        title: '3. Data Deletion',
        content: 'Users may delete their account at any time.\n\nUpon deletion, all personal data is permanently deleted or irreversibly anonymized.'
      },
      {
        title: '4. Data Sharing',
        content: 'The application does not transfer personal data to government systems and does not use government biometric services.'
      }
    ]
  };

  const policy = isRussian ? policyRu : policyEn;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center gap-4">
        {onBack ? (
          <button
            onClick={onBack}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>
        ) : (
          <button
            onClick={() => window.history.back()}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>
        )}
        <div className="flex items-center gap-2">
          <Shield size={20} className="text-purple-400" />
          <h1 className="text-lg font-semibold text-white">{policy.title}</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {policy.sections.map((section, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6"
          >
            <h2 className="text-xl font-semibold text-white mb-4">
              {section.title}
            </h2>
            <div className="text-white/80 leading-relaxed whitespace-pre-line">
              {section.content}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
