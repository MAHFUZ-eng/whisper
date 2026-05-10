import type { Request, Response, NextFunction } from "express";
import type { AuthRequest } from "../middleware/auth";
import { RtcTokenBuilder, RtcRole } from "agora-token";
import { z } from "zod";

// ── POST /api/agora/token ──────────────────────────────────────────
// Body: { channelName: string, uid?: number }
// Returns: { token: string, uid: number, appId: string }
export async function getAgoraToken(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;

    if (!appId || !appCertificate) {
      res.status(500).json({ message: "Agora credentials not configured on server" });
      return;
    }

    const bodySchema = z.object({
      channelName: z.string().min(1).max(64),
      uid: z.number().int().nonnegative().default(0),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid request body", errors: parsed.error.issues });
      return;
    }

    const { channelName, uid } = parsed.data;

    // Token expires in 1 hour
    const expirationInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationInSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      privilegeExpiredTs,
      privilegeExpiredTs
    );

    res.json({ token, uid, appId });
  } catch (error) {
    res.status(500);
    next(error);
  }
}
