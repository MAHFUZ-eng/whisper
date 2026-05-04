import mongoose,{ Schema, type Document} from "mongoose";

export interface IChat extends Document {
    participants: mongoose.Types.ObjectId[]; 
    lastmessage?: mongoose.Types.ObjectId;
    lastmessageAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const ChatSchema = new Schema<IChat>({
    participants: {
       type: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
       validate: [(v: mongoose.Types.ObjectId[]) => v.length > 0, "Chat requires at least one participant"],    },
    lastmessage: { type: Schema.Types.ObjectId, ref: "Message",default: null },
    lastmessageAt: { type: Date,default: null },
},
{
    timestamps: true,
}
);

export const Chat = mongoose.model<IChat>("Chat", ChatSchema);