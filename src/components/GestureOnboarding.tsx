import { motion, AnimatePresence } from 'framer-motion';
import { X, Hand } from 'lucide-react';

interface GestureOnboardingProps {
  onDismiss: () => void;
}

export const GestureOnboarding: React.FC<GestureOnboardingProps> = ({ onDismiss }) => {
  const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="fixed bottom-24 left-4 right-4 z-50 pointer-events-auto"
      >
        <div className="bg-gradient-to-br from-purple-900/90 to-indigo-900/90 backdrop-blur-xl rounded-2xl border border-purple-400/30 p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <Hand className="w-5 h-5 text-purple-300" />
            </div>
            <div className="flex-1">
              <p className="text-white text-sm leading-relaxed">
                {isRussian 
                  ? 'Чтобы быстро переключаться между режимами, обведите экран кругом и нажмите в центр.'
                  : 'To switch modes faster, draw a circle and tap the center.'}
              </p>
            </div>
            <button
              onClick={onDismiss}
              className="flex-shrink-0 p-1 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-white/60" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
