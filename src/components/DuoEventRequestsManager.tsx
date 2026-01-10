import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserCheck, UserX, Filter, Users } from 'lucide-react';
import { loadDuoEventRequests, acceptDuoEventRequest, rejectDuoEventRequest, type EventRequest } from '../lib/duoEvents';

interface DuoEventRequestsManagerProps {
  eventId: number;
  creatorId: string; // UUID
  hasSelectedParticipant: boolean;
  selectedParticipantId?: string | null;
  onParticipantSelected: () => void;
  isRussian: boolean;
}

export const DuoEventRequestsManager: React.FC<DuoEventRequestsManagerProps> = ({
  eventId,
  creatorId,
  hasSelectedParticipant,
  selectedParticipantId,
  onParticipantSelected,
  isRussian,
}) => {
  const [requests, setRequests] = useState<EventRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [genderFilter, setGenderFilter] = useState<'male' | 'female' | 'all'>('all');

  // Загрузка запросов
  useEffect(() => {
    const loadRequests = async () => {
      if (hasSelectedParticipant) return; // Не загружаем, если участник уже выбран
      
      setIsLoading(true);
      const loadedRequests = await loadDuoEventRequests(eventId, creatorId, genderFilter);
      setRequests(loadedRequests);
      setIsLoading(false);
    };

    loadRequests();
    
    // Обновляем запросы каждые 5 секунд
    const interval = setInterval(loadRequests, 5000);
    return () => clearInterval(interval);
  }, [eventId, creatorId, genderFilter, hasSelectedParticipant]);

  // Принятие запроса
  const handleAcceptRequest = async (requestId: number) => {
    const result = await acceptDuoEventRequest(requestId, eventId, creatorId);
    if (result.success) {
      setRequests([]);
      onParticipantSelected();
      
      if (window.Telegram?.WebApp?.HapticFeedback) {
        try {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        } catch (e) {
          console.warn('Haptic error:', e);
        }
      }
    } else {
      const alertMsg = result.error || (isRussian ? 'Ошибка при принятии запроса' : 'Error accepting request');
      if (window.Telegram?.WebApp?.showAlert) {
        window.Telegram.WebApp.showAlert(alertMsg);
      } else {
        alert(alertMsg);
      }
    }
  };

  // Отклонение запроса
  const handleRejectRequest = async (requestId: number) => {
    const result = await rejectDuoEventRequest(requestId, eventId, creatorId);
    if (result.success) {
      setRequests(prev => prev.filter(r => r.id !== requestId));
      
      if (window.Telegram?.WebApp?.HapticFeedback) {
        try {
          window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
        } catch (e) {
          console.warn('Haptic error:', e);
        }
      }
    }
  };

  // Если участник уже выбран
  if (hasSelectedParticipant && selectedParticipantId) {
    // Сравнение UUID (строки): приводим к строкам для надежности
    const selectedRequest = requests.find(r => String(r.user_id) === String(selectedParticipantId));
    
    return (
      <div className="space-y-3">
        <div className="p-3 bg-green-500/20 border border-green-400/30 rounded-xl">
          <div className="flex items-center gap-2 text-green-200 text-sm mb-2">
            <UserCheck size={16} />
            <span className="font-medium">
              {isRussian ? 'Участник выбран' : 'Participant selected'}
            </span>
          </div>
          {selectedRequest && (
            <div className="flex items-center gap-3 mt-2">
              {selectedRequest.user_avatar ? (
                <img 
                  src={selectedRequest.user_avatar} 
                  alt={selectedRequest.user_name || 'User'}
                  className="w-10 h-10 rounded-full object-cover border-2 border-green-400/50"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 flex items-center justify-center text-white text-sm font-bold">
                  {(selectedRequest.user_name || 'U')[0].toUpperCase()}
                </div>
              )}
              <div>
                <div className="text-white font-medium">{selectedRequest.user_name || (isRussian ? 'Пользователь' : 'User')}</div>
                {selectedRequest.user_gender && (
                  <div className="text-white/60 text-xs">
                    {selectedRequest.user_gender === 'male' 
                      ? (isRussian ? 'Мужчина' : 'Male')
                      : selectedRequest.user_gender === 'female'
                      ? (isRussian ? 'Женщина' : 'Female')
                      : ''}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Заголовок и фильтр */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-purple-300" />
          <span className="text-white/90 font-medium text-sm">
            {isRussian ? 'Заявки на участие' : 'Participation Requests'}
          </span>
          {requests.length > 0 && (
            <span className="px-2 py-0.5 bg-purple-500/30 rounded-full text-purple-200 text-xs font-medium">
              {requests.length}
            </span>
          )}
        </div>
        
        {/* Фильтр по полу */}
        {requests.length > 0 && (
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            <button
              onClick={() => setGenderFilter('all')}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                genderFilter === 'all'
                  ? 'bg-purple-500/30 text-purple-200'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              {isRussian ? 'Все' : 'All'}
            </button>
            <button
              onClick={() => setGenderFilter('male')}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                genderFilter === 'male'
                  ? 'bg-purple-500/30 text-purple-200'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              {isRussian ? 'М' : 'M'}
            </button>
            <button
              onClick={() => setGenderFilter('female')}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                genderFilter === 'female'
                  ? 'bg-purple-500/30 text-purple-200'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              {isRussian ? 'Ж' : 'F'}
            </button>
          </div>
        )}
      </div>

      {/* Список запросов */}
      {isLoading ? (
        <div className="text-center py-8 text-white/60 text-sm">
          {isRussian ? 'Загрузка заявок...' : 'Loading requests...'}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-8 text-white/60 text-sm">
          {isRussian ? 'Пока нет заявок на участие' : 'No participation requests yet'}
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          <AnimatePresence>
            {requests.map((request) => (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
              >
                {/* Аватар */}
                {request.user_avatar ? (
                  <img 
                    src={request.user_avatar} 
                    alt={request.user_name || 'User'}
                    className="w-12 h-12 rounded-full object-cover border-2 border-white/20"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 flex items-center justify-center text-white text-sm font-bold">
                    {(request.user_name || 'U')[0].toUpperCase()}
                  </div>
                )}

                {/* Информация о пользователе */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-medium text-sm truncate">
                      {request.user_name || (isRussian ? 'Пользователь' : 'User')}
                    </span>
                    {request.user_gender && (
                      <span className="px-1.5 py-0.5 bg-purple-500/20 border border-purple-400/30 rounded text-purple-200 text-[10px] font-medium whitespace-nowrap">
                        {request.user_gender === 'male' 
                          ? (isRussian ? 'М' : 'M')
                          : request.user_gender === 'female'
                          ? (isRussian ? 'Ж' : 'F')
                          : ''}
                      </span>
                    )}
                  </div>
                  <div className="text-white/50 text-xs">
                    {isRussian ? `${new Date(request.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : new Date(request.created_at).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                {/* Кнопки действий */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAcceptRequest(request.id)}
                    className="p-2 bg-green-500/20 hover:bg-green-500/30 border border-green-400/30 rounded-lg transition-colors"
                    title={isRussian ? 'Принять' : 'Accept'}
                  >
                    <UserCheck size={16} className="text-green-300" />
                  </button>
                  <button
                    onClick={() => handleRejectRequest(request.id)}
                    className="p-2 bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 rounded-lg transition-colors"
                    title={isRussian ? 'Отклонить' : 'Reject'}
                  >
                    <UserX size={16} className="text-red-300" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Подсказка */}
      <div className="text-white/40 text-xs text-center pt-2 border-t border-white/10">
        {isRussian 
          ? 'Выберите одного человека для встречи. После выбора остальные заявки будут отклонены.'
          : 'Select one person for the meeting. Other requests will be rejected after selection.'}
      </div>
    </div>
  );
};
