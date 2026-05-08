import type { Response,NextFunction} from "express";
import type { AuthRequest } from "../middleware/auth";
import { Chat } from "../models/Chat";
import { Types } from "mongoose";

export async function getChats(req:AuthRequest,res:Response,next:NextFunction) {
    try {
        const userId = req.userId;
        const chats = await Chat.find({ participants: userId }).populate(
            "participants",
            "name email avatar"
        ).populate("lastmessage")
        .sort({lastmessageAt:-1})


       const formattedChats = chats.map(chat => {
          const otherParticipant = chat.participants.find((p: any) => p._id.toString() !== userId)
          return { 
            _id: chat._id,
            participant: otherParticipant ?? null,
            lastmessage: chat.lastmessage,
            lastmessageAt: chat.lastmessageAt,
            createdAt: chat.createdAt,
          };
       });


       res.json(formattedChats);
    } catch (error) {
        res.status(500);
        return next(error);
    }
}
export async function getOrCreateChat(req:AuthRequest,res:Response,next:NextFunction) {
    try {
        const userId = req.userId;
        const { participantId } = req.params;

        if (!participantId) {
            res.status(400).json({ message: "Participant ID is required" });
            return;
        }

        if (Array.isArray(participantId) || !Types.ObjectId.isValid(participantId)) {
            return res.status(400).json({ message: "Invalid participant ID" });
        }

        if (participantId === userId) {
            res.status(400).json({ message: "Cannot create chat with yourself" });
            return;
        }
        
        let chat = await Chat.findOne({
            participants: { $all: [userId, participantId] },
            })
            .populate("participants", "name email avatar")
            .populate("lastmessage");


            if(!chat) {
                const newChat = new Chat({ participants: [userId, participantId] });
                await newChat.save();
                chat = await newChat.populate("participants", "name email avatar");
        }


        const otherParticipant = chat.participants.find((p: any) => p._id.toString() !== userId);

        res.json({
            _id: chat._id,
            participantId: otherParticipant ?? null,
            lastmessage: chat.lastmessage,
            lastmessageAt: chat.lastmessageAt,
            createdAt: chat.createdAt,
        });
    }
        catch (error) {
            res.status(500);
            return next(error);
        }
}