import mongoose, { Schema, type Document } from "mongoose";

export interface Iuser extends Document {
    clerkId: string;
    email: string;
    password: string;
    name: string;
    avatar: string;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema = new Schema<Iuser>({
clerkId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    avatar: { type: String, default: "" },
},{
    timestamps: true,
}
);

export const User = mongoose.model<Iuser>("User", UserSchema);