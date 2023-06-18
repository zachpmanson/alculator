import prisma from "@/lib/prisma";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const schema = z.object({
  id: z.number(),
  blacklisted: z.boolean(),
  password: z.string(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse<{ error: string | z.ZodError<any> }>) {
  switch (req.method) {
    case "PATCH":
      const response = schema.safeParse(req.body);
      if (!response.success) {
        return res.status(400).json({
          error: response.error,
        });
      }
      const body = response.data;
      if (body.password === process.env.REPORT_ADMIN_PASSWORD) {
        console.debug("password correct");
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
      return res.status(405).json({ error: "Invalid method" });
  }
}
