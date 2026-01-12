import { motion } from 'framer-motion';
import { X, Shield } from 'lucide-react';

interface CommunityRulesProps {
  onClose: () => void;
}

export const CommunityRules: React.FC<CommunityRulesProps> = ({ onClose }) => {
  const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-gradient-to-br from-gray-900 to-black rounded-3xl border border-white/10 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gradient-to-br from-gray-900 to-black border-b border-white/10 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-purple-400" />
            <h2 className="text-2xl font-bold text-white">
              {isRussian ? 'Правила сообщества' : 'Community Rules'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors"
          >
            <X className="w-6 h-6 text-white/60" />
          </button>
        </div>

        <div className="p-6 space-y-6 text-white/80 text-sm leading-relaxed">
          {isRussian ? (
            <>
              <section>
                <h3 className="text-lg font-semibold text-white mb-3">1. Уважение к другим</h3>
                <p>
                  Относитесь к другим пользователям с уважением. Запрещены оскорбления, 
                  домогательства, угрозы и дискриминация по любым признакам.
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-white mb-3">2. Запрет коммерческой деятельности</h3>
                <p>
                  Платформа предназначена для некоммерческого общения и организации встреч. 
                  Запрещены предложения платных услуг, продажа товаров, реклама и спам.
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-white mb-3">3. Возрастное ограничение 18+</h3>
                <p>
                  Только пользователи в возрасте 18 лет и старше могут использовать платформу. 
                  Ложные данные о возрасте приведут к немедленной блокировке.
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-white mb-3">4. Контент</h3>
                <p>
                  Запрещено размещение откровенного сексуального контента, материалов, 
                  нарушающих авторские права, или контента, пропагандирующего незаконную деятельность.
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-white mb-3">5. Безопасность встреч</h3>
                <p>
                  Пользователи несут полную ответственность за свою безопасность при личных встречах. 
                  Рекомендуется встречаться в публичных местах и сообщать друзьям о планах.
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-white mb-3">6. Система жалоб</h3>
                <p>
                  Если вы столкнулись с нарушением правил, используйте функцию "Пожаловаться". 
                  Модерация обрабатывает жалобы в течение 24 часов.
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-white mb-3">7. Последствия нарушений</h3>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Первое нарушение: предупреждение</li>
                  <li>Повторные нарушения: временное ограничение функций</li>
                  <li>Серьезные нарушения: постоянная блокировка</li>
                </ul>
              </section>
            </>
          ) : (
            <>
              <section>
                <h3 className="text-lg font-semibold text-white mb-3">1. Respect Others</h3>
                <p>
                  Treat other users with respect. Insults, harassment, threats, and discrimination 
                  of any kind are prohibited.
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-white mb-3">2. No Commercial Activity</h3>
                <p>
                  The platform is intended for non-commercial communication and organizing meetings. 
                  Offers of paid services, selling goods, advertising, and spam are prohibited.
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-white mb-3">3. Age Restriction 18+</h3>
                <p>
                  Only users aged 18 and above can use the platform. False age data will result 
                  in immediate account ban.
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-white mb-3">4. Content</h3>
                <p>
                  Posting explicit sexual content, copyright-infringing materials, or content 
                  promoting illegal activity is prohibited.
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-white mb-3">5. Meeting Safety</h3>
                <p>
                  Users bear full responsibility for their safety during personal meetings. 
                  It is recommended to meet in public places and inform friends about plans.
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-white mb-3">6. Reporting System</h3>
                <p>
                  If you encounter a rule violation, use the "Report" function. Moderation 
                  processes reports within 24 hours.
                </p>
              </section>

              <section>
                <h3 className="text-lg font-semibold text-white mb-3">7. Consequences of Violations</h3>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>First violation: warning</li>
                  <li>Repeated violations: temporary function restrictions</li>
                  <li>Serious violations: permanent ban</li>
                </ul>
              </section>
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-gradient-to-br from-gray-900 to-black border-t border-white/10 p-6">
          <button
            onClick={onClose}
            className="w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 py-3 rounded-xl text-white font-medium hover:shadow-lg hover:shadow-purple-500/30 transition-all"
          >
            {isRussian ? 'Понятно' : 'I Understand'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
