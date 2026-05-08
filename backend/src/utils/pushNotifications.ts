/**
 * Expo Push Notification helper
 * Uses the Expo Push API — no Firebase / APNs credentials needed for development.
 * For production you WILL need FCM (Android) + APNs (iOS) keys set in EAS.
 */

const EXPO_PUSH_URL = "https://exp.host/--/push/v2/send";

export interface PushMessage {
  to: string | string[];            // Expo push token(s)
  title: string;
  body: string;
  data?: Record<string, unknown>;   // deep-link payload, passed to notification handler
  sound?: "default" | null;
  badge?: number;
  channelId?: string;               // Android channel id
  priority?: "default" | "normal" | "high";
}

/**
 * Send one or more push notifications via Expo's push relay.
 * Silently swallows errors so a failed push never crashes a socket handler.
 */
export async function sendPushNotification(messages: PushMessage | PushMessage[]) {
  const payload = Array.isArray(messages) ? messages : [messages];

  // Filter out falsy tokens
  const valid = payload.filter(
    (m) => m.to && (Array.isArray(m.to) ? m.to.length > 0 : m.to.startsWith("ExponentPushToken"))
  );
  if (valid.length === 0) return;

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        // Add "Authorization: Bearer <access-token>" here if you use Expo's enhanced push
      },
      body: JSON.stringify(valid),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[Push] Expo API error:", res.status, text);
    }
  } catch (err) {
    console.error("[Push] Failed to send notification:", err);
  }
}
