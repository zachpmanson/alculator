// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { readFileSync } from "fs";
import path from "path";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<string>
) {
  if (req.method !== "GET") return;
  const { type } = req.query;
  try {
    //Find the absolute path of the json directory
    const jsonDirectory = path.join(process.cwd(), "science");
    //Read the json data file data.json
    const fileContents = readFileSync(jsonDirectory + `/${type}.json`, "utf8");
    res.status(200).json(fileContents);
  } catch (err) {
    console.log("Could not access files");
    res.status(500).json("Could not access files");
  }
}
