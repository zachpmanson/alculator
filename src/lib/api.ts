import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";

// Do not expose connection strings or database error details to callers/logs.
export function withApiErrors(handler: NextApiHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        res.status(404).json({ error: "Report not found" });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  };
}
