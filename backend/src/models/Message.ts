import { text } from "express";
import mongoose,{ Schema, type Document} from "mongoose";

export interface IMessage extends Document {
    sender: mongoose.Types.ObjectId;
    chat: mongoose.Types.ObjectId;
    text: string;
    createdAt: Date;
    updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>({
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    chat: { type: Schema.Types.ObjectId, ref: "Chat", required: true },
    text: { type: String, required: true,trim: true},
}, {
    timestamps: true,
});

MessageSchema.index({ chat: 1, createdAt: 1 });

export const Message = mongoose.model<IMessage>("Message", MessageSchema);
