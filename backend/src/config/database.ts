import mongoose from "mongoose";

export const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI;
        if (!mongoURI) {
            throw new Error("MONGODB_URI is not defined in environment variables");
        }
        await mongoose.connect(mongoURI);
        console.log("MongoDB connected successfully");
    }
    catch (error) {
        console.error("MongoDB connection error:", error);
        process.exit(1); // Exit the process with failure
        // status code 1 means that the process exited due to an error
        // status code 0 means that the process exited successfully
    }
};