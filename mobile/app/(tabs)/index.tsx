import ChatItem from "@/components/ChatItem";
import EmptyUI from "@/components/EmptyUI";
import { useChats } from "@/hooks/useChats";
import { Chat } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ChatsTab = () => {
  const router = useRouter();
  const { data: chats, isLoading, error, refetch } = useChats();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredChats = searchQuery.trim()
    ? (chats ?? []).filter((c) =>
        c.participant.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : chats ?? [];

  if (isLoading) {
    return (
      <View className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator size={"large"} color={"#f4A261"} />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-surface items-center justify-center">
        <Text className="text-red-500 text-base mb-2">Failed to load chats</Text>
        <Pressable onPress={() => refetch()} className="mt-2 px-5 py-2.5 bg-primary rounded-xl">
          <Text className="text-surface-dark font-semibold">Retry</Text>
        </Pressable>
      </View>
    );
  }

  const handleChatPress = (chat: Chat) => {
    router.push({
      pathname: "/chat/[id]",
      params: {
        id: chat._id,
        participantId: chat.participant._id,
        name: chat.participant.name,
        avatar: chat.participant.avatar,
      },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      <FlatList
        data={filteredChats}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <ChatItem chat={item} onPress={() => handleChatPress(item)} />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ListHeaderComponent={
          <>
            <Header onNewChat={() => router.push("/new-chat")} />
            {/* Search bar */}
            <View className="flex-row items-center bg-surface-card rounded-2xl px-3 py-2.5 mb-3 gap-2">
              <Ionicons name="search" size={16} color="#6B6B70" />
              <TextInput
                placeholder="Search conversations..."
                placeholderTextColor="#6B6B70"
                className="flex-1 text-foreground text-sm"
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery("")}>
                  <Ionicons name="close-circle" size={16} color="#6B6B70" />
                </Pressable>
              )}
            </View>
          </>
        }
        ListEmptyComponent={
          searchQuery ? (
            <EmptyUI
              title="No results"
              subtitle={`No conversations match "${searchQuery}"`}
              iconName="search-outline"
              iconColor="#6B6B70"
              iconSize={48}
            />
          ) : (
            <EmptyUI
              title="No chats yet"
              subtitle="Start a conversation!"
              iconName="chatbubbles-outline"
              iconColor="#6B6B70"
              iconSize={64}
              buttonLabel="New Chat"
              onPressButton={() => router.push("/new-chat")}
            />
          )
        }
      />
    </SafeAreaView>
  );
};

export default ChatsTab;

function Header({ onNewChat }: { onNewChat: () => void }) {
  return (
    <View className="px-1 pt-2 pb-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-2xl font-bold text-foreground">Chats</Text>
        <Pressable
          className="size-10 bg-primary rounded-full items-center justify-center"
          onPress={onNewChat}
        >
          <Ionicons name="create-outline" size={20} color="#0D0D0F" />
        </Pressable>
      </View>
    </View>
  );
}