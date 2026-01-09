import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as notifications from './notifications';

describe('notifyNearbyFriendEvent', () => {
  const sendTelegramNotificationSpy = vi.spyOn(notifications, 'sendTelegramNotification');

  beforeEach(() => {
    sendTelegramNotificationSpy.mockResolvedValue(true);
  });

  it('formats distance in meters when distance < 1 km', async () => {
    await notifications.notifyNearbyFriendEvent(123, 'Alice', 'Coffee meetup', 0.5);

    expect(sendTelegramNotificationSpy).toHaveBeenCalledTimes(1);
    const [, message] = sendTelegramNotificationSpy.mock.calls[0];

    expect(message).toContain('Alice');
    expect(message).toContain('Coffee meetup');
    expect(message).toMatch(/500 м/);
  });

  it('formats distance in kilometers with one decimal when distance >= 1 km', async () => {
    await notifications.notifyNearbyFriendEvent(123, 'Bob', 'Park walk', 3.25);

    expect(sendTelegramNotificationSpy).toHaveBeenCalledTimes(1);
    const [, message] = sendTelegramNotificationSpy.mock.calls[0];

    expect(message).toContain('Bob');
    expect(message).toContain('Park walk');
    expect(message).toMatch(/3\.3 км/);
  });
});
