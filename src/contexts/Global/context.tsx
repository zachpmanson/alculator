import { ChangeEvent, createContext, Dispatch, SetStateAction, useContext } from "react";
import { Drink, FilterOptions } from "../../types";

export type GlobalContextProps = {
  done: boolean;
  currentFilters: FilterOptions;
  setCurrentFilters: Dispatch<SetStateAction<FilterOptions>>;
  currentPage: number;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  currentDrinks: Drink[];
  setCurrentDrinks: Dispatch<SetStateAction<Drink[]>>;
  onSearchChange: (event: ChangeEvent<HTMLInputElement>) => void;
  currentLockedDrinks: Drink[];
  setCurrentLockedDrinks: Dispatch<SetStateAction<Drink[]>>;
};

const GlobalContext = createContext<GlobalContextProps>({
  done: false,
  currentFilters: {
    type: "all",
    pack: "bottle",
    includePromo: false,
    search: "",
    sortBy: "ratio",
    order: "asc",
  },
  setCurrentFilters: () => undefined,
  currentPage: 0,
  setCurrentPage: () => undefined,
  currentDrinks: [],
  setCurrentDrinks: () => undefined,
  onSearchChange: () => undefined,
  currentLockedDrinks: [],
  setCurrentLockedDrinks: () => undefined,
});

export const GlobalContextProvider = GlobalContext.Provider;

export const useGlobal = () => useContext(GlobalContext);
