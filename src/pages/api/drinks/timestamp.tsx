// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import cacheData from "memory-cache";
import type { NextApiRequest, NextApiResponse } from "next";
import { GenericApiError } from "../../../types";

export default async function handler(req: NextApiRequest, res: NextApiResponse<{ date: string } | GenericApiError>) {
  switch (req.method) {
    case "GET":
      let date = cacheData.get("lastUpdate");
      if (!date) {
        date = await fetch(`https://api.github.com/repos/${process.env.DATA_REPO}/branches/master`)
          .then((res) => res.json())
          .then((data) => data.commit.commit.author.date);
        cacheData.put("lastUpdate", date, 600_000);
      }
      return res.status(200).json({ date: date });
    default:
      return res.status(405).json({ error: "Invalid method" });
  }
}
