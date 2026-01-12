import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle } from 'lucide-react';
import { submitReport, type ReportReason } from '../lib/moderation';
import { handleUnderageUser } from '../lib/age-verification';
import WebApp from '@twa-dev/sdk';

interface ReportUserModalProps {
  userId: string;
  userName?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ReportUserModal: React.FC<ReportUserModalProps> = ({
  userId,
  userName,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;

  const reasons: { value: ReportReason; label: { ru: string; en: string } }[] = [
    { value: 'spam', label: { ru: 'Спам', en: 'Spam' } },
    { value: 'harassment', label: { ru: 'Домогательства', en: 'Harassment' } },
    { value: 'explicit_content', label: { ru: 'Откровенный контент', en: 'Explicit Content' } },
    { value: 'commercial_activity', label: { ru: 'Коммерческая деятельность', en: 'Commercial Activity' } },
    { value: 'illegal_activity', label: { ru: 'Незаконная деятельность', en: 'Illegal Activity' } },
    { value: 'other', label: { ru: 'Другое', en: 'Other' } },
  ];

  // Special handling for underage reports - immediate ban after report
  const handleUnderageReport = async () => {
    const evidence = description || `Reported for being underage. Reason: ${reason}`;
    const result = await handleUnderageUser(userId, evidence);
    
    if (result.success) {
      const successMsg = isRussian 
        ? 'Жалоба отправлена. Аккаунт несовершеннолетнего пользователя заблокирован.' 
        : 'Report submitted. Underage user account has been banned.';
      
      if (window.Telegram?.WebApp?.showAlert) {
        WebApp.showAlert(successMsg);
      } else {
        alert(successMsg);
      }
      
      onSuccess?.();
      onClose();
    } else {
      setError(result.error || (isRussian ? 'Ошибка при обработке жалобы' : 'Error processing report'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!reason) {
      setError(isRussian ? 'Пожалуйста, выберите причину жалобы' : 'Please select a reason');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Check if this is an underage report
      // If description contains keywords indicating underage, handle specially
      const isUnderageReport = description?.toLowerCase().includes('несовершеннолетн') ||
                               description?.toLowerCase().includes('underage') ||
                               description?.toLowerCase().includes('младше 18') ||
                               description?.toLowerCase().includes('less than 18') ||
                               (description?.toLowerCase().includes('возраст') && description?.toLowerCase().includes('18'));

      if (isUnderageReport) {
        // Handle underage report - immediate ban (no admin review needed for underage)
        await handleUnderageReport();
        setIsSubmitting(false);
        return;
      }

      // Regular report - requires admin review
      const result = await submitReport(userId, reason, description || undefined);
      
      if (result.success) {
        const successMsg = isRussian 
          ? 'Жалоба отправлена на рассмотрение. Спасибо за обращение!' 
          : 'Report submitted for review. Thank you for your feedback!';
        
        if (window.Telegram?.WebApp?.showAlert) {
          WebApp.showAlert(successMsg);
        } else {
          alert(successMsg);
        }
        
        onSuccess?.();
        onClose();
      } else {
        setError(result.error || (isRussian ? 'Ошибка при отправке жалобы' : 'Error submitting report'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsSubmitting(false);
    }
  };

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
        className="bg-gradient-to-br from-gray-900 to-black rounded-3xl border border-white/10 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400" />
            <h2 className="text-xl font-bold text-white">
              {isRussian ? 'Пожаловаться на пользователя' : 'Report User'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors"
          >
            <X className="w-6 h-6 text-white/60" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {userName && (
            <p className="text-white/60 text-sm">
              {isRussian ? `Пользователь: ${userName}` : `User: ${userName}`}
            </p>
          )}

          <div>
            <label className="block text-white/70 text-sm mb-2">
              {isRussian ? 'Причина жалобы' : 'Reason for Report'}
            </label>
            <div className="space-y-2">
              {reasons.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={`w-full text-left p-3 rounded-xl transition-all ${
                    reason === r.value
                      ? 'bg-purple-500/30 text-white border-2 border-purple-400/50'
                      : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {isRussian ? r.label.ru : r.label.en}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-white/70 text-sm mb-2">
              {isRussian ? 'Описание (необязательно)' : 'Description (optional)'}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isRussian ? 'Дополнительная информация...' : 'Additional information...'}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-purple-400/50 transition-colors resize-none"
              rows={4}
              maxLength={500}
            />
            <p className="text-white/40 text-xs mt-1">
              {description.length}/500
            </p>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              {isRussian ? 'Отмена' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !reason}
              className="flex-1 bg-gradient-to-r from-red-500 to-pink-500 py-3 rounded-xl text-white font-medium hover:shadow-lg hover:shadow-red-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting
                ? (isRussian ? 'Отправка...' : 'Submitting...')
                : (isRussian ? 'Отправить жалобу' : 'Submit Report')}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};
