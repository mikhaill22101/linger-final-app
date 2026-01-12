import { motion } from 'framer-motion';
import { ArrowLeft, FileText } from 'lucide-react';

interface TermsOfServiceProps {
  onBack?: () => void;
}

export const TermsOfService: React.FC<TermsOfServiceProps> = ({ onBack }) => {
  const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;

  const termsRu = {
    title: 'ПОЛЬЗОВАТЕЛЬСКОЕ СОГЛАШЕНИЕ',
    sections: [
      {
        title: '1. Общие положения',
        content: 'Приложение является технической платформой для общения и организации встреч между пользователями. Администрация приложения не участвует в личных встречах пользователей и не несет ответственности за их поведение вне платформы.'
      },
      {
        title: '2. Возрастные ограничения',
        content: 'Использование приложения разрешено только лицам, достигшим 18 лет. Пользователь подтверждает достоверность предоставленных данных о возрасте.'
      },
      {
        title: '3. Верификация',
        content: 'Верификация в приложении является добровольной и предназначена исключительно для подтверждения того, что аккаунт управляется реальным человеком.\n\nВерификация не является идентификацией личности, не требует предоставления документов и не использует государственные биометрические системы.'
      },
      {
        title: '4. Контент и ответственность',
        content: 'Пользователь самостоятельно несет ответственность за публикуемый контент и соблюдение законодательства своей страны.\n\nЗапрещено использование приложения для незаконной деятельности, а также для предложения коммерческих интимных услуг.'
      },
      {
        title: '5. Удаление аккаунта',
        content: 'Пользователь может удалить свой аккаунт в любой момент через настройки профиля.\n\nПри удалении аккаунта все персональные данные пользователя удаляются полностью либо обезличиваются без возможности восстановления, за исключением случаев, прямо предусмотренных законодательством.'
      },
      {
        title: '6. Расширенные функции',
        content: 'Некоторые функции приложения могут быть доступны на платной основе. Подробности о платных функциях и условиях их предоставления будут указаны дополнительно.\n\nTODO: Добавить конкретные условия предоставления платных функций после реализации системы платежей.'
      },
      {
        title: '7. Ограничение ответственности',
        content: 'Администрация приложения не несет ответственности за действия пользователей вне платформы и за последствия личных встреч.'
      }
    ]
  };

  const termsEn = {
    title: 'TERMS OF SERVICE',
    sections: [
      {
        title: '1. General',
        content: 'The application is a technical platform for communication and meeting organization between users. The administration does not participate in offline meetings and is not responsible for user behavior outside the platform.'
      },
      {
        title: '2. Age Requirement',
        content: 'The application is available only to users aged 18 and over. Users confirm the accuracy of their age information.'
      },
      {
        title: '3. Verification',
        content: 'Verification is optional and is intended solely to confirm that an account is operated by a real person.\n\nVerification is not identity verification, does not require documents, and does not use government biometric systems.'
      },
      {
        title: '4. Content and Responsibility',
        content: 'Users are fully responsible for the content they create and for complying with the laws of their country.\n\nIllegal activity and commercial sexual services are strictly prohibited.'
      },
      {
        title: '5. Account Deletion',
        content: 'Users may delete their account at any time via profile settings.\n\nUpon deletion, all personal data is permanently deleted or irreversibly anonymized, except where retention is required by law.'
      },
      {
        title: '6. Premium Features',
        content: 'Some application features may be available on a paid basis. Details regarding paid features and the terms of their provision will be specified separately.\n\n// TODO: Add specific terms for paid features after payment system implementation.'
      },
      {
        title: '7. Limitation of Liability',
        content: 'The administration is not responsible for offline interactions or their consequences.'
      }
    ]
  };

  const terms = isRussian ? termsRu : termsEn;

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
          <FileText size={20} className="text-purple-400" />
          <h1 className="text-lg font-semibold text-white">{terms.title}</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {terms.sections.map((section, index) => (
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
