import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Shield, Ban, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getUserReports } from '../lib/moderation';
import WebApp from '@twa-dev/sdk';

interface AdminModerationPanelProps {
  onClose: () => void;
  currentUserId: string;
}

interface Report {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: string;
  description?: string;
  status: string;
  created_at: string;
  reporter_name?: string;
  reported_user_name?: string;
}

export const AdminModerationPanel: React.FC<AdminModerationPanelProps> = ({
  onClose,
  currentUserId,
}) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  const isRussian = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code === 'ru' || true;

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('reports')
        .select(`
          *,
          reporter:reporter_id (full_name),
          reported:reported_user_id (full_name, is_banned, report_count)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error loading reports:', error);
        return;
      }

      setReports((data || []).map((r: any) => ({
        id: r.id,
        reporter_id: r.reporter_id,
        reported_user_id: r.reported_user_id,
        reason: r.reason,
        description: r.description,
        status: r.status,
        created_at: r.created_at,
        reporter_name: r.reporter?.full_name || 'Unknown',
        reported_user_name: r.reported?.full_name || 'Unknown',
      })));
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBanUser = async (userId: string, reason: string, requireConfirmation: boolean = true) => {
    if (!isSupabaseConfigured) return;

    // Require explicit confirmation before permanent ban
    if (requireConfirmation) {
      const confirmed = window.confirm(
        isRussian 
          ? 'Вы уверены, что хотите заблокировать этого пользователя? Это действие необратимо без разблокировки администратором.'
          : 'Are you sure you want to ban this user? This action is irreversible without admin unban.'
      );
      if (!confirmed) return;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          is_banned: true,
          banned_at: new Date().toISOString(),
          banned_reason: reason,
        })
        .eq('id', String(userId));

      if (error) {
        console.error('Error banning user:', error);
        if (window.Telegram?.WebApp?.showAlert) {
          WebApp.showAlert(isRussian ? 'Ошибка при блокировке' : 'Error banning user');
        }
        return;
      }

      // Log moderation action with full details
      await supabase
        .from('moderation_logs')
        .insert({
          moderator_id: String(currentUserId),
          target_user_id: String(userId),
          action_type: 'ban',
          reason: reason,
          details: { 
            report_id: selectedReport?.id,
            confirmed_by_moderator: true,
            ban_timestamp: new Date().toISOString(),
          },
        });

      // Update report status
      if (selectedReport) {
        await supabase
          .from('reports')
          .update({
            status: 'resolved',
            reviewed_by: String(currentUserId),
            reviewed_at: new Date().toISOString(),
            resolution: 'User banned after admin review',
          })
          .eq('id', selectedReport.id);
      }

      if (window.Telegram?.WebApp?.showAlert) {
        WebApp.showAlert(isRussian ? 'Пользователь заблокирован' : 'User banned');
      }

      loadReports();
      setSelectedReport(null);
    } catch (error) {
      console.error('Error banning user:', error);
    }
  };

  const handleDismissReport = async (reportId: string) => {
    if (!isSupabaseConfigured) return;

    try {
      const { error } = await supabase
        .from('reports')
        .update({
          status: 'dismissed',
          reviewed_by: String(currentUserId),
          reviewed_at: new Date().toISOString(),
          resolution: 'Report dismissed',
        })
        .eq('id', reportId);

      if (error) {
        console.error('Error dismissing report:', error);
        return;
      }

      loadReports();
      setSelectedReport(null);
    } catch (error) {
      console.error('Error dismissing report:', error);
    }
  };

  const handleRestrictMessaging = async (userId: string, days: number = 7) => {
    if (!isSupabaseConfigured) return;

    // Require confirmation for messaging restriction
    const confirmed = window.confirm(
      isRussian 
        ? `Ограничить отправку сообщений на ${days} дней?`
        : `Restrict messaging for ${days} days?`
    );
    if (!confirmed) return;

    try {
      const restrictedUntil = new Date();
      restrictedUntil.setDate(restrictedUntil.getDate() + days);

      const { error } = await supabase
        .from('profiles')
        .update({
          messaging_restricted: true,
          messaging_restricted_until: restrictedUntil.toISOString(),
        })
        .eq('id', String(userId));

      if (error) {
        console.error('Error restricting messaging:', error);
        return;
      }

      // Log moderation action
      await supabase
        .from('moderation_logs')
        .insert({
          moderator_id: String(currentUserId),
          target_user_id: String(userId),
          action_type: 'restrict_messaging',
          reason: `Restricted for ${days} days after admin review`,
          details: { 
            report_id: selectedReport?.id, 
            days,
            confirmed_by_moderator: true,
          },
        });

      // Update report status
      if (selectedReport) {
        await supabase
          .from('reports')
          .update({
            status: 'reviewed',
            reviewed_by: String(currentUserId),
            reviewed_at: new Date().toISOString(),
            resolution: `Messaging restricted for ${days} days`,
          })
          .eq('id', selectedReport.id);
      }

      if (window.Telegram?.WebApp?.showAlert) {
        WebApp.showAlert(
          isRussian 
            ? `Сообщения ограничены на ${days} дней` 
            : `Messaging restricted for ${days} days`
        );
      }

      loadReports();
      setSelectedReport(null);
    } catch (error) {
      console.error('Error restricting messaging:', error);
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
        className="bg-gradient-to-br from-gray-900 to-black rounded-3xl border border-white/10 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gradient-to-br from-gray-900 to-black border-b border-white/10 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-purple-400" />
            <h2 className="text-2xl font-bold text-white">
              {isRussian ? 'Панель модерации' : 'Moderation Panel'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors"
          >
            <X className="w-6 h-6 text-white/60" />
          </button>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="text-center text-white/60 py-8">
              {isRussian ? 'Загрузка...' : 'Loading...'}
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center text-white/60 py-8">
              {isRussian ? 'Нет жалоб для рассмотрения' : 'No reports to review'}
            </div>
          ) : (
            <div className="space-y-4">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="bg-white/5 border border-white/10 rounded-xl p-4 cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={() => setSelectedReport(report)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-5 h-5 text-yellow-400" />
                        <span className="text-white font-medium">
                          {isRussian ? 'Жалоба на' : 'Report on'}: {report.reported_user_name}
                        </span>
                      </div>
                      <p className="text-white/60 text-sm mb-1">
                        {isRussian ? 'Причина' : 'Reason'}: {report.reason}
                      </p>
                      <p className="text-white/40 text-xs">
                        {new Date(report.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Report Detail Modal */}
        {selectedReport && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gradient-to-br from-gray-900 to-black rounded-3xl border border-white/10 max-w-2xl w-full p-6">
              <h3 className="text-xl font-bold text-white mb-4">
                {isRussian ? 'Детали жалобы' : 'Report Details'}
              </h3>
              
              <div className="space-y-4 mb-6">
                <div>
                  <p className="text-white/60 text-sm mb-1">
                    {isRussian ? 'Жалоба на' : 'Reported User'}
                  </p>
                  <p className="text-white">{selectedReport.reported_user_name}</p>
                </div>
                <div>
                  <p className="text-white/60 text-sm mb-1">
                    {isRussian ? 'Причина' : 'Reason'}
                  </p>
                  <p className="text-white">{selectedReport.reason}</p>
                </div>
                {selectedReport.description && (
                  <div>
                    <p className="text-white/60 text-sm mb-1">
                      {isRussian ? 'Описание' : 'Description'}
                    </p>
                    <p className="text-white">{selectedReport.description}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleBanUser(selectedReport.reported_user_id, selectedReport.reason)}
                  className="flex-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 py-3 rounded-xl text-red-300 font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Ban className="w-5 h-5" />
                  {isRussian ? 'Заблокировать' : 'Ban'}
                </button>
                <button
                  onClick={() => handleRestrictMessaging(selectedReport.reported_user_id, 7)}
                  className="flex-1 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 py-3 rounded-xl text-yellow-300 font-medium transition-colors"
                >
                  {isRussian ? 'Ограничить сообщения' : 'Restrict Messaging'}
                </button>
                <button
                  onClick={() => handleDismissReport(selectedReport.id)}
                  className="flex-1 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 py-3 rounded-xl text-green-300 font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <XCircle className="w-5 h-5" />
                  {isRussian ? 'Отклонить' : 'Dismiss'}
                </button>
              </div>

              <button
                onClick={() => setSelectedReport(null)}
                className="w-full mt-4 py-3 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                {isRussian ? 'Назад' : 'Back'}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};
