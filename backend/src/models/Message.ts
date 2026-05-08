import mongoose, { Schema, type Document } from "mongoose";

export interface IReaction {
  emoji: string;
  userId: mongoose.Types.ObjectId;
}

export interface IReplyTo {
  _id: mongoose.Types.ObjectId;
  text: string;
  senderName: string;
}

export interface IMessage extends Document {
  sender: mongoose.Types.ObjectId;
  chat: mongoose.Types.ObjectId;
  text: string;
  replyTo?: IReplyTo;
  isDeleted: boolean;
  reactions: IReaction[];
  type: "text" | "system";
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    chat: { type: Schema.Types.ObjectId, ref: "Chat", required: true },
    text: { type: String, required: true, trim: true },
    replyTo: {
      _id: { type: Schema.Types.ObjectId },
      text: { type: String },
      senderName: { type: String },
    },
    isDeleted: { type: Boolean, default: false },
    reactions: [
      {
        emoji: { type: String, required: true },
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
      },
    ],
    type: { type: String, enum: ["text", "system"], default: "text" },
  },
  { timestamps: true }
);

MessageSchema.index({ chat: 1, createdAt: 1 });

export const Message = mongoose.model<IMessage>("Message", MessageSchema);
