// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import { getAllDrinks } from "@/lib/drinks";
import type { NextApiRequest, NextApiResponse } from "next";
import { Drink, FilterOptions, GenericApiError, PackType } from "../../../types";

export default async function handler(req: NextApiRequest, res: NextApiResponse<Drink[] | GenericApiError>) {
  let allDrinks: Drink[];
  switch (req.method) {
    case "POST":
      const { filterOptions, pageNum, pageSize } = req.body;
      let currentFilters: FilterOptions;
      let pageNumInt: number;
      let pageSizeInt: number;
      try {
        currentFilters = filterOptions;
        pageNumInt = +pageNum;
        pageSizeInt = +pageSize;
      } catch (e) {
        return res.status(400).json({ error: `Malformed request: ${e}` });
      }
      allDrinks = await getAllDrinks(currentFilters.type);
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
      return res.status(200).json(pageSlice);
    default:
      return res.status(405).json({ error: "Invalid method" });
  }
}
