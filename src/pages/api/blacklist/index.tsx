import { withApiErrors } from "@/lib/api";
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { GenericApiError } from "@/types";

async function handler(req: NextApiRequest, res: NextApiResponse<string[] | GenericApiError>) {
  switch (req.method) {
    case "GET":
      const blacklist = await prisma.reports.findMany({
        select: {
          product_code: true,
        },
        where: {
          is_resolved: true,
          blacklisted: true,
        },
        orderBy: {
          timestamp: "asc",
        },
      });
      return res.status(200).json(blacklist.map((d) => d.product_code));
    default:
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Invalid method" });
  }
}

export default withApiErrors(handler);
