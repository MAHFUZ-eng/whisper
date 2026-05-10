import EmptyUI from "@/components/EmptyUI";
import MessageBubble from "@/components/MessageBubble";
import { useCurrentUser } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { useSocketStore } from "@/lib/socket";
import { Message, MessageSender, ReplyTo } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  KeyboardAvoidingView,
  FlatList,
  Platform,
  ActivityIndicator,
  TextInput,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { format, isToday, isYesterday, isSameDay, formatDistanceToNow } from "date-fns";
import { GestureHandlerRootView, Swipeable } from "react-native-gesture-handler";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";

type ChatParams = {
  id: string;
  participantId: string;
  name: string;
  avatar: string;
};

// ── Date separator ─────────────────────────────────────────────────
function DateSeparator({ date }: { date: string }) {
  const d = new Date(date);
  let label: string;
  if (isToday(d)) label = "Today";
  else if (isYesterday(d)) label = "Yesterday";
  else label = format(d, "MMMM d, yyyy");

  return (
    <View className="items-center my-3">
      <View className="bg-surface-light rounded-full px-3 py-1">
        <Text className="text-subtle-foreground text-xs">{label}</Text>
      </View>
    </View>
  );
}

// ── Typing dots indicator ──────────────────────────────────────────
function TypingIndicator() {
  return (
    <View className="flex-row justify-start mb-1">
      <View className="bg-surface-card border border-surface-light rounded-2xl rounded-bl-sm px-4 py-3 flex-row items-center gap-1">
        {[0, 1, 2].map((i) => (
          <View key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground" style={{ opacity: 0.4 + i * 0.2 }} />
        ))}
      </View>
    </View>
  );
}

// ── Reply bar ──────────────────────────────────────────────────────
function ReplyBar({
  replyTo,
  onCancel,
}: {
  replyTo: ReplyTo;
  onCancel: () => void;
}) {
  return (
    <View className="flex-row items-center bg-surface-light mx-3 mb-1 rounded-2xl px-3 py-2 border-l-4 border-primary">
      <View className="flex-1">
        <Text className="text-primary text-xs font-semibold mb-0.5">{replyTo.senderName}</Text>
        <Text className="text-muted-foreground text-xs" numberOfLines={1}>{replyTo.text}</Text>
      </View>
      <Pressable onPress={onCancel} className="ml-2 p-1">
        <Ionicons name="close" size={18} color="#6B6B70" />
      </Pressable>
    </View>
  );
}

// ── Swipe-to-reply wrapper ─────────────────────────────────────────
function SwipeableMessage({
  children,
  onSwipeReply,
  isFromMe,
}: {
  children: React.ReactNode;
  onSwipeReply: () => void;
  isFromMe: boolean;
}) {
  const swipeableRef = useRef<Swipeable>(null);

  const renderLeftAction = (progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] });
    return (
      <Animated.View
        style={{ transform: [{ translateX }], justifyContent: "center", paddingLeft: 8 }}
      >
        <View className="w-8 h-8 rounded-full bg-primary/20 items-center justify-center">
          <Ionicons name="return-up-back" size={16} color="#F4A261" />
        </View>
      </Animated.View>
    );
  };

  const renderRightAction = (progress: Animated.AnimatedInterpolation<number>) => {
    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
    return (
      <Animated.View
        style={{ transform: [{ translateX }], justifyContent: "center", paddingRight: 8, alignItems: "flex-end" }}
      >
        <View className="w-8 h-8 rounded-full bg-primary/20 items-center justify-center">
          <Ionicons name="return-up-forward" size={16} color="#F4A261" />
        </View>
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      leftThreshold={40}
      rightThreshold={40}
      renderLeftActions={!isFromMe ? renderLeftAction : undefined}
      renderRightActions={isFromMe ? renderRightAction : undefined}
      onSwipeableOpen={() => {
        swipeableRef.current?.close();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSwipeReply();
      }}
    >
      {children}
    </Swipeable>
  );
}

// ── List item type ─────────────────────────────────────────────────
type ListItem =
  | { type: "message"; data: Message }
  | { type: "separator"; date: string; key: string }
  | { type: "typing"; key: string };

function buildListItems(messages: Message[]): ListItem[] {
  const items: ListItem[] = [];
  let lastDate: Date | null = null;
  for (const msg of messages) {
    const msgDate = new Date(msg.createdAt);
    if (!lastDate || !isSameDay(lastDate, msgDate)) {
      items.push({ type: "separator", date: msg.createdAt, key: `sep-${msg.createdAt}` });
      lastDate = msgDate;
    }
    items.push({ type: "message", data: msg });
  }
  return items;
}

// ── Chat detail screen ─────────────────────────────────────────────
const ChatDetailScreen = () => {
  const { id: chatId, avatar, name, participantId } = useLocalSearchParams<ChatParams>();

  const [messageText, setMessageText] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSending, setIsSending] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const { data: currentUser } = useCurrentUser();
  const {
    data: queryData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMessages(chatId);

  const messages = queryData?.messages ?? [];

  const {
    joinChat, leaveChat, sendMessage, sendMedia, sendTyping, markRead,
    isConnected, onlineUsers, typingUsers, lastSeenMap, initiateCall,
  } = useSocketStore();

  const isOnline = participantId ? onlineUsers.has(participantId) : false;
  const isTyping = typingUsers.get(chatId) === participantId;
  const lastSeen = lastSeenMap.get(participantId);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subtitle: Online / typing... / Last seen X ago
  let statusText = "Offline";
  let statusColor = "text-subtle-foreground";
  if (isTyping) { statusText = "typing..."; statusColor = "text-primary"; }
  else if (isOnline) { statusText = "Online"; statusColor = "text-green-400"; }
  else if (lastSeen) {
    statusText = `Last seen ${formatDistanceToNow(new Date(lastSeen), { addSuffix: true })}`;
  }

  useEffect(() => {
    if (chatId && isConnected) {
      joinChat(chatId);
      // Emit read receipt on entering the chat
      markRead(chatId);
    }
    return () => { if (chatId) leaveChat(chatId); };
  }, [chatId, isConnected, joinChat, leaveChat, markRead]);

  // Mark as read whenever new messages arrive while in this chat
  useEffect(() => {
    if (messages.length > 0 && isConnected) {
      markRead(chatId);
    }
  }, [messages.length, chatId, isConnected, markRead]);

  const scrollToBottom = useCallback((animated = true) => {
    flatListRef.current?.scrollToEnd({ animated });
  }, []);

  useEffect(() => {
    if (messages && messages.length > 0) setTimeout(() => scrollToBottom(), 80);
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isTyping) setTimeout(() => scrollToBottom(), 80);
  }, [isTyping, scrollToBottom]);

  const handleTyping = useCallback((text: string) => {
    setMessageText(text);
    if (!isConnected || !chatId) return;
    if (text.length > 0) {
      sendTyping(chatId, true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => sendTyping(chatId, false), 2000);
    } else {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      sendTyping(chatId, false);
    }
  }, [chatId, isConnected, sendTyping]);

  const handleSend = () => {
    if (!messageText.trim() || isSending || !isConnected || !currentUser) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTyping(chatId, false);
    setIsSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendMessage(
      chatId,
      messageText.trim(),
      { _id: currentUser._id, name: currentUser.name, email: currentUser.email, avatar: currentUser.avatar },
      replyTo ?? undefined
    );
    setMessageText("");
    setReplyTo(null);
    setIsSending(false);
    setTimeout(() => scrollToBottom(), 100);
  };

  // ── Image picker ──────────────────────────────────────────────────
  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0] || !currentUser) return;

    const asset = result.assets[0];
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    sendMedia(
      chatId,
      asset.uri,
      "image",
      { _id: currentUser._id, name: currentUser.name, email: currentUser.email, avatar: currentUser.avatar }
    );
    setTimeout(() => scrollToBottom(), 100);
  };

  const handleReply = useCallback((msg: Message) => {
    const sender = msg.sender as MessageSender;
    Haptics.selectionAsync();
    setReplyTo({ _id: msg._id, text: msg.text, senderName: sender.name ?? "Someone" });
  }, []);

  // Filter by search
  const filteredMessages = searchQuery.trim()
    ? messages.filter((m) => m.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  const listItems = buildListItems(filteredMessages);
  const listData: ListItem[] = isTyping && !searchQuery
    ? [...listItems, { type: "typing", key: "typing-indicator" }]
    : listItems;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView className="flex-1 bg-surface" edges={["top", "bottom"]}>
        {/* ── Header ─────────────────────────────────────────────── */}
        <View className="flex-row items-center px-4 py-2 bg-surface border-b border-surface-light">
          {searchVisible ? (
            <View className="flex-1 flex-row items-center bg-surface-card rounded-xl px-3 py-2 gap-2">
              <Ionicons name="search" size={16} color="#6B6B70" />
              <TextInput
                autoFocus
                placeholder="Search messages..."
                placeholderTextColor="#6B6B70"
                className="flex-1 text-foreground text-sm"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              <Pressable onPress={() => { setSearchVisible(false); setSearchQuery(""); }}>
                <Ionicons name="close" size={18} color="#6B6B70" />
              </Pressable>
            </View>
          ) : (
            <>
              <Pressable onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={24} color="#F4A261" />
              </Pressable>
              <View className="flex-row items-center flex-1 ml-2">
                {avatar && <Image source={avatar} style={{ width: 40, height: 40, borderRadius: 999 }} />}
                <View className="ml-3">
                  <Text className="text-foreground font-semibold text-base" numberOfLines={1}>{name}</Text>
                  <Text className={`text-xs ${statusColor}`}>{statusText}</Text>
                </View>
              </View>
              <View className="flex-row items-center gap-2">
                <Pressable
                  className="w-9 h-9 rounded-full items-center justify-center"
                  onPress={() => setSearchVisible(true)}
                >
                  <Ionicons name="search-outline" size={20} color="#F4A261" />
                </Pressable>
                <Pressable
                  className="w-9 h-9 rounded-full items-center justify-center"
                  onPress={() => {
                    const callId = initiateCall(participantId, "audio", name, avatar);
                    router.push({ pathname: "/call/[id]", params: { id: callId, participantId, name, avatar, callType: "audio", isIncoming: "false" } });
                  }}
                >
                  <Ionicons name="call-outline" size={20} color="#F4A261" />
                </Pressable>
                <Pressable
                  className="w-9 h-9 rounded-full items-center justify-center"
                  onPress={() => {
                    const callId = initiateCall(participantId, "video", name, avatar);
                    router.push({ pathname: "/call/[id]", params: { id: callId, participantId, name, avatar, callType: "video", isIncoming: "false" } });
                  }}
                >
                  <Ionicons name="videocam-outline" size={20} color="#F4A261" />
                </Pressable>
              </View>
            </>
          )}
        </View>

        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <View className="flex-1 bg-surface">
            {isLoading ? (
              <View className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color="#F4A261" />
              </View>
            ) : listData.length === 0 ? (
              searchQuery ? (
                <EmptyUI title="No results" subtitle={`No messages match "${searchQuery}"`} iconName="search-outline" iconColor="#6B6B70" iconSize={48} />
              ) : (
                <EmptyUI title="No messages yet" subtitle="Start the conversation!" iconName="chatbubbles-outline" iconColor="#6B6B70" iconSize={64} />
              )
            ) : (
              <FlatList
                ref={flatListRef}
                data={listData}
                keyExtractor={(item, idx) => {
                  if (item.type === "separator") return item.key;
                  if (item.type === "typing") return "typing-indicator";
                  return (item as { type: "message"; data: Message }).data._id ?? String(idx);
                }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 4 }}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() => scrollToBottom(false)}
                // ── Pagination: load older messages when reaching top ──
                onStartReached={() => {
                  if (hasNextPage && !isFetchingNextPage) fetchNextPage();
                }}
                onStartReachedThreshold={0.2}
                ListHeaderComponent={
                  isFetchingNextPage ? (
                    <View className="py-2 items-center">
                      <ActivityIndicator size="small" color="#F4A261" />
                    </View>
                  ) : null
                }
                renderItem={({ item }) => {
                  if (item.type === "separator") return <DateSeparator date={(item as any).date} />;
                  if (item.type === "typing") return <TypingIndicator />;
                  const msg = (item as { type: "message"; data: Message }).data;
                  const senderId = (msg.sender as MessageSender)._id;
                  const isFromMe = currentUser ? senderId === currentUser._id : false;
                  // isRead = the participant has read the message (their id is in readBy)
                  const isRead = isFromMe && (msg.readBy?.includes(participantId) ?? false);
                  return (
                    <SwipeableMessage isFromMe={isFromMe} onSwipeReply={() => handleReply(msg)}>
                      <MessageBubble
                        message={msg}
                        isFromMe={isFromMe}
                        isRead={isRead}
                        currentUserId={currentUser?._id ?? ""}
                        onReply={handleReply}
                      />
                    </SwipeableMessage>
                  );
                }}
              />
            )}

            {/* ── Reply bar ──────────────────────────────────────── */}
            {replyTo && (
              <ReplyBar replyTo={replyTo} onCancel={() => setReplyTo(null)} />
            )}

            {/* ── Input bar ─────────────────────────────────────── */}
            <View className="px-3 pb-3 pt-2 bg-surface border-t border-surface-light">
              <View className="flex-row items-end bg-surface-card rounded-3xl px-3 py-1.5 gap-2">
                <Pressable
                  className="w-8 h-8 rounded-full items-center justify-center"
                  onPress={handlePickImage}
                >
                  <Ionicons name="image-outline" size={22} color="#F4A261" />
                </Pressable>
                <TextInput
                  placeholder="Message"
                  placeholderTextColor="#6B6B70"
                  className="flex-1 text-foreground text-sm mb-2"
                  multiline
                  style={{ maxHeight: 100 }}
                  value={messageText}
                  onChangeText={handleTyping}
                  editable={!isSending}
                />
                <Pressable
                  className="w-8 h-8 rounded-full items-center justify-center bg-primary"
                  onPress={handleSend}
                  disabled={!messageText.trim() || isSending}
                >
                  {isSending ? (
                    <ActivityIndicator size="small" color="#0D0D0F" />
                  ) : (
                    <Ionicons name="send" size={18} color="#0D0D0F" />
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};

export default ChatDetailScreen;