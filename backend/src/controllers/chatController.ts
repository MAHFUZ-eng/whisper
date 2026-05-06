import type { Request,Response,NextFunction} from "express";
import type { AuthRequest } from "../middleware/auth";
import { Chat } from "../models/Chat";

export async function getChats(req:AuthRequest,res:Response,next:NextFunction) {
    try {
        const userId = req.userId;
        const chats = await Chat.find({ participants: userId }).populate(
            "participant",
            "name email avatar"
        ).populate("lastmessage")
        .sort({lastMessageAt:-1})


       const formattedChats = chats.map(chat => {
          const otherParticipant = chat.participants.find((p: any) => p._id.toString() !== userId)
          return { 
            _id: chat._id,
            participant: otherParticipant,
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
            __id: chat._id,
            participantId: otherParticipant ?? null,
            letmessage: chat.lastmessage,
            lastmessageAt: chat.lastmessageAt,
            createdAt: chat.createdAt,
        });
    }
        catch (error) {
            res.status(500);
            return next(error);
        }
}