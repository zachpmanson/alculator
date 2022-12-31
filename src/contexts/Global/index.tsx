import { ChangeEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Drink, DrinkType, FilterOptions, PackType } from "../../types";
import { GlobalContextProps, GlobalContextProvider } from "./context";

const GlobalProvider = ({ children }: { children: ReactNode }) => {
  const [allDrinks, setAllDrinks] = useState<Drink[]>([]);
  const [currentDrinks, setCurrentDrinks] = useState<Drink[]>([]);

  const [currentLockedDrinks, setCurrentLockedDrinks] = useState<Drink[]>([]);

  const [cachedDrinkLists, setCachedDrinkLists] = useState<{ [key in DrinkType]: Drink[] }>({
    beer: [],
    cider: [],
    premix: [],
    spirits: [],
    redwine: [],
    whitewine: [],
  });

  const [currentFilters, setCurrentFilters] = useState<FilterOptions>({
    type: "beer",
    pack: "bottle",
    includePromo: false,
    search: "",
    sortBy: "ratio",
    order: "asc",
  });

  const onSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const searchFieldString = event.target.value.toLocaleLowerCase();
      setCurrentFilters({ ...currentFilters, search: searchFieldString });
    },
    [setCurrentFilters, currentFilters]
  );

  // Updates the full drink list
  useEffect(() => {
    if (cachedDrinkLists[currentFilters.type].length === 0) {
      fetch(`/api/drinks/${currentFilters.type}`)
        .then((response) => response.json())
        .then((data) => {
          const drinkList = JSON.parse(data);
          let newCachedDrinkList = cachedDrinkLists;
          newCachedDrinkList[currentFilters.type] = drinkList;

          setCachedDrinkLists(newCachedDrinkList);
          setAllDrinks(drinkList);
        });
    } else {
      setAllDrinks(cachedDrinkLists[currentFilters.type]);
    }
  }, [currentFilters.type, cachedDrinkLists]);

  // Recalculates filtering
  useEffect(() => {
    const fullPackname = currentFilters.includePromo
      ? (("promo" + currentFilters.pack) as PackType)
      : currentFilters.pack;

    const sortBy = currentFilters.sortBy;

    // invert ordering if desc is selected
    const sortFn = (a: Drink, b: Drink) => (a[sortBy] - b[sortBy]) * (currentFilters.order === "asc" ? 1 : -1);
    console.log(allDrinks);
    const newCurrentDrinks = allDrinks
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
      .map((d) => {
        return { ...d, price: Math.max(d.prices[fullPackname], d.prices[currentFilters.pack]) };
      })
      // add ratio column
      .map((d) => {
        return { ...d, ratio: d.price / d.standardDrinks };
      })
      // filter on search query
      .filter((d) => d.name.toLocaleLowerCase().includes(currentFilters.search))
      .sort(sortFn);

    setCurrentDrinks(newCurrentDrinks);
  }, [currentFilters, allDrinks]);

  const value: GlobalContextProps = useMemo(
    () => ({
      setAllDrinks: setAllDrinks,
      currentDrinks: currentDrinks,
      setCurrentDrinks: setCurrentDrinks,
      currentFilters: currentFilters,
      setCurrentFilters: setCurrentFilters,
      onSearchChange: onSearchChange,
      currentLockedDrinks: currentLockedDrinks,
      setCurrentLockedDrinks: setCurrentLockedDrinks,
    }),
    [currentDrinks, currentFilters, onSearchChange, currentLockedDrinks]
  );

  return <GlobalContextProvider value={value}>{children}</GlobalContextProvider>;
};

export default GlobalProvider;
