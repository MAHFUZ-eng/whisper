import { create } from "zustand";
import { io, Socket } from "socket.io-client";
import { QueryClient } from "@tanstack/react-query";
import { Chat, Message, MessageReaction, MessageSender } from "@/types";
import * as Sentry from "@sentry/react-native";

const SOCKET_URL = "https://whisper-ijeje.sevalla.app";

export interface IncomingCall {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar: string;
  callType: "audio" | "video";
}

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  onlineUsers: Set<string>;
  lastSeenMap: Map<string, string>; // userId -> ISO string
  typingUsers: Map<string, string>; // chatId -> userId
  unreadChats: Set<string>;
  currentChatId: string | null;
  queryClient: QueryClient | null;
  incomingCall: IncomingCall | null;

  connect: (token: string, queryClient: QueryClient) => void;
  disconnect: () => void;
  joinChat: (chatId: string) => void;
  leaveChat: (chatId: string) => void;
  sendMessage: (
    chatId: string,
    text: string,
    currentUser: MessageSender,
    replyTo?: { _id: string; text: string; senderName: string }
  ) => void;
  deleteMessage: (messageId: string, chatId: string, deleteFor: "me" | "everyone") => void;
  reactMessage: (messageId: string, chatId: string, emoji: string) => void;
  sendTyping: (chatId: string, isTyping: boolean) => void;
  initiateCall: (
    recipientId: string,
    callType: "audio" | "video",
    callerName: string,
    callerAvatar: string
  ) => string;
  acceptCall: (callId: string, callerId: string) => void;
  rejectCall: (callId: string, callerId: string, chatId?: string) => void;
  cancelCall: (callId: string, recipientId: string, chatId?: string) => void;
  endCall: (callId: string, recipientId: string) => void;
  clearIncomingCall: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  onlineUsers: new Set(),
  lastSeenMap: new Map(),
  typingUsers: new Map(),
  unreadChats: new Set(),
  currentChatId: null,
  queryClient: null,
  incomingCall: null,

  connect: (token, queryClient) => {
    const existingSocket = get().socket;
    if (existingSocket?.connected) return;
    if (existingSocket) existingSocket.disconnect();

    const socket = io(SOCKET_URL, { auth: { token } });

    socket.on("connect", () => {
      Sentry.logger.info("Socket connected", { socketId: socket.id });
      set({ isConnected: true });
    });

    socket.on("disconnect", () => {
      Sentry.logger.info("Socket disconnect", { socketId: socket.id });
      set({ isConnected: false });
    });

    socket.on("online-users", ({ userIds }: { userIds: string[] }) => {
      set({ onlineUsers: new Set(userIds) });
    });

    socket.on("user-online", ({ userId }: { userId: string }) => {
      set((state) => ({ onlineUsers: new Set([...state.onlineUsers, userId]) }));
    });

    socket.on("user-offline", ({ userId, lastSeen }: { userId: string; lastSeen: string }) => {
      set((state) => {
        const onlineUsers = new Set(state.onlineUsers);
        onlineUsers.delete(userId);
        const lastSeenMap = new Map(state.lastSeenMap);
        if (lastSeen) lastSeenMap.set(userId, lastSeen);
        return { onlineUsers, lastSeenMap };
      });
    });

    socket.on("socket-error", (error: { message: string }) => {
      Sentry.logger.error("Socket error occurred", { message: error.message });
    });

    // ── New message ───────────────────────────────────────────────
    socket.on("new-message", ({ message }: { message: Message }) => {
      const senderId = (message.sender as MessageSender)._id;
      const { currentChatId } = get();

      queryClient.setQueryData<Message[]>(["messages", message.chat], (old) => {
        if (!old) return [message];
        const filtered = old.filter((m) => !m._id.startsWith("temp-"));
        if (filtered.some((m) => m._id === message._id)) return filtered;
        return [...filtered, message];
      });

      queryClient.setQueryData<Chat[]>(["chats"], (oldChats) =>
        oldChats?.map((chat) => {
          if (chat._id === message.chat) {
            return {
              ...chat,
              lastMessage: {
                _id: message._id,
                text: message.isDeleted ? "This message was deleted" : message.text,
                sender: senderId,
                createdAt: message.createdAt,
              },
              lastMessageAt: message.createdAt,
            };
          }
          return chat;
        })
      );

      if (currentChatId !== message.chat) {
        const chats = queryClient.getQueryData<Chat[]>(["chats"]);
        const chat = chats?.find((c) => c._id === message.chat);
        if (chat?.participant && senderId === chat.participant._id) {
          set((state) => ({
            unreadChats: new Set([...state.unreadChats, message.chat]),
          }));
        }
      }

      set((state) => {
        const typingUsers = new Map(state.typingUsers);
        typingUsers.delete(message.chat);
        return { typingUsers };
      });
    });

    // ── Message deleted ───────────────────────────────────────────
    socket.on("message-deleted", ({ messageId, chatId }: { messageId: string; chatId: string }) => {
      queryClient.setQueryData<Message[]>(["messages", chatId], (old) =>
        old?.map((m) =>
          m._id === messageId
            ? { ...m, isDeleted: true, text: "This message was deleted" }
            : m
        )
      );
    });

    // ── Message reaction ──────────────────────────────────────────
    socket.on(
      "message-reaction",
      ({
        messageId,
        chatId,
        reactions,
      }: {
        messageId: string;
        chatId: string;
        reactions: { emoji: string; userId: string }[];
      }) => {
        queryClient.setQueryData<Message[]>(["messages", chatId], (old) =>
          old?.map((m) => (m._id === messageId ? { ...m, reactions } : m))
        );
      }
    );

    // ── Typing ────────────────────────────────────────────────────
    socket.on(
      "typing",
      ({ userId, chatId, isTyping }: { userId: string; chatId: string; isTyping: boolean }) => {
        set((state) => {
          const typingUsers = new Map(state.typingUsers);
          if (isTyping) typingUsers.set(chatId, userId);
          else typingUsers.delete(chatId);
          return { typingUsers };
        });
      }
    );

    // ── Call events ───────────────────────────────────────────────
    socket.on("call:incoming", (data: IncomingCall) => {
      set({ incomingCall: data });
    });

    socket.on("call:cancelled", ({ callId }: { callId: string }) => {
      const { incomingCall } = get();
      if (incomingCall?.callId === callId) {
        set({ incomingCall: null });
      }
    });

    set({ socket, queryClient });
  },

  // ── Actions ───────────────────────────────────────────────────────
  sendMessage: (chatId, text, currentUser, replyTo) => {
    const { socket, queryClient } = get();
    if (!socket?.connected || !queryClient) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      _id: tempId,
      chat: chatId,
      sender: currentUser,
      text,
      replyTo,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    queryClient.setQueryData<Message[]>(["messages", chatId], (old) => {
      if (!old) return [optimisticMessage];
      return [...old, optimisticMessage];
    });

    socket.emit("send-message", { chatId, text, replyTo });

    Sentry.logger.info("Message sent", { chatId, length: text.length });

    const errorHandler = (error: { message: string }) => {
      Sentry.logger.error("Failed to send message", { chatId, error: error.message });
      queryClient.setQueryData<Message[]>(["messages", chatId], (old) =>
        old ? old.filter((m) => m._id !== tempId) : []
      );
      socket.off("socket-error", errorHandler);
    };
    socket.once("socket-error", errorHandler);
  },

  deleteMessage: (messageId, chatId, deleteFor) => {
    const { socket } = get();
    socket?.emit("delete-message", { messageId, chatId, deleteFor });
  },

  reactMessage: (messageId, chatId, emoji) => {
    const { socket } = get();
    socket?.emit("react-message", { messageId, chatId, emoji });
  },

  initiateCall: (recipientId, callType, callerName, callerAvatar) => {
    const { socket } = get();
    const callId = `call-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    socket?.emit("call:initiate", { callId, recipientId, callType, callerName, callerAvatar });
    return callId;
  },

  acceptCall: (callId, callerId) => {
    const { socket } = get();
    socket?.emit("call:accept", { callId, callerId });
    set({ incomingCall: null });
  },

  rejectCall: (callId, callerId, chatId) => {
    const { socket } = get();
    socket?.emit("call:reject", { callId, callerId, chatId });
    set({ incomingCall: null });
  },

  cancelCall: (callId, recipientId, chatId) => {
    const { socket } = get();
    socket?.emit("call:cancel", { callId, recipientId, chatId });
  },

  endCall: (callId, recipientId) => {
    const { socket } = get();
    socket?.emit("call:end", { callId, recipientId });
  },

  clearIncomingCall: () => set({ incomingCall: null }),

  sendTyping: (chatId, isTyping) => {
    const { socket } = get();
    if (socket?.connected) socket.emit("typing", { chatId, isTyping });
  },

  disconnect: () => {
    const socket = get().socket;
    if (socket) {
      socket.disconnect();
      set({
        socket: null,
        isConnected: false,
        onlineUsers: new Set(),
        typingUsers: new Map(),
        unreadChats: new Set(),
        currentChatId: null,
        queryClient: null,
      });
    }
  },

  joinChat: (chatId) => {
    const socket = get().socket;
    set((state) => {
      const unreadChats = new Set(state.unreadChats);
      unreadChats.delete(chatId);
      return { currentChatId: chatId, unreadChats };
    });
    if (socket?.connected) socket.emit("join-chat", chatId);
  },

  leaveChat: (chatId) => {
    const { socket } = get();
    set({ currentChatId: null });
    if (socket?.connected) socket.emit("leave-chat", chatId);
  },
}));