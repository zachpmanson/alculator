import cacheData from "memory-cache";
import { Drink, DrinkType, DrinkTypeEnum } from "@/types";
import { readFile } from "fs/promises";
import path from "path";

const scienceDir = path.join(process.cwd(), "science");

export async function getAllDrinks(type: "all" | DrinkType): Promise<Drink[]> {
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
