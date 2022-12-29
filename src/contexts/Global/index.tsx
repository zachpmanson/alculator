import { ChangeEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Drink, DrinkType, FilterOptions, PackType } from "../../types";
import { GlobalContextProps, GlobalContextProvider } from "./context";

const GlobalProvider = ({ children }: { children: ReactNode }) => {
  const [allDrinks, setAllDrinks] = useState<Drink[]>([]);
  const [currentDrinks, setCurrentDrinks] = useState<Drink[]>([]);
  const [cachedDrinkLists, setCachedDrinkLists] = useState<{ [key in DrinkType]: Drink[] }>({
    beer: [],
    cider: [],
    premix: [],
    spirit: [],
  });

  const [currentFilters, setCurrentFilters] = useState<FilterOptions>({
    type: "beer",
    pack: "bottle",
    includePromo: false,
    search: "",
    sortBy: "ratio",
    order: "desc",
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
      .filter((d) => !!d.prices[fullPackname] || !!d.prices[currentFilters.pack])
      .filter((d) => !!d.strength)
      // make new entry for particular price, choose lowest price
      .map((d) => {
        return { ...d, price: Math.max(d.prices[fullPackname], d.prices[currentFilters.pack]) };
      })
      .map((d) => {
        return { ...d, ratio: d.strength / d.price };
      })
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
    }),
    [currentDrinks, currentFilters, onSearchChange]
  );

  return <GlobalContextProvider value={value}>{children}</GlobalContextProvider>;
};

export default GlobalProvider;
