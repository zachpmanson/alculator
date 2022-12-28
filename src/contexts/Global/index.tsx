import {
  ChangeEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Drink, FilterOptions } from "../../types";
import { GlobalContextProps, GlobalContextProvider } from "./context";

const GlobalProvider = ({ children }: { children: ReactNode }) => {
  const [allDrinks, setAllDrinks] = useState<Drink[]>([]);
  const [currentDrinks, setCurrentDrinks] = useState<Drink[]>([]);

  const [currentFilters, setCurrentFilters] = useState<FilterOptions>({
    type: "beer",
    pack: "sixpack",
    includePromo: false,
    search: "",
  });

  const onSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const searchFieldString = event.target.value.toLocaleLowerCase();
      setCurrentFilters({ ...currentFilters, search: searchFieldString });
    },
    [setCurrentFilters, currentFilters]
  );

  useEffect(() => {
    setCurrentDrinks(
      allDrinks.filter((a) =>
        a?.name.toLocaleLowerCase().includes(currentFilters.search)
      )
    );
  }, [currentFilters.search, allDrinks]);

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

  return (
    <GlobalContextProvider value={value}>{children}</GlobalContextProvider>
  );
};

export default GlobalProvider;
