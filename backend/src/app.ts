import express from "express";
import { clerkMiddleware } from '@clerk/express'
import authRoutes from "./routes/authRoutes";
import chatRoutes from "./routes/chatRoutes";
import messageRoutes from "./routes/messageRoutes";
import userRoutes from "./routes/userRoutes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

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
