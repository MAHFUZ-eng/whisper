/**
 * NotificationSetup
 * - Registers for push notifications and saves the token to the backend
 * - Listens for notification taps and navigates to the correct screen
 * - Shows foreground banners even when app is open (like WhatsApp)
 */
import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useApi } from "@/lib/axios";
import { registerForPushNotifications, configureForegroundNotifications } from "@/lib/notifications";

export default function NotificationSetup() {
  const { isSignedIn } = useAuth();
  const { apiWithAuth } = useApi();
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  // Register token once when user signs in
  useEffect(() => {
    if (!isSignedIn) return;

    configureForegroundNotifications();

    registerForPushNotifications().then(async (token) => {
      if (!token) return;
      try {
        await apiWithAuth({ method: "POST", url: "/auth/push-token", data: { pushToken: token } });
        console.log("✅ Push token registered:", token);
      } catch (err) {
        console.warn("Failed to save push token:", err);
      }
    });

    // Notification received while app is in foreground — already shown as banner
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log("Foreground notification:", notification.request.content.title);
    });

    // User tapped a notification — navigate to the right screen
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        screen?: string;
        chatId?: string;
        participantId?: string;
        name?: string;
        avatar?: string;
        callId?: string;
        callerId?: string;
        callerName?: string;
        callerAvatar?: string;
        callType?: string;
      };

      if (data.screen === "chat" && data.chatId) {
        router.push({
          pathname: "/chat/[id]",
          params: {
            id: data.chatId,
            participantId: data.participantId ?? "",
            name: data.name ?? "",
            avatar: data.avatar ?? "",
          },
        });
      } else if (data.screen === "call" && data.callId) {
        router.push({
          pathname: "/call/[id]",
          params: {
            id: data.callId,
            participantId: data.callerId ?? "",
            name: data.callerName ?? "",
            avatar: data.callerAvatar ?? "",
            callType: data.callType ?? "audio",
            isIncoming: "true",
          },
        });
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [isSignedIn, apiWithAuth]);

  return null;
}
