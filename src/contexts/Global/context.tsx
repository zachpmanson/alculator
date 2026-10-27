import { ChangeEvent, createContext, Dispatch, SetStateAction, useContext } from "react";
import { Drink, FilterOptions } from "../../types";

export type GlobalContextProps = {
  done: boolean;
  loading: boolean;
  currentFilters: FilterOptions;
  setCurrentFilters: Dispatch<SetStateAction<FilterOptions>>;
  currentPage: number;
  loadNextPage: () => void;
  currentDrinks: Drink[];
  setCurrentDrinks: Dispatch<SetStateAction<Drink[]>>;
  onSearchChange: (event: ChangeEvent<HTMLInputElement>) => void;
  currentLockedDrinks: Drink[];
  setCurrentLockedDrinks: Dispatch<SetStateAction<Drink[]>>;
  reportModeActive: boolean;
  setReportModeActive: Dispatch<SetStateAction<boolean>>;
};

const GlobalContext = createContext<GlobalContextProps>({
  done: false,
  loading: true,
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
  loadNextPage: () => undefined,
  currentDrinks: [],
  setCurrentDrinks: () => undefined,
  onSearchChange: () => undefined,
  currentLockedDrinks: [],
  setCurrentLockedDrinks: () => undefined,
  reportModeActive: false,
  setReportModeActive: () => undefined,
});

export const GlobalContextProvider = GlobalContext.Provider;

export const useGlobal = () => useContext(GlobalContext);
