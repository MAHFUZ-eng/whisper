import { Socket, Server as SocketServer } from "socket.io";
import { Server as HttpServer } from "http";
import { verifyToken } from "@clerk/express";
import { Message } from "../models/Message";
import { User } from "../models/User";
import { Chat } from "../models/Chat";
import { sendPushNotification } from "./pushNotifications";

interface SocketWithUserId extends Socket {
  userId: string;
}

// store online users in memory
export const onlineUsers: Map<string, Set<string>> = new Map();

export const initializeSocket = (httpServer: HttpServer) => {
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) {
    throw new Error("CLERK_SECRET_KEY is not defined in environment variables");
  }

  const allowedOrigins = [
    "http://localhost:8081",
    "http://localhost:5174",
    process.env.FRONTEND_URL,
  ].filter(Boolean) as string[];

  const io = new SocketServer(httpServer, { cors: { origin: allowedOrigins } });

  // ── Auth middleware ───────────────────────────────────────────────
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error: No token provided"));
    try {
      const session = await verifyToken(token, { secretKey: clerkSecretKey });
      const clerkId = session.sub;
      const user = await User.findOne({ clerkId });
      if (!user) return next(new Error("Authentication error: User not found"));
      (socket as SocketWithUserId).userId = user._id.toString();
      next();
    } catch {
      next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = (socket as SocketWithUserId).userId;

    // Track online presence
    const sockets = onlineUsers.get(userId) ?? new Set<string>();
    sockets.add(socket.id);
    onlineUsers.set(userId, sockets);
    socket.emit("online-users", { userIds: Array.from(onlineUsers.keys()) });
    if (sockets.size === 1) {
      socket.broadcast.emit("user-online", { userId });
    }

    socket.join(`user:${userId}`);

    // ── Chat room ─────────────────────────────────────────────────
    socket.on("leave-chat", (chatId: string) => {
      socket.leave(`chat:${chatId}`);
    });

    socket.on("join-chat", async (chatId: string) => {
      try {
        const chat = await Chat.findOne({ _id: chatId, participants: userId });
        if (!chat) {
          socket.emit("socket-error", { message: "Chat not found or access denied" });
          return;
        }
        socket.join(`chat:${chatId}`);
      } catch {
        socket.emit("socket-error", { message: "Failed to join chat" });
      }
    });

    // ── Send message ──────────────────────────────────────────────
    socket.on(
      "send-message",
      async (data: {
        chatId: string;
        text: string;
        replyTo?: { _id: string; text: string; senderName: string };
        type?: "text" | "system";
      }) => {
        try {
          const { chatId, text, replyTo, type = "text" } = data;

          const chat = await Chat.findOne({ _id: chatId, participants: userId });
          if (!chat) {
            socket.emit("socket-error", { message: "Chat not found or access denied" });
            return;
          }

          const message = await Message.create({
            chat: chatId,
            sender: userId,
            text,
            ...(replyTo && { replyTo }),
            type,
          });

          chat.lastmessage = message._id;
          chat.lastmessageAt = new Date();
          await chat.save();

          await message.populate("sender", "name email avatar");

          for (const participantId of chat.participants) {
            io.to(`user:${participantId}`).emit("new-message", { message });

            // Push notification if recipient is offline
            const recipientIdStr = participantId.toString();
            if (recipientIdStr !== userId && !onlineUsers.has(recipientIdStr)) {
              const recipient = await User.findById(recipientIdStr).select("pushToken");
              if (recipient?.pushToken) {
                const senderName = (message.sender as any).name ?? "Someone";
                await sendPushNotification({
                  to: recipient.pushToken,
                  title: senderName,
                  body: message.isDeleted ? "Deleted a message" : message.text,
                  data: {
                    screen: "chat",
                    chatId: chatId,
                    participantId: userId,
                    name: senderName,
                    avatar: (message.sender as any).avatar ?? "",
                  },
                  sound: "default",
                  channelId: "messages",
                  priority: "high",
                });
              }
            }
          }
        } catch {
          socket.emit("socket-error", { message: "Failed to send message" });
        }
      }
    );

    // ── Delete message ────────────────────────────────────────────
    socket.on(
      "delete-message",
      async (data: { messageId: string; chatId: string; deleteFor: "me" | "everyone" }) => {
        try {
          const { messageId, chatId, deleteFor } = data;

          const message = await Message.findOne({ _id: messageId, sender: userId });
          if (!message) {
            socket.emit("socket-error", { message: "Message not found or not yours" });
            return;
          }

          if (deleteFor === "everyone") {
            message.text = "This message was deleted";
            message.isDeleted = true;
            await message.save();

            const chat = await Chat.findById(chatId);
            if (chat) {
              for (const participantId of chat.participants) {
                io.to(`user:${participantId}`).emit("message-deleted", {
                  messageId,
                  chatId,
                });
              }
            }
          } else {
            // "Delete for me" — just notify the requester
            socket.emit("message-deleted", { messageId, chatId });
          }
        } catch {
          socket.emit("socket-error", { message: "Failed to delete message" });
        }
      }
    );

    // ── React to message ──────────────────────────────────────────
    socket.on(
      "react-message",
      async (data: { messageId: string; chatId: string; emoji: string }) => {
        try {
          const { messageId, chatId, emoji } = data;

          const message = await Message.findOne({ _id: messageId });
          if (!message) return;

          // Toggle: remove if already reacted with same emoji, otherwise add
          const existingIdx = message.reactions.findIndex(
            (r) => r.userId.toString() === userId && r.emoji === emoji
          );

          if (existingIdx !== -1) {
            message.reactions.splice(existingIdx, 1);
          } else {
            // Remove any previous reaction from this user first (one reaction per user)
            message.reactions = message.reactions.filter(
              (r) => r.userId.toString() !== userId
            );
            message.reactions.push({ emoji, userId: message.sender } as any);
          }
          await message.save();

          const chat = await Chat.findById(chatId);
          if (chat) {
            for (const participantId of chat.participants) {
              io.to(`user:${participantId}`).emit("message-reaction", {
                messageId,
                chatId,
                reactions: message.reactions,
              });
            }
          }
        } catch {
          socket.emit("socket-error", { message: "Failed to react to message" });
        }
      }
    );

    // ── Typing ────────────────────────────────────────────────────
    socket.on("typing", (data: { chatId: string; isTyping: boolean }) => {
      const { chatId, isTyping } = data;
      socket.to(`chat:${chatId}`).emit("typing", { userId, chatId, isTyping });
    });

    // ── Call Signaling ────────────────────────────────────────────
    socket.on(
      "call:initiate",
      async (data: {
        callId: string;
        recipientId: string;
        callType: "audio" | "video";
        callerName: string;
        callerAvatar: string;
      }) => {
        io.to(`user:${data.recipientId}`).emit("call:incoming", {
          callId: data.callId,
          callerId: userId,
          callerName: data.callerName,
          callerAvatar: data.callerAvatar,
          callType: data.callType,
        });

        // Push notification if recipient is offline or app is in background
        const recipient = await User.findById(data.recipientId).select("pushToken");
        if (recipient?.pushToken) {
          await sendPushNotification({
            to: recipient.pushToken,
            title: `📞 ${data.callerName}`,
            body: data.callType === "video" ? "Incoming video call" : "Incoming voice call",
            data: {
              screen: "call",
              callId: data.callId,
              callerId: userId,
              callerName: data.callerName,
              callerAvatar: data.callerAvatar,
              callType: data.callType,
            },
            sound: "default",
            channelId: "calls",
            priority: "high",
          });
        }
      }
    );

    socket.on("call:accept", (data: { callId: string; callerId: string }) => {
      io.to(`user:${data.callerId}`).emit("call:accepted", { callId: data.callId });
    });

    socket.on("call:reject", (data: { callId: string; callerId: string; chatId?: string }) => {
      io.to(`user:${data.callerId}`).emit("call:rejected", { callId: data.callId });
      // Log missed call in chat if chatId is provided
      if (data.chatId) {
        _insertMissedCallMessage(io, data.chatId, userId);
      }
    });

    socket.on("call:end", (data: { callId: string; recipientId: string }) => {
      io.to(`user:${data.recipientId}`).emit("call:ended", { callId: data.callId });
    });

    // Caller cancelled before callee answered — also log missed call
    socket.on(
      "call:cancel",
      (data: { callId: string; recipientId: string; chatId?: string }) => {
        io.to(`user:${data.recipientId}`).emit("call:cancelled", { callId: data.callId });
        if (data.chatId) {
          _insertMissedCallMessage(io, data.chatId, userId);
        }
      }
    );

    // ── Disconnect ────────────────────────────────────────────────
    socket.on("disconnect", async () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          // Update lastSeen
          await User.findByIdAndUpdate(userId, { lastSeen: new Date() });
        }
      }
      socket.broadcast.emit("user-offline", { userId, lastSeen: new Date().toISOString() });
    });
  });

  return io;
};

// ── Helper: insert a "Missed call" system message ────────────────────
async function _insertMissedCallMessage(io: SocketServer, chatId: string, callerId: string) {
  try {
    const chat = await Chat.findById(chatId);
    if (!chat) return;

    const message = await Message.create({
      chat: chatId,
      sender: callerId,
      text: "📞 Missed call",
      type: "system",
    });

    await message.populate("sender", "name email avatar");

    // Update chat's last message
    chat.lastmessage = message._id;
    chat.lastmessageAt = new Date();
    await chat.save();

    for (const participantId of chat.participants) {
      io.to(`user:${participantId}`).emit("new-message", { message });
    }
  } catch (err) {
    console.error("Failed to insert missed call message:", err);
  }
}