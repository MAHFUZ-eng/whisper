import type { Request, Response, NextFunction } from "express";
import type { AuthRequest } from "../middleware/auth";
import { Message } from "../models/Message";
import { Chat } from "../models/Chat";
import { z } from "zod";

const PAGE_LIMIT = 30;

// ── GET /messages/chat/:chatId?before=<ISO>&limit=<n> ──────────────
export async function getMessages(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    const { chatId } = req.params;

    // Validate query params
    const querySchema = z.object({
      before: z.string().datetime({ offset: true }).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(PAGE_LIMIT),
    });
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid query params", errors: parsed.error.issues });
      return;
    }
    const { before, limit } = parsed.data;

    const chat = await Chat.findOne({ _id: chatId, participants: userId });
    if (!chat) {
      res.status(404).json({ message: "Chat not found or access denied" });
      return;
    }

    const filter: Record<string, unknown> = { chat: chatId };
    if (before) filter.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("sender", "name email avatar");

    // Return oldest-first so the client can append chronologically
    res.json(messages.reverse());
  } catch (error) {
    res.status(500);
    next(error);
  }
}