import { Router } from "express";
import { protectRoute } from "../middleware/auth";
import { getAgoraToken } from "../controllers/agoraController";

const router = Router();

router.post("/token", protectRoute, getAgoraToken);

export default router;
