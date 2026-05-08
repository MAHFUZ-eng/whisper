import { Message, MessageReaction } from "@/types";
import { View, Text, Pressable, Modal, TouchableOpacity, Alert } from "react-native";
import { format } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { useSocketStore } from "@/lib/socket";

const EMOJI_OPTIONS = ["❤️", "😂", "👍", "😮", "😢", "🔥"];

function ReactionPill({
  reactions,
  currentUserId,
  onPress,
}: {
  reactions: MessageReaction[];
  currentUserId: string;
  onPress: (emoji: string) => void;
}) {
  // Group by emoji
  const grouped = reactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
    return acc;
  }, {});

  const entries = Object.entries(grouped);
  if (entries.length === 0) return null;

  return (
    <View className="flex-row flex-wrap gap-1 mt-1">
      {entries.map(([emoji, count]) => (
        <Pressable
          key={emoji}
          onPress={() => onPress(emoji)}
          className="flex-row items-center bg-surface-light rounded-full px-2 py-0.5 gap-0.5"
        >
          <Text style={{ fontSize: 12 }}>{emoji}</Text>
          {count > 1 && (
            <Text className="text-subtle-foreground text-[10px]">{count}</Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

function MessageBubble({
  message,
  isFromMe,
  isRead,
  currentUserId,
  onReply,
}: {
  message: Message;
  isFromMe: boolean;
  isRead?: boolean;
  currentUserId: string;
  onReply: (message: Message) => void;
}) {
  const [menuVisible, setMenuVisible] = useState(false);
  const { deleteMessage, reactMessage } = useSocketStore();

  const timeStr = message.createdAt
    ? format(new Date(message.createdAt), "HH:mm")
    : "";

  const isOptimistic = message._id.startsWith("temp-");
  const isDeleted = message.isDeleted;
  const isSystem = message.type === "system";

  // ── System message (e.g. Missed call) ─────────────────────────
  if (isSystem) {
    return (
      <View className="items-center my-1">
        <View className="flex-row items-center gap-2 bg-surface-light rounded-full px-4 py-1.5">
          <Text className="text-subtle-foreground text-xs">{message.text}</Text>
          <Text className="text-subtle-foreground text-[10px]">{timeStr}</Text>
        </View>
      </View>
    );
  }

  const handleLongPress = () => setMenuVisible(true);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(message.text);
    setMenuVisible(false);
  };

  const handleReply = () => {
    onReply(message);
    setMenuVisible(false);
  };

  const handleDelete = (deleteFor: "me" | "everyone") => {
    setMenuVisible(false);
    deleteMessage(message._id, message.chat, deleteFor);
  };

  const handleReact = (emoji: string) => {
    reactMessage(message._id, message.chat, emoji);
    setMenuVisible(false);
  };

  return (
    <>
      <View className={`flex-row ${isFromMe ? "justify-end" : "justify-start"}`}>
        <View className={`max-w-[80%] ${isFromMe ? "items-end" : "items-start"}`}>

          {/* Reply-to quote */}
          {message.replyTo && !isDeleted && (
            <View
              className={`rounded-t-2xl px-3 pt-2 pb-1 mb-[-6px] w-full ${
                isFromMe
                  ? "bg-primary/60 rounded-br-sm"
                  : "bg-surface-light rounded-bl-sm"
              }`}
            >
              <Text
                className={`text-[11px] font-semibold mb-0.5 ${
                  isFromMe ? "text-surface-dark/80" : "text-primary"
                }`}
              >
                {message.replyTo.senderName}
              </Text>
              <Text
                className={`text-xs ${
                  isFromMe ? "text-surface-dark/70" : "text-muted-foreground"
                }`}
                numberOfLines={1}
              >
                {message.replyTo.text}
              </Text>
            </View>
          )}

          {/* Main bubble */}
          <Pressable
            onLongPress={handleLongPress}
            delayLongPress={300}
            className={`px-3 pt-2 pb-1.5 rounded-2xl ${
              isDeleted
                ? "bg-surface-light border border-surface-light"
                : isFromMe
                ? "bg-primary rounded-br-sm"
                : "bg-surface-card rounded-bl-sm border border-surface-light"
            } ${message.replyTo ? "rounded-t-none" : ""}`}
          >
            {isDeleted ? (
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="ban-outline" size={13} color="#6B6B70" />
                <Text className="text-subtle-foreground text-sm italic">
                  This message was deleted
                </Text>
              </View>
            ) : (
              <Text
                className={`text-sm leading-5 ${
                  isFromMe ? "text-surface-dark" : "text-foreground"
                }`}
              >
                {message.text}
              </Text>
            )}

            {/* Timestamp + status */}
            <View
              className={`flex-row items-center mt-0.5 gap-1 ${
                isFromMe ? "justify-end" : "justify-start"
              }`}
            >
              <Text
                className={`text-[10px] ${
                  isFromMe ? "text-surface-dark/60" : "text-subtle-foreground"
                }`}
              >
                {timeStr}
              </Text>
              {isFromMe && !isDeleted && (
                <View className="flex-row">
                  {isOptimistic ? (
                    <Ionicons name="time-outline" size={11} color="rgba(13,13,15,0.5)" />
                  ) : isRead ? (
                    <View className="flex-row" style={{ gap: -3 }}>
                      <Ionicons name="checkmark" size={12} color="#E76F51" />
                      <Ionicons name="checkmark" size={12} color="#E76F51" />
                    </View>
                  ) : (
                    <View className="flex-row" style={{ gap: -3 }}>
                      <Ionicons name="checkmark" size={12} color="rgba(13,13,15,0.5)" />
                      <Ionicons name="checkmark" size={12} color="rgba(13,13,15,0.5)" />
                    </View>
                  )}
                </View>
              )}
            </View>
          </Pressable>

          {/* Reactions */}
          {(message.reactions?.length ?? 0) > 0 && (
            <ReactionPill
              reactions={message.reactions!}
              currentUserId={currentUserId}
              onPress={(emoji) => reactMessage(message._id, message.chat, emoji)}
            />
          )}
        </View>
      </View>

      {/* ── Long-press context menu ─────────────────────────────── */}
      <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable
          className="flex-1 bg-black/50 justify-center items-center"
          onPress={() => setMenuVisible(false)}
        >
          <View className="bg-surface-card rounded-2xl overflow-hidden w-72 shadow-2xl">
            {/* Emoji reactions */}
            {!isDeleted && (
              <View className="flex-row justify-around px-4 py-3 border-b border-surface-light">
                {EMOJI_OPTIONS.map((emoji) => (
                  <TouchableOpacity key={emoji} onPress={() => handleReact(emoji)} className="p-1">
                    <Text style={{ fontSize: 24 }}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Actions */}
            {!isDeleted && (
              <>
                <TouchableOpacity
                  onPress={handleReply}
                  className="flex-row items-center px-4 py-3.5 border-b border-surface-light"
                >
                  <Ionicons name="return-up-back-outline" size={20} color="#F4A261" />
                  <Text className="text-foreground ml-3 font-medium">Reply</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleCopy}
                  className="flex-row items-center px-4 py-3.5 border-b border-surface-light"
                >
                  <Ionicons name="copy-outline" size={20} color="#A0A0A5" />
                  <Text className="text-foreground ml-3 font-medium">Copy</Text>
                </TouchableOpacity>
              </>
            )}

            {isFromMe && !isDeleted && (
              <>
                <TouchableOpacity
                  onPress={() => handleDelete("everyone")}
                  className="flex-row items-center px-4 py-3.5 border-b border-surface-light"
                >
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  <Text className="text-red-500 ml-3 font-medium">Delete for Everyone</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete("me")}
                  className="flex-row items-center px-4 py-3.5"
                >
                  <Ionicons name="person-remove-outline" size={20} color="#EF4444" />
                  <Text className="text-red-500 ml-3 font-medium">Delete for Me</Text>
                </TouchableOpacity>
              </>
            )}

            {(!isFromMe || isDeleted) && (
              <TouchableOpacity
                onPress={() => setMenuVisible(false)}
                className="flex-row items-center justify-center px-4 py-3.5"
              >
                <Text className="text-muted-foreground font-medium">Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export default MessageBubble;