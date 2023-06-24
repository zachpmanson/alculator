import { Drink, DrinkType, DrinkTypeEnum } from "@/types";
import cacheData from "memory-cache";

export async function getAllDrinks(type: "all" | DrinkType): Promise<Drink[]> {
  let allDrinks = cacheData.get("allDrinks");
  if (!allDrinks) {
    const values = await Promise.all(
      Object.values(DrinkTypeEnum).map((drink) =>
        fetch(`https://raw.githubusercontent.com/pavo-etc/alculator-data/master/${drink}.json`).then((res) =>
          res.json()
        )
      )
    );
    allDrinks = {};
    Object.values(DrinkTypeEnum).forEach((drink, i) => {
      allDrinks[drink] = values[i];
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
