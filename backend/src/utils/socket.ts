import { Socket,Server as SocketServer} from "socket.io";
import {Server as HttpServer} from "http";
import { verifyToken } from "@clerk/express";
import { Message } from "../models/Message";
import { User } from "../models/User";
import { Chat } from "../models/Chat";

interface SocketWithUserId extends Socket {
    userId : string;
}

// store inline users in memory for now
export const onlineUsers: Map<string, Set<string>> = new Map();

export const initializeSocket = (httpServer: HttpServer) => {

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
        throw new Error("CLERK_SECRET_KEY is not defined in environment variables");
    }
    const io = new SocketServer(httpServer, {
        cors: {
            origin: (origin, callback) => {
                // Allow any localhost port in development
                if (!origin || /^http:\/\/localhost:\d+$/.test(origin)) {
                    callback(null, true);
                } else {
                    const allowedOrigins = [
                        "http://localhost:8081",
                        process.env.FRONTEND_URL,
                    ].filter(Boolean) as string[];
                    
                    if (allowedOrigins.includes(origin)) {
                        callback(null, true);
                    } else {
                        callback(new Error("Not allowed by CORS"));
                    }
                }
            }
        }
    });
 // verify
    io.use(async (socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) 
            return next(new Error("Authentication error: No token provided"));

        try {
            const session = await verifyToken(token, {secretKey: clerkSecretKey});
            const clerkId = session.sub;
            const user = await User.findOne({clerkId});
            if (!user) return next(new Error("Authentication error: User not found"));

           (socket as SocketWithUserId).userId=user._id.toString();
            next();
        }
        // Add your token verification logic here
        catch (error) {
             next(new Error("Authentication error: Invalid token"));
        }
    });

    io.on("connection", (socket) => {
        const userId = (socket as SocketWithUserId).userId;
       const sockets = onlineUsers.get(userId) ?? new Set<string>();
 sockets.add(socket.id);
  onlineUsers.set(userId, sockets);
  socket.emit("online-users", { userIds: Array.from(onlineUsers.keys()) });
  if (sockets.size === 1) {
   socket.broadcast.emit("user-online", { userId });
  }


        socket.join(`user:${userId}`);

      
         socket.on("leave-chat",(chatId:string)=>{
            socket.leave(`chat:${chatId}`);
        });
socket.on("join-chat", async (chatId: string) => {
  try {
    const chat = await Chat.findOne({ _id: chatId, participants: userId });
    if (!chat) {
     socket.emit("Socket error", { message: "Chat not found or access denied" });
      return;
    }
    socket.join(`chat:${chatId}`);
  } catch {
   socket.emit("Socket error", { message: "Failed to join chat" });
  }
});
        socket.on("send-message", async (data: { chatId: string,text: string }) => {
            try {
                const { chatId, text } = data;
                const chat = await Chat.findOne({
                    _id: chatId,
                    participants: userId,
                });
                if (!chat) {
                    socket.emit("Socket error", { message: "Chat not found or access denied" });
                    return;
                }

                const message =  await Message.create({
                    chat: chatId,
                    sender: userId,
                    text,
                });

                chat.lastmessage = message._id;
                chat.lastmessageAt = new Date();
                await chat.save();

                await message.populate("sender", "name email avatar");

                for (const participantId of chat.participants) {
                    io.to(`user:${participantId}`).emit("new-message", {message});
                }
            }catch (error) {
                socket.emit("Socket error", { message: "Failed to send message" });
            }
          });


          socket.on("typing", async (data) => {});


          socket.on("disconnect",()=>{
              const sockets = onlineUsers.get(userId);
              if (sockets) {
                  sockets.delete(socket.id);
                  if (sockets.size === 0) {
                      onlineUsers.delete(userId);
                  }
              }

              socket.broadcast.emit("user-offline", {userId});
          });
   });
   return io;
};