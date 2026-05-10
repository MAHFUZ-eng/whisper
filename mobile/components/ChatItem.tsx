import { Chat } from "@/types";
import { Image } from "expo-image";
import { View, Text, Pressable } from "react-native";
import { formatDistanceToNow } from "date-fns";
import { useSocketStore } from "@/lib/socket";
import { Ionicons } from "@expo/vector-icons";

const ChatItem = ({ chat, onPress }: { chat: Chat; onPress: () => void }) => {
  const participant = chat.participant;
  const { onlineUsers, typingUsers, unreadChats } = useSocketStore();

  const isOnline = onlineUsers.has(participant._id);
  const isTyping = typingUsers.get(chat._id) === participant._id;
  const hasUnread = unreadChats.has(chat._id);

  // Format last message preview
  const lastText = chat.lastMessage?.text ?? "";
  const isSystemMsg = lastText === "📞 Missed call";
  const isMissedCall = isSystemMsg;

  return (
    <Pressable className="flex-row items-center py-3 active:opacity-70" onPress={onPress}>
      {/* Avatar + online dot */}
      <View className="relative">
        <Image source={participant.avatar} style={{ width: 56, height: 56, borderRadius: 999 }} />
        {isOnline && (
          <View className="absolute bottom-0 right-0 size-4 bg-green-500 rounded-full border-[3px] border-surface" />
        )}
      </View>

      {/* Chat info */}
      <View className="flex-1 ml-4">
        <View className="flex-row items-center justify-between">
          <Text className={`text-base font-medium ${hasUnread ? "text-foreground font-semibold" : "text-foreground"}`}>
            {participant.name}
          </Text>
          <Text className={`text-xs ${hasUnread ? "text-primary font-medium" : "text-subtle-foreground"}`}>
            {chat.lastMessageAt
              ? formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: false })
              : ""}
          </Text>
        </View>

        <View className="flex-row items-center justify-between mt-1">
          <View className="flex-1 flex-row items-center mr-3 gap-1">
            {isMissedCall && (
              <Ionicons name="call" size={12} color="#EF4444" />
            )}
            {isTyping ? (
              <Text className="text-sm text-primary italic">typing...</Text>
            ) : (
              <Text
                className={`text-sm flex-1 ${
                  isMissedCall
                    ? "text-red-500"
                    : hasUnread
                    ? "text-foreground font-medium"
                    : "text-subtle-foreground"
                }`}
                numberOfLines={1}
              >
                {lastText || "No messages yet"}
              </Text>
            )}
          </View>

          {/* Unread badge — filled circle with bold dot */}
          {hasUnread && (
            <View className="w-2.5 h-2.5 bg-primary rounded-full" />
          )}
        </View>
      </View>
    </Pressable>
  );
};

export default ChatItem;