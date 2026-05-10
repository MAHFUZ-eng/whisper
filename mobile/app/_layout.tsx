import { Stack } from "expo-router";
import "../global.css";
import { ClerkProvider } from "@clerk/clerk-expo";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import AuthSync from "@/components/AuthSync";
import IncomingCallModal from "@/components/IncomingCallModal";
import NotificationSetup from "@/components/NotificationSetup";
import { StatusBar } from "expo-status-bar";
import * as Sentry from "@sentry/react-native";
import SocketConnection from "@/components/SocketConnection";
import Constants from "expo-constants";

// Expo Go doesn't include Sentry's native modules — skip native-only integrations
const isExpoGo = Constants.appOwnership === "expo";

Sentry.init({
  dsn: "https://6c998e045dea34a424b5cdc8b375e6b4@o4509813037137920.ingest.de.sentry.io/4510696586477648",
  sendDefaultPii: true,
  enableLogs: true,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: isExpoGo
    ? [] // No native integrations in Expo Go
    : [
        Sentry.mobileReplayIntegration(),
        Sentry.reactNativeTracingIntegration({
          traceFetch: true,
          traceXHR: true,
          enableHTTPTimings: true,
        }),
      ],
});

const queryClient = new QueryClient();

export default Sentry.wrap(function RootLayout() {
  return (
    <ClerkProvider publishableKey="pk_test_bGl0ZXJhdGUtZ29waGVyLTE4LmNsZXJrLmFjY291bnRzLmRldiQ" tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <AuthSync />
        <SocketConnection />
        <NotificationSetup />
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0D0D0F" } }}>
          <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
          <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
          <Stack.Screen
            name="new-chat"
            options={{
              animation: "slide_from_bottom",
              presentation: "modal",
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="call"
            options={{
              animation: "slide_from_bottom",
              presentation: "fullScreenModal",
              gestureEnabled: false,
            }}
          />
        </Stack>
        <IncomingCallModal />
      </QueryClientProvider>
    </ClerkProvider>
  );
});
