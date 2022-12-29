import { ChangeEvent, createContext, Dispatch, SetStateAction, useContext } from "react";
import { Drink, FilterOptions } from "../../types";

export type GlobalContextProps = {
  setAllDrinks: Dispatch<SetStateAction<Drink[]>>;
  currentFilters: FilterOptions;
  setCurrentFilters: Dispatch<SetStateAction<FilterOptions>>;
  currentDrinks: Drink[];
  setCurrentDrinks: Dispatch<SetStateAction<Drink[]>>;
  onSearchChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

const GlobalContext = createContext<GlobalContextProps>({
  currentFilters: {
    type: "beer",
    pack: "sixpack",
    includePromo: false,
    search: "",
    sortBy: "ratio",
    order: "desc",
  },
  setCurrentFilters: () => undefined,
  currentDrinks: [],
  setCurrentDrinks: () => undefined,
  setAllDrinks: () => undefined,
  onSearchChange: () => undefined,
});

export const GlobalContextProvider = GlobalContext.Provider;

export const useGlobal = () => useContext(GlobalContext);
