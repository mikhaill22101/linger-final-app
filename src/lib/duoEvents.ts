import { supabase, isSupabaseConfigured } from './supabase';

export interface EventRequest {
  id: number;
  event_id: number;
  user_id: string; // UUID из Supabase Auth (единый ID)
  user_name?: string;
  user_avatar?: string;
  user_gender?: 'male' | 'female' | 'prefer_not_to_say' | null;
  created_at: string;
  status: 'pending' | 'accepted' | 'rejected';
}

/**
 * Отправить запрос на участие в Duo-событии
 */
export const sendDuoEventRequest = async (
  eventId: number,
  userId: string // UUID
): Promise<{ success: boolean; error?: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    // Проверяем, является ли событие Duo-событием
    const { data: event, error: eventError } = await supabase
      .from('impulses')
      .select('id, is_duo_event, creator_id, selected_participant_id')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return { success: false, error: 'Event not found' };
    }

    if (!event.is_duo_event) {
      return { success: false, error: 'Event is not a Duo event' };
    }

    // Сравнение UUID (строки): приводим к строкам для надежности
    if (String(event.creator_id) === String(userId)) {
      return { success: false, error: 'You are the creator of this event' };
    }

    if (event.selected_participant_id) {
      return { success: false, error: 'Event already has a selected participant' };
    }

    // Проверяем, не отправлен ли уже запрос
    const { data: existingRequest } = await supabase
      .from('event_requests')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single();

    if (existingRequest) {
      return { success: false, error: 'Request already sent' };
    }

    // Получаем данные пользователя
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url, gender')
      .eq('id', userId)
      .single();

    // Создаем запрос
    const { error: insertError } = await supabase
      .from('event_requests')
      .insert({
        event_id: eventId,
        user_id: userId,
        user_name: userProfile?.full_name || undefined,
        user_avatar: userProfile?.avatar_url || undefined,
        user_gender: userProfile?.gender || null,
        status: 'pending',
      });

    if (insertError) {
      console.error('Error sending event request:', insertError);
      return { success: false, error: insertError.message };
    }

    // Отправляем уведомление создателю события
    // TODO: Реализовать уведомления

    return { success: true };
  } catch (error) {
    console.error('Failed to send event request:', error);
    return { success: false, error: 'Unknown error' };
  }
};

/**
 * Загрузить запросы на участие в Duo-событии
 */
export const loadDuoEventRequests = async (
  eventId: number,
  creatorId: string, // UUID
  genderFilter?: 'male' | 'female' | 'all'
): Promise<EventRequest[]> => {
  if (!isSupabaseConfigured) {
    return [];
  }

  try {
    // Проверяем, является ли пользователь создателем события
    const { data: event } = await supabase
      .from('impulses')
      .select('creator_id')
      .eq('id', eventId)
      .single();

    // Сравнение UUID (строки): приводим к строкам для надежности
    if (!event || String(event.creator_id) !== String(creatorId)) {
      return [];
    }

    let query = supabase
      .from('event_requests')
      .select('*')
      .eq('event_id', eventId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    // Применяем фильтр по полу
    if (genderFilter && genderFilter !== 'all') {
      query = query.eq('user_gender', genderFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error loading event requests:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Failed to load event requests:', error);
    return [];
  }
};

/**
 * Принять запрос на участие в Duo-событии
 */
export const acceptDuoEventRequest = async (
  requestId: number,
  eventId: number,
  creatorId: string // UUID
): Promise<{ success: boolean; error?: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    // Проверяем, является ли пользователь создателем события
    const { data: event } = await supabase
      .from('impulses')
      .select('creator_id, selected_participant_id')
      .eq('id', eventId)
      .single();

    // Сравнение UUID (строки): приводим к строкам для надежности
    if (!event || String(event.creator_id) !== String(creatorId)) {
      return { success: false, error: 'Unauthorized' };
    }

    if (event.selected_participant_id) {
      return { success: false, error: 'Event already has a selected participant' };
    }

    // Получаем запрос
    const { data: request } = await supabase
      .from('event_requests')
      .select('user_id')
      .eq('id', requestId)
      .eq('event_id', eventId)
      .eq('status', 'pending')
      .single();

    if (!request) {
      return { success: false, error: 'Request not found' };
    }

    // Обновляем статус запроса на accepted
    const { error: updateError } = await supabase
      .from('event_requests')
      .update({ status: 'accepted' })
      .eq('id', requestId);

    if (updateError) {
      console.error('Error accepting request:', updateError);
      return { success: false, error: updateError.message };
    }

    // Отклоняем все остальные запросы
    await supabase
      .from('event_requests')
      .update({ status: 'rejected' })
      .eq('event_id', eventId)
      .neq('id', requestId)
      .eq('status', 'pending');

    // Обновляем событие, устанавливая выбранного участника
    const { error: eventUpdateError } = await supabase
      .from('impulses')
      .update({ selected_participant_id: request.user_id })
      .eq('id', eventId);

    if (eventUpdateError) {
      console.error('Error updating event:', eventUpdateError);
      return { success: false, error: eventUpdateError.message };
    }

    // Отправляем уведомление выбранному участнику
    // TODO: Реализовать уведомления

    return { success: true };
  } catch (error) {
    console.error('Failed to accept event request:', error);
    return { success: false, error: 'Unknown error' };
  }
};

/**
 * Отклонить запрос на участие в Duo-событии
 */
export const rejectDuoEventRequest = async (
  requestId: number,
  eventId: number,
  creatorId: string // UUID
): Promise<{ success: boolean; error?: string }> => {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Database not configured' };
  }

  try {
    // Проверяем, является ли пользователь создателем события
    const { data: event } = await supabase
      .from('impulses')
      .select('creator_id')
      .eq('id', eventId)
      .single();

    // Сравнение UUID (строки): приводим к строкам для надежности
    if (!event || String(event.creator_id) !== String(creatorId)) {
      return { success: false, error: 'Unauthorized' };
    }

    // Обновляем статус запроса на rejected
    const { error: updateError } = await supabase
      .from('event_requests')
      .update({ status: 'rejected' })
      .eq('id', requestId)
      .eq('event_id', eventId);

    if (updateError) {
      console.error('Error rejecting request:', updateError);
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to reject event request:', error);
    return { success: false, error: 'Unknown error' };
  }
};
