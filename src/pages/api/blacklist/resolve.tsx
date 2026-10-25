import { withApiErrors } from "@/lib/api";
import prisma from "@/lib/prisma";
import { GenericApiError } from "@/types";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const schema = z.object({
  id: z.number().int().positive().max(2147483647),
  blacklisted: z.boolean(),
  password: z.string(),
});

async function handler(req: NextApiRequest, res: NextApiResponse<GenericApiError>) {
  switch (req.method) {
    case "PATCH":
      const response = schema.safeParse(req.body);
      if (!response.success) {
        return res.status(400).json({
          error: response.error,
        });
      }
      const body = response.data;
      if (process.env.REPORT_ADMIN_PASSWORD && body.password === process.env.REPORT_ADMIN_PASSWORD) {
        await prisma.reports.update({
          where: {
            id: body.id,
          },
          data: {
            is_resolved: true,
            blacklisted: body.blacklisted,
          },
        });
        return res.status(200).end();
      } else {
        return res.status(401).json({ error: "Unauthorized" });
      }
    default:
      res.setHeader("Allow", "PATCH");
      return res.status(405).json({ error: "Invalid method" });
  }
}

export default withApiErrors(handler);
