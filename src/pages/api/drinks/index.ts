// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import { Drink, DrinkType, DrinkTypeEnum, FilterOptions, PackType } from "../../../types";

import cacheData from "memory-cache";
import path from "path";
import { readFile } from "fs/promises";

const scienceDir = path.join(process.cwd(), "science");

export default async function handler(req: NextApiRequest, res: NextApiResponse<string>) {
  if (req.method !== "POST") res.status(500).json("Must be POST");

  const { filterOptions, pageNum, pageSize } = req.body;
  console.log(filterOptions, pageNum, pageSize);
  let currentFilters: FilterOptions;
  let pageNumInt: number;
  let pageSizeInt: number;
  try {
    currentFilters = filterOptions;
    pageNumInt = +pageNum;
    pageSizeInt = +pageSize;
  } catch (e) {
    res.status(400).json(`Malformed request: ${e}`);
    return;
  }
  const allDrinks = await getAllDrinks(currentFilters.type);
  console.log("allDrinks.length", allDrinks.length);
  // let currentDrinks = type === "all" ? Object.values(process.env.allDrinks).flat() : process.env.allDrinks[type];
  const sortBy = currentFilters.sortBy;
  const fullPackname = currentFilters.includePromo
    ? (("promo" + currentFilters.pack) as PackType)
    : currentFilters.pack;

  // invert ordering if desc is selected
  const sortFn = (a: Drink, b: Drink) => (a[sortBy] - b[sortBy]) * (currentFilters.order === "asc" ? 1 : -1);
  const filteredDrinks = allDrinks
    .filter((d) => !!d)
    // check either price exists
    .filter((d) => !!d.standardDrinks)
    .filter((d) => !!d.prices[fullPackname] || !!d.prices[currentFilters.pack])
    // remove cases without unit counts
    .filter((d) => currentFilters.pack !== "case" || !!d.units.case)
    // remove packs without unit counts
    .filter((d) => currentFilters.pack !== "pack" || !!d.units.pack)
    // Calculates full standardDrinks standardDrinks
    .map((d) => {
      let standardDrinks = d.standardDrinks;
      if (currentFilters.pack === "case") {
        standardDrinks = standardDrinks * d.units.case;
      } else if (currentFilters.pack === "pack") {
        standardDrinks = standardDrinks * d.units.pack;
      }
      return { ...d, standardDrinks: standardDrinks };
    })
    // make new entry for particular price, choose lowest price
    .map((d) => ({ ...d, price: Math.max(d.prices[fullPackname], d.prices[currentFilters.pack]) }))
    // add ratio column
    .map((d) => ({ ...d, ratio: d.price / d.standardDrinks }))
    // filter on search query
    .filter((d) => d.name.toLocaleLowerCase().includes(currentFilters.search))
    .sort(sortFn);

  const pageSlice = filteredDrinks.slice((pageNumInt - 1) * pageSizeInt, pageNumInt * pageSizeInt);
  console.log("pageSlice.length", pageSlice.length);
  console.log(
    "pageSlice",
    pageSlice.map((p) => p.name)
  );
  res.status(200).send(JSON.stringify(pageSlice));
}

async function getAllDrinks(type: "all" | DrinkType): Promise<Drink[]> {
  let allDrinks = cacheData.get("allDrinks");
  if (!allDrinks) {
    const values = await Promise.all(
      Object.values(DrinkTypeEnum).map(async (drink) => readFile(`${scienceDir}/${drink}.json`, "utf-8"))
    );
    allDrinks = {};
    Object.values(DrinkTypeEnum).forEach((drink, i) => {
      allDrinks[drink] = JSON.parse(values[i]);
    });
    cacheData.put("allDrinks", allDrinks, 3600_000);
  } else {
    console.log("Using cache");
  }

  if (type === "all") {
    return Object.values(allDrinks).flat() as Drink[];
  } else {
    return allDrinks[type];
  }
}
