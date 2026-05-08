import { Router } from "express";
import { authCallback, getMe, savePushToken } from "../controllers/authController";
import { protectRoute } from "../middleware/auth";

const router = Router();

router.get("/me", protectRoute, getMe);
router.post("/callback", authCallback);
router.post("/push-token", protectRoute, savePushToken);

export default router;