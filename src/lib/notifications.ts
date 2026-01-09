/**
 * Система уведомлений Telegram
 * Отправка мягких уведомлений через Telegram Bot API
 */

const TELEGRAM_BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_BOT_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

/**
 * Отправка уведомления пользователю через Telegram Bot API
 * @param userId - Telegram ID пользователя
 * @param message - Текст уведомления
 * @returns Promise<boolean> - Успешность отправки
 */
export async function sendTelegramNotification(userId: number, message: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.length < 20) {
    console.warn('⚠️ [sendTelegramNotification] Telegram Bot Token не настроен');
    return false;
  }

  if (!userId || !message) {
    console.warn('⚠️ [sendTelegramNotification] Отсутствуют обязательные параметры');
    return false;
  }

  try {
    const response = await fetch(`${TELEGRAM_BOT_API_URL}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: userId,
        text: message,
        parse_mode: 'HTML',
        disable_notification: false, // Мягкое уведомление (не вибрирует сильно)
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error('❌ [sendTelegramNotification] Ошибка отправки:', data);
      return false;
    }

    console.log('✅ [sendTelegramNotification] Уведомление отправлено пользователю', userId);
    return true;
  } catch (error) {
    console.error('❌ [sendTelegramNotification] Ошибка сети:', error);
    return false;
  }
}

/**
 * Уведомление о добавлении в друзья
 */
export async function notifyFriendAdded(friendId: number, friendName: string): Promise<void> {
  const isRussian = true; // Можно определить из контекста
  const message = isRussian
    ? `👋 <b>Новый друг!</b>\n\n${friendName} добавил(а) вас в друзья.`
    : `👋 <b>New Friend!</b>\n\n${friendName} added you as a friend.`;
  
  await sendTelegramNotification(friendId, message);
}

/**
 * Уведомление о новом событии друга поблизости
 */
export async function notifyNearbyFriendEvent(
  userId: number, 
  friendName: string, 
  eventText: string, 
  distance: number
): Promise<void> {
  const isRussian = true;
  const distanceText = distance < 1 
    ? `${Math.round(distance * 1000)} м`
    : `${distance.toFixed(1)} км`;
  const message = isRussian
    ? `📍 <b>Событие поблизости!</b>\n\n${friendName} создал(а) событие:\n"${eventText}"\n\nРасстояние: ${distanceText}`
    : `📍 <b>Nearby Event!</b>\n\n${friendName} created an event:\n"${eventText}"\n\nDistance: ${distanceText}`;
  
  await sendTelegramNotification(userId, message);
}

/**
 * Уведомление об отклике на событие
 */
export async function notifyEventResponse(
  creatorId: number, 
  responderName: string, 
  eventText: string
): Promise<void> {
  const isRussian = true;
  const message = isRussian
    ? `💬 <b>Новый отклик!</b>\n\n${responderName} откликнулся(ась) на ваше событие:\n"${eventText}"`
    : `💬 <b>New Response!</b>\n\n${responderName} responded to your event:\n"${eventText}"`;
  
  await sendTelegramNotification(creatorId, message);
}
