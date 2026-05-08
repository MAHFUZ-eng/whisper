import { useEffect, useRef } from "react";
import { View, Text, Pressable, Animated, Modal } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSocketStore } from "@/lib/socket";

export default function IncomingCallModal() {
  const { incomingCall, acceptCall, rejectCall, clearIncomingCall } = useSocketStore();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(300)).current;

  // Auto-dismiss if caller cancelled before we answered
  useEffect(() => {
    const socket = useSocketStore.getState().socket;
    if (!socket) return;

    const handleCancelled = ({ callId }: { callId: string }) => {
      if (incomingCall?.callId === callId) {
        slideAnim.setValue(300); // slide out immediately
        clearIncomingCall();
      }
    };
    socket.on("call:cancelled", handleCancelled);
    return () => { socket.off("call:cancelled", handleCancelled); };
  }, [incomingCall, slideAnim, clearIncomingCall]);

  useEffect(() => {
    if (incomingCall) {
      // Slide in
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60 }).start();

      // Pulse ring
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      slideAnim.setValue(300);
    }
  }, [incomingCall, pulseAnim, slideAnim]);

  if (!incomingCall) return null;

  const handleAccept = () => {
    acceptCall(incomingCall.callId, incomingCall.callerId);
    router.push({
      pathname: "/call/[id]",
      params: {
        id: incomingCall.callId,
        participantId: incomingCall.callerId,
        name: incomingCall.callerName,
        avatar: incomingCall.callerAvatar,
        callType: incomingCall.callType,
        isIncoming: "true",
      },
    });
  };

  const handleReject = () => {
    rejectCall(incomingCall.callId, incomingCall.callerId);
  };

  const isVideo = incomingCall.callType === "video";

  return (
    <Modal transparent animationType="none" statusBarTranslucent>
      <View className="flex-1 bg-black/50 justify-end">
        <Animated.View
          style={{ transform: [{ translateY: slideAnim }] }}
          className="bg-surface rounded-t-3xl px-6 pt-6 pb-12"
        >
          {/* Incoming label */}
          <Text className="text-muted-foreground text-center text-sm mb-4">
            Incoming {isVideo ? "Video" : "Voice"} Call
          </Text>

          {/* Avatar with pulse */}
          <View className="items-center mb-6">
            <View className="relative items-center justify-center">
              <Animated.View
                style={{ transform: [{ scale: pulseAnim }] }}
                className="absolute w-36 h-36 rounded-full bg-primary/10"
              />
              <Animated.View
                style={{ transform: [{ scale: pulseAnim }], opacity: 0.5 }}
                className="absolute w-28 h-28 rounded-full bg-primary/20"
              />
              <View className="w-24 h-24 rounded-full border-4 border-primary overflow-hidden">
                <Image
                  source={incomingCall.callerAvatar}
                  style={{ width: "100%", height: "100%" }}
                />
              </View>
            </View>

            <Text className="text-foreground text-2xl font-bold mt-4">
              {incomingCall.callerName}
            </Text>
            <View className="flex-row items-center mt-1 gap-1">
              <Ionicons
                name={isVideo ? "videocam" : "call"}
                size={14}
                color="#F4A261"
              />
              <Text className="text-primary text-sm">
                {isVideo ? "Video calling..." : "Voice calling..."}
              </Text>
            </View>
          </View>

          {/* Action buttons */}
          <View className="flex-row justify-center gap-16">
            {/* Reject */}
            <View className="items-center gap-2">
              <Pressable
                onPress={handleReject}
                className="w-16 h-16 rounded-full bg-red-500 items-center justify-center active:opacity-80"
              >
                <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
              </Pressable>
              <Text className="text-muted-foreground text-xs">Decline</Text>
            </View>

            {/* Accept */}
            <View className="items-center gap-2">
              <Pressable
                onPress={handleAccept}
                className="w-16 h-16 rounded-full bg-green-500 items-center justify-center active:opacity-80"
              >
                <Ionicons name={isVideo ? "videocam" : "call"} size={28} color="#fff" />
              </Pressable>
              <Text className="text-muted-foreground text-xs">Accept</Text>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
