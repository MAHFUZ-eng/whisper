import { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, Pressable, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import Constants from "expo-constants";
import {
  createAgoraRtcEngine,
  IRtcEngine,
  RtcSurfaceView,
  ChannelProfileType,
  ClientRoleType,
  VideoSourceType,
} from "react-native-agora";
import { useSocketStore } from "@/lib/socket";
import { useApi } from "@/lib/axios";

const isExpoGo = Constants.appOwnership === "expo";
const APP_ID = process.env.EXPO_PUBLIC_AGORA_APP_ID!;


// How long the caller waits before auto-cancelling (Messenger = 60s, Telegram = ~30s)
const CALL_TIMEOUT_MS = 45_000;

type CallParams = {
  id: string;           // callId used as Agora channel name
  participantId: string;
  name: string;
  avatar: string;
  callType: string;     // "audio" | "video"
  isIncoming: string;   // "true" | "false"
};

export default function CallScreen() {
  const { id: callId, participantId, name, avatar, callType, isIncoming } =
    useLocalSearchParams<CallParams>();
  const isVideo = callType === "video";
  const isCallee = isIncoming === "true";

  // ── Expo Go guard ─────────────────────────────────────────────────
  // react-native-agora requires a native development build to function.
  if (isExpoGo) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0D0D0F", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Ionicons name="call-outline" size={64} color="#F4A261" />
        <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700", marginTop: 24, textAlign: "center" }}>
          Calls not available
        </Text>
        <Text style={{ color: "#9CA3AF", marginTop: 12, textAlign: "center", lineHeight: 22 }}>
          Voice & video calls require a development build.{"\n"}
          Use <Text style={{ color: "#F4A261", fontWeight: "600" }}>eas build --profile development</Text> to test calls on your device.
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={{ marginTop: 32, backgroundColor: "#F4A261", paddingHorizontal: 28, paddingVertical: 14, borderRadius: 24 }}
        >
          <Text style={{ color: "#0D0D0F", fontWeight: "700", fontSize: 15 }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }


  const [callStatus, setCallStatus] = useState(isCallee ? "Connecting..." : "Calling...");
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [callDuration, setCallDuration] = useState(0);

  const engineRef = useRef<IRtcEngine | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const { cancelCall, endCall } = useSocketStore();
  const { apiWithAuth } = useApi();


  // ── Pulse animation while waiting ─────────────────────────────────
  useEffect(() => {
    if (!isConnected) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [isConnected, pulseAnim]);

  // ── Call duration timer ────────────────────────────────────────────
  useEffect(() => {
    if (isConnected) {
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isConnected]);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // ── Leave / end call ──────────────────────────────────────────────
  const handleLeave = useCallback(async (reason?: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      engineRef.current?.leaveChannel();
      engineRef.current?.release();
      engineRef.current = null;
    } catch {}

    // Only notify remote if we're connected (prevent double-send)
    endCall(callId, participantId);

    if (reason) setCallStatus(reason);
    // Small delay so user can read the status before screen closes
    setTimeout(() => {
      if (router.canGoBack()) router.back();
    }, reason ? 1200 : 0);
  }, [callId, participantId, endCall]);

  // ── Cancel (caller hangs up before answer) ────────────────────────
  const handleCancel = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      engineRef.current?.leaveChannel();
      engineRef.current?.release();
      engineRef.current = null;
    } catch {}
    cancelCall(callId, participantId);
    if (router.canGoBack()) router.back();
  }, [callId, participantId, cancelCall]);

  // ── Init Agora + socket listeners ─────────────────────────────────
  useEffect(() => {
    const init = async () => {

      try {
        // ── Fetch secure Agora RTC token from backend ──────────────
        let agoraToken = "";
        try {
          const { data } = await apiWithAuth<{ token: string; uid: number; appId: string }>({
            method: "POST",
            url: "/agora/token",
            data: { channelName: callId, uid: 0 },
          });
          agoraToken = data.token;
        } catch (tokenErr) {
          console.warn("Could not fetch Agora token, falling back to empty token:", tokenErr);
        }

        const engine = createAgoraRtcEngine();
        engineRef.current = engine;

        engine.initialize({
          appId: APP_ID,
          channelProfile: ChannelProfileType.ChannelProfileCommunication,
        });

        engine.registerEventHandler({
          onJoinChannelSuccess: () => {
            setIsConnected(true);
            setCallStatus("Connected");
            // Both sides are now in the channel — clear the no-answer timeout
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
          },
          onUserJoined: (_conn, uid) => setRemoteUid(uid),
          onUserOffline: () => handleLeave(),
          onError: (err) => console.warn("Agora error:", err),
        });

        if (isVideo) {
          engine.enableVideo();
          engine.startPreview();
        } else {
          engine.disableVideo();
        }
        engine.setEnableSpeakerphone(true);
        engine.joinChannel(agoraToken, callId, 0, {
          clientRoleType: ClientRoleType.ClientRoleBroadcaster,
        });
      } catch (err) {
        console.error("Agora init failed:", err);
      }
    };


    init();

    // ── Socket signal handlers ─────────────────────────────────────
    const handleCallEnded = ({ callId: cid }: { callId: string }) => {
      if (cid === callId) handleLeave("Call Ended");
    };
    const handleCallRejected = ({ callId: cid }: { callId: string }) => {
      if (cid === callId) handleLeave("Call Declined");
    };
    // Caller side: recipient accepted → just update status, Agora handles rest
    const handleCallAccepted = ({ callId: cid }: { callId: string }) => {
      if (cid === callId) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setCallStatus("Connecting...");
      }
    };

    const socket = useSocketStore.getState().socket;
    socket?.on("call:ended", handleCallEnded);
    socket?.on("call:rejected", handleCallRejected);
    socket?.on("call:accepted", handleCallAccepted);

    // ── No-answer timeout (caller side only) ──────────────────────
    if (!isCallee) {
      timeoutRef.current = setTimeout(() => {
        setCallStatus("No Answer");
        handleCancel();
      }, CALL_TIMEOUT_MS);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      socket?.off("call:ended", handleCallEnded);
      socket?.off("call:rejected", handleCallRejected);
      socket?.off("call:accepted", handleCallAccepted);
      engineRef.current?.leaveChannel();
      engineRef.current?.release();
      engineRef.current = null;
    };
  }, [handleLeave, handleCancel]);

  // ── Controls ──────────────────────────────────────────────────────
  const toggleMute = () => {
    engineRef.current?.muteLocalAudioStream(!isMuted);
    setIsMuted(!isMuted);
  };
  const toggleSpeaker = () => {
    engineRef.current?.setEnableSpeakerphone(!isSpeakerOn);
    setIsSpeakerOn(!isSpeakerOn);
  };
  const toggleCamera = () => {
    engineRef.current?.muteLocalVideoStream(!isCameraOff);
    setIsCameraOff(!isCameraOff);
  };
  const flipCamera = () => engineRef.current?.switchCamera();

  // ── End button logic: cancel if not yet connected, end if mid-call ─
  const handleEndPress = () => {
    if (isConnected) handleLeave();
    else handleCancel();
  };

  // ─────────────────────────────────────────────────────────────────
  // VIDEO CALL UI
  // ─────────────────────────────────────────────────────────────────
  if (isVideo) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {/* Remote video – full screen */}
        {remoteUid !== null ? (
          <RtcSurfaceView canvas={{ uid: remoteUid }} style={{ flex: 1 }} />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <Image source={avatar} style={{ width: 120, height: 120, borderRadius: 60 }} />
            </Animated.View>
            <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700", marginTop: 20 }}>
              {name}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.6)", marginTop: 8 }}>{callStatus}</Text>
          </View>
        )}

        {/* Local preview – PiP */}
        {!isCameraOff && (
          <View
            style={{
              position: "absolute", top: 60, right: 16,
              width: 110, height: 160, borderRadius: 16,
              overflow: "hidden", borderWidth: 2, borderColor: "rgba(255,255,255,0.3)",
            }}
          >
            <RtcSurfaceView
              canvas={{ uid: 0, sourceType: VideoSourceType.VideoSourceCamera }}
              style={{ flex: 1 }}
            />
          </View>
        )}

        {/* Controls */}
        <SafeAreaView
          edges={["bottom"]}
          style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
        >
          {isConnected && (
            <Text style={{ color: "#fff", textAlign: "center", marginBottom: 8 }}>
              {formatDuration(callDuration)}
            </Text>
          )}
          <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 20, paddingBottom: 32 }}>
            <ControlBtn icon={isMuted ? "mic-off" : "mic"} active={isMuted} onPress={toggleMute} />
            <ControlBtn icon={isCameraOff ? "videocam-off" : "videocam"} active={isCameraOff} onPress={toggleCamera} />
            <EndBtn onPress={handleEndPress} />
            <ControlBtn icon="camera-reverse" active={false} onPress={flipCamera} />
            <ControlBtn icon={isSpeakerOn ? "volume-high" : "volume-mute"} active={isSpeakerOn} onPress={toggleSpeaker} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // VOICE CALL UI
  // ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: "#0D0D0F" }}>
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "space-between", paddingVertical: 60 }}>
        {/* Top: name + status */}
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: "#fff", fontSize: 26, fontWeight: "700" }}>{name}</Text>
          <Text style={{ color: "#9CA3AF", marginTop: 8, fontSize: 15 }}>
            {isConnected ? formatDuration(callDuration) : callStatus}
          </Text>
        </View>

        {/* Centre: avatar with double pulse rings */}
        <View style={{ alignItems: "center", justifyContent: "center" }}>
          <Animated.View
            style={{
              position: "absolute",
              width: 220, height: 220, borderRadius: 110,
              backgroundColor: "rgba(244,162,97,0.08)",
              transform: [{ scale: pulseAnim }],
            }}
          />
          <Animated.View
            style={{
              position: "absolute",
              width: 175, height: 175, borderRadius: 88,
              backgroundColor: "rgba(244,162,97,0.15)",
              transform: [{ scale: pulseAnim }],
            }}
          />
          <View
            style={{
              width: 130, height: 130, borderRadius: 65,
              borderWidth: 4, borderColor: "#F4A261", overflow: "hidden",
            }}
          >
            <Image source={avatar} style={{ width: "100%", height: "100%" }} />
          </View>
        </View>

        {/* Bottom: mute / end / speaker */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 28 }}>
          <View style={{ alignItems: "center", gap: 6 }}>
            <ControlBtn icon={isMuted ? "mic-off" : "mic"} active={isMuted} onPress={toggleMute} />
            <Text style={{ color: "#6B7280", fontSize: 11 }}>{isMuted ? "Unmute" : "Mute"}</Text>
          </View>
          <View style={{ alignItems: "center", gap: 6 }}>
            <EndBtn onPress={handleEndPress} large />
            <Text style={{ color: "#6B7280", fontSize: 11 }}>
              {isConnected ? "End" : isCallee ? "Decline" : "Cancel"}
            </Text>
          </View>
          <View style={{ alignItems: "center", gap: 6 }}>
            <ControlBtn icon={isSpeakerOn ? "volume-high" : "volume-mute"} active={isSpeakerOn} onPress={toggleSpeaker} />
            <Text style={{ color: "#6B7280", fontSize: 11 }}>Speaker</Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Reusable control button ───────────────────────────────────────
function ControlBtn({ icon, active, onPress }: { icon: any; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 56, height: 56, borderRadius: 28,
        backgroundColor: active ? "#fff" : "rgba(255,255,255,0.15)",
        alignItems: "center", justifyContent: "center",
      }}
    >
      <Ionicons name={icon} size={24} color={active ? "#0D0D0F" : "#fff"} />
    </Pressable>
  );
}

function EndBtn({ onPress, large }: { onPress: () => void; large?: boolean }) {
  const size = large ? 72 : 60;
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: "#EF4444",
        alignItems: "center", justifyContent: "center",
      }}
    >
      <Ionicons name="call" size={large ? 30 : 26} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
    </Pressable>
  );
}
