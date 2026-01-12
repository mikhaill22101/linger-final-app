import { motion } from 'framer-motion';
import { Users, UserRound, Filter } from 'lucide-react';

export type ModeFilterType = 'group' | 'together' | 'both';

interface ModeFilterProps {
  value: ModeFilterType;
  onChange: (mode: ModeFilterType) => void;
}

export const ModeFilter: React.FC<ModeFilterProps> = ({ value, onChange }) => {
  const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;

  const options: { value: ModeFilterType; label: { ru: string; en: string }; icon: typeof Users }[] = [
    { 
      value: 'group', 
      label: { ru: 'Группа', en: 'Group' }, 
      icon: Users 
    },
    { 
      value: 'together', 
      label: { ru: 'Вдвоём', en: 'Together' }, 
      icon: UserRound 
    },
    { 
      value: 'both', 
      label: { ru: 'Группа + Вдвоём', en: 'Group + Together' }, 
      icon: Filter 
    },
  ];

  return (
    <div className="flex gap-2 p-2 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10">
      {options.map((option) => {
        const Icon = option.icon;
        const isActive = value === option.value;
        
        return (
          <motion.button
            key={option.value}
            onClick={() => {
              onChange(option.value);
              // Haptic feedback
              if (window.Telegram?.WebApp?.HapticFeedback) {
                try {
                  window.Telegram.WebApp.HapticFeedback.selectionChanged();
                } catch (e) {
                  console.warn('Haptic error:', e);
                }
              }
            }}
            whileTap={{ scale: 0.95 }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-medium text-sm transition-all ${
              isActive
                ? 'bg-purple-500/30 text-white border-2 border-purple-400/50'
                : 'text-white/60 border border-transparent hover:text-white hover:bg-white/10'
            }`}
          >
            <Icon size={16} />
            <span>{isRussian ? option.label.ru : option.label.en}</span>
          </motion.button>
        );
      })}
    </div>
  );
};
