// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ product_code: string }[] | { error: string }>
) {
  if (req.method === "POST") {
    console.log(req.body);
    if (req.body["product_code"] === undefined) {
      res.status(400).json({ error: "Must have product_code" });
      return;
    }
    await prisma.reports.create({
      data: {
        product_code: Array.isArray(req.body["product_code"]) ? req.body["product_code"][0] : req.body["product_code"],
        is_resolved: false,
        timestamp: Date.now(),
      },
    });
    res.status(200);
  } else if (req.method === "GET") {
    const activeReports = await prisma.reports.findMany({
      select: {
        product_code: true,
      },
      where: {
        is_resolved: false,
      },
      orderBy: {
        timestamp: "asc",
      },
    });
    res.status(200).json(activeReports);
  } else {
    res.status(400).json({ error: "Must be POST or GET" });
    return;
  }
}
