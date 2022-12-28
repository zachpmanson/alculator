import { ChangeEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Drink, FilterOptions, PackType } from "../../types";
import { GlobalContextProps, GlobalContextProvider } from "./context";

const GlobalProvider = ({ children }: { children: ReactNode }) => {
  const [allDrinks, setAllDrinks] = useState<Drink[]>([]);
  const [currentDrinks, setCurrentDrinks] = useState<Drink[]>([]);

  const [currentFilters, setCurrentFilters] = useState<FilterOptions>({
    type: "beer",
    pack: "sixpack",
    includePromo: false,
    search: ""
  });

  const onSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const searchFieldString = event.target.value.toLocaleLowerCase();
      setCurrentFilters({ ...currentFilters, search: searchFieldString });
    },
    [setCurrentFilters, currentFilters]
  );

  useEffect(() => {
    console.log("Filter updated");
    fetch(`/api/drinks/${currentFilters.type}`)
      .then((response) => response.json())
      .then((data) => {
        setAllDrinks(JSON.parse(data));
      });
  }, [currentFilters.type]);

  useEffect(() => {
    const fullPackname = currentFilters.includePromo
      ? (("promo" + currentFilters.pack) as PackType)
      : currentFilters.pack;
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
      // sort on ratio
      .sort((a, b) => b.ratio - a.ratio);

    setCurrentDrinks(newCurrentDrinks);
  }, [currentFilters, allDrinks]);

  const value: GlobalContextProps = useMemo(
    () => ({
      setAllDrinks: setAllDrinks,
      currentDrinks: currentDrinks,
      setCurrentDrinks: setCurrentDrinks,
      currentFilters: currentFilters,
      setCurrentFilters: setCurrentFilters,
      onSearchChange: onSearchChange
    }),
    [currentDrinks, currentFilters, onSearchChange]
  );

  return <GlobalContextProvider value={value}>{children}</GlobalContextProvider>;
};

export default GlobalProvider;
