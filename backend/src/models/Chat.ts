import mongoose,{ Schema, type Document} from "mongoose";

export interface IChat extends Document {
    participants: mongoose.Types.ObjectId[]; 
    lastmessage?: mongoose.Types.ObjectId;
    lastmessageAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const ChatSchema = new Schema<IChat>({
    participants: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
    lastmessage: { type: Schema.Types.ObjectId, ref: "Message",default: null },
    lastmessageAt: { type: Date,default:Date.now },
},
{
    timestamps: true,
}
);

export const Chat = mongoose.model<IChat>("Chat", ChatSchema);