import { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, CheckCircle } from 'lucide-react';
import { sendDuoEventRequest } from '../lib/duoEvents';

interface DuoEventRequestButtonProps {
  eventId: number;
  userId: string; // UUID
  isRussian: boolean;
  onRequestSent: () => void;
}

export const DuoEventRequestButton: React.FC<DuoEventRequestButtonProps> = ({
  eventId,
  userId,
  isRussian,
  onRequestSent,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSendRequest = async () => {
    setIsLoading(true);
    
    const result = await sendDuoEventRequest(eventId, userId);
    
    if (result.success) {
      setIsSent(true);
      onRequestSent();
      
      if (window.Telegram?.WebApp?.HapticFeedback) {
        try {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        } catch (e) {
          console.warn('Haptic error:', e);
        }
      }
    } else {
      const alertMsg = result.error || (isRussian ? 'Ошибка при отправке запроса' : 'Error sending request');
      if (window.Telegram?.WebApp?.showAlert) {
        window.Telegram.WebApp.showAlert(alertMsg);
      } else {
        alert(alertMsg);
      }
    }
    
    setIsLoading(false);
  };

  if (isSent) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="p-3 bg-green-500/20 border border-green-400/30 rounded-xl"
      >
        <div className="flex items-center gap-2 text-green-200 text-sm">
          <CheckCircle size={16} />
          <span>{isRussian ? 'Запрос отправлен!' : 'Request sent!'}</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleSendRequest}
      disabled={isLoading}
      className="w-full p-3 bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 hover:from-purple-600 hover:via-pink-600 hover:to-rose-600 rounded-xl text-white font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/30"
    >
      <Heart size={18} className={isLoading ? 'animate-pulse' : ''} />
      <span>
        {isLoading 
          ? (isRussian ? 'Отправка...' : 'Sending...')
          : (isRussian ? 'Отправить запрос на участие' : 'Send participation request')}
      </span>
    </motion.button>
  );
};
