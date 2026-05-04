import express from "express";

import authRoutes from "./routes/authRoutes";
import chatRoutes from "./routes/chatRoutes";
import messageRoutes from "./routes/messageRoutes";
import userRoutes from "./routes/userRoutes";

const app = express();

app.use(express.json()); // parses incoming JSON requests and puts the parsed data in req.body


app.get("/health", (req, res) => {
    res.json({ status: "ok", message: "Server is running smoothly" });
});

app.use("/api/auth",authRoutes);
app.use("/api/chat",chatRoutes);
app.use("/api/messages",messageRoutes);
app.use("/api/users",userRoutes);


export default app;
