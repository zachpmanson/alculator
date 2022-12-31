import { ChangeEvent, createContext, Dispatch, SetStateAction, useContext } from "react";
import { Drink, FilterOptions } from "../../types";

export type GlobalContextProps = {
  setAllDrinks: Dispatch<SetStateAction<Drink[]>>;
  currentFilters: FilterOptions;
  setCurrentFilters: Dispatch<SetStateAction<FilterOptions>>;
  currentDrinks: Drink[];
  setCurrentDrinks: Dispatch<SetStateAction<Drink[]>>;
  onSearchChange: (event: ChangeEvent<HTMLInputElement>) => void;
  currentLockedDrinks: Drink[];
  setCurrentLockedDrinks: Dispatch<SetStateAction<Drink[]>>;
};

const GlobalContext = createContext<GlobalContextProps>({
  currentFilters: {
    type: "beer",
    pack: "bottle",
    includePromo: false,
    search: "",
    sortBy: "ratio",
    order: "asc",
  },
  setCurrentFilters: () => undefined,
  currentDrinks: [],
  setCurrentDrinks: () => undefined,
  setAllDrinks: () => undefined,
  onSearchChange: () => undefined,
  currentLockedDrinks: [],
  setCurrentLockedDrinks: () => undefined,
});

export const GlobalContextProvider = GlobalContext.Provider;

export const useGlobal = () => useContext(GlobalContext);
