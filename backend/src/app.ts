import express from "express";
import cors from "cors";
import { clerkMiddleware } from '@clerk/express'
import authRoutes from "./routes/authRoutes";
import chatRoutes from "./routes/chatRoutes";
import messageRoutes from "./routes/messageRoutes";
import userRoutes from "./routes/userRoutes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(cors({
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
}));

app.use(express.json()); // parses incoming JSON requests and puts the parsed data in req.body
app.use(clerkMiddleware())

app.get("/health", (req, res) => {
    res.json({ status: "ok", message: "Server is running smoothly" });
});

app.use("/api/auth",authRoutes);
app.use("/api/chat",chatRoutes);
app.use("/api/messages",messageRoutes);
app.use("/api/users",userRoutes);

// error handlers should be registered after all routes and other middleware so they can catch errors from them and pass them to next(err)
app.use(errorHandler);


export default app;
