import prisma from "@/lib/prisma";
import { GenericApiError } from "@/types";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const schema = z.object({
  product_code: z.string(),
});
type Schema = z.infer<typeof schema>;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ product_code: string; id: number }[] | GenericApiError>
) {
  switch (req.method) {
    case "POST":
      const response = schema.safeParse(req.body);
      if (!response.success) {
        return res.status(400).json({
          error: response.error,
        });
      }
      const body = req.body as Schema;

      await prisma.reports.create({
        data: {
          product_code: body.product_code,
          is_resolved: false,
          timestamp: Date.now(),
        },
      });
      return res.status(201);
    case "GET":
      const activeReports = await prisma.reports.findMany({
        select: {
          id: true,
          product_code: true,
        },
        where: {
          is_resolved: false,
        },
        orderBy: {
          timestamp: "asc",
        },
      });
      return res.status(200).json(activeReports);
    default:
      return res.status(405).json({ error: "Invalid method" });
  }
}
