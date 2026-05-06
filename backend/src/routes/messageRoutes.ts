import { Router } from "express";
import { protectRoute } from "../middleware/auth";
import { getMessages } from "../controllers/messageController";
import { Chat } from "../models/Chat";

const router = Router();

// Placeholder for authentication routes


router.get("/chat/:chatId", protectRoute, getMessages);

export default router;