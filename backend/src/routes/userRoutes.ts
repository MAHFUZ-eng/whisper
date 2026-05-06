import { Router } from "express";
import { protectRoute } from "../middleware/auth";
import { getUsers } from "../controllers/userController";


const router = Router();

// Placeholder for authentication routes


router.get("/",protectRoute, getUsers);

export default router;