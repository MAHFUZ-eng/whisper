import { create } from "zustand";
import { io, Socket } from "socket.io-client";
import { QueryClient } from "@tanstack/react-query";
import { Chat, Message, MessageReaction, MessageSender } from "@/types";
import * as Sentry from "@sentry/react-native";

const SOCKET_URL = "https://whisper-ksqnn.sevalla.app";

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
  sendMedia: (
    chatId: string,
    mediaUrl: string,
    mediaType: "image" | "video" | "audio",
    currentUser: MessageSender
  ) => void;
  deleteMessage: (messageId: string, chatId: string, deleteFor: "me" | "everyone") => void;
  reactMessage: (messageId: string, chatId: string, emoji: string) => void;
  sendTyping: (chatId: string, isTyping: boolean) => void;
  markRead: (chatId: string) => void;
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

      // useMessages uses useInfiniteQuery — data shape is { pages: Message[][], pageParams: ... }
      type InfiniteData = { pages: Message[][]; pageParams: (string | undefined)[] };
      queryClient.setQueryData<InfiniteData>(["messages", message.chat], (old) => {
        if (!old) {
          return { pages: [[message]], pageParams: [undefined] };
        }
        // Remove optimistic temp message and deduplicate, then append to last page
        const lastPage = old.pages[old.pages.length - 1] ?? [];
        const filtered = lastPage.filter(
          (m) => !m._id.startsWith("temp-") && m._id !== message._id
        );
        const newLastPage = [...filtered, message];
        const newPages = [...old.pages.slice(0, -1), newLastPage];
        return { pages: newPages, pageParams: old.pageParams };
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
    type InfData = { pages: Message[][]; pageParams: (string | undefined)[] };
    socket.on("message-deleted", ({ messageId, chatId }: { messageId: string; chatId: string }) => {
      queryClient.setQueryData<InfData>(["messages", chatId], (old) =>
        old ? { ...old, pages: old.pages.map((page) =>
          page.map((m) =>
            m._id === messageId ? { ...m, isDeleted: true, text: "This message was deleted" } : m
          )
        )} : old
      );
    });

    // ── Message reaction ──────────────────────────────────────────
    socket.on(
      "message-reaction",
      ({ messageId, chatId, reactions }: { messageId: string; chatId: string; reactions: { emoji: string; userId: string }[] }) => {
        queryClient.setQueryData<InfData>(["messages", chatId], (old) =>
          old ? { ...old, pages: old.pages.map((page) =>
            page.map((m) => m._id === messageId ? { ...m, reactions } : m)
          )} : old
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

    // ── Read receipts ─────────────────────────────────────────────
    // When the other person reads our messages, mark them as read in cache
    socket.on(
      "messages-read",
      ({ chatId, readerId }: { chatId: string; readerId: string }) => {
        queryClient.setQueryData<InfData>(["messages", chatId], (old) =>
          old ? { ...old, pages: old.pages.map((page) =>
            page.map((m) => ({
              ...m,
              readBy: m.readBy
                ? m.readBy.includes(readerId) ? m.readBy : [...m.readBy, readerId]
                : [readerId],
            }))
          )} : old
        );
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
      readBy: [currentUser._id],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    type InfData = { pages: Message[][]; pageParams: (string | undefined)[] };
    queryClient.setQueryData<InfData>(["messages", chatId], (old) => {
      if (!old) return { pages: [[optimisticMessage]], pageParams: [undefined] };
      const lastPage = old.pages[old.pages.length - 1] ?? [];
      return { ...old, pages: [...old.pages.slice(0, -1), [...lastPage, optimisticMessage]] };
    });

    socket.emit("send-message", { chatId, text, replyTo });

    Sentry.logger.info("Message sent", { chatId, length: text.length });

    const errorHandler = (error: { message: string }) => {
      Sentry.logger.error("Failed to send message", { chatId, error: error.message });
      queryClient.setQueryData<InfData>(["messages", chatId], (old) =>
        old ? { ...old, pages: old.pages.map((p) => p.filter((m) => m._id !== tempId)) } : old
      );
      socket.off("socket-error", errorHandler);
    };
    socket.once("socket-error", errorHandler);
  },

  sendMedia: (chatId, mediaUrl, mediaType, currentUser) => {
    const { socket, queryClient } = get();
    if (!socket?.connected || !queryClient) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      _id: tempId,
      chat: chatId,
      sender: currentUser,
      text: "",
      mediaUrl,
      mediaType,
      type: "media",
      readBy: [currentUser._id],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    type InfDataMedia = { pages: Message[][]; pageParams: (string | undefined)[] };
    queryClient.setQueryData<InfDataMedia>(["messages", chatId], (old) => {
      if (!old) return { pages: [[optimisticMessage]], pageParams: [undefined] };
      const lastPage = old.pages[old.pages.length - 1] ?? [];
      return { ...old, pages: [...old.pages.slice(0, -1), [...lastPage, optimisticMessage]] };
    });

    socket.emit("send-message", { chatId, text: "", type: "media", mediaUrl, mediaType });
  },

  deleteMessage: (messageId, chatId, deleteFor) => {
    const { socket } = get();
    socket?.emit("delete-message", { messageId, chatId, deleteFor });
  },

  reactMessage: (messageId, chatId, emoji) => {
    const { socket } = get();
    socket?.emit("react-message", { messageId, chatId, emoji });
  },

  markRead: (chatId) => {
    const { socket } = get();
    if (socket?.connected) socket.emit("message-read", { chatId });
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