import { ChangeEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { PAGE_SIZE } from "../../constants";
import { Drink, FilterOptions } from "../../types";
import { GlobalContextProps, GlobalContextProvider } from "./context";

const GlobalProvider = ({ children }: { children: ReactNode }) => {
  const [currentDrinks, setCurrentDrinks] = useState<Drink[]>([]);
  const [done, setDone] = useState(false);
  const [currentLockedDrinks, setCurrentLockedDrinks] = useState<Drink[]>([]);

  const [currentFilters, setCurrentFilters] = useState<FilterOptions>({
    type: "all",
    pack: "bottle",
    includePromo: false,
    search: "",
    sortBy: "ratio",
    order: "asc",
  });

  const [currentPage, setCurrentPage] = useState(1);

  const onSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const searchFieldString = event.target.value.toLocaleLowerCase();
    setCurrentFilters((old) => ({ ...old, search: searchFieldString }));
  }, []);

  // Recalculates filtering
  useEffect(() => {
    setCurrentPage(1);
    setDone(false);
    fetch("/api/drinks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filterOptions: currentFilters,
        pageNum: 1,
        pageSize: PAGE_SIZE,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.length === 0) setDone(true);
        setCurrentDrinks(data);
      })
      .catch((error) => {
        console.error("Error:", error);
      });
  }, [currentFilters]);

  useEffect(() => {
    if (currentPage !== 1) {
      fetch("/api/drinks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filterOptions: currentFilters,
          pageNum: currentPage,
          pageSize: PAGE_SIZE,
        }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.length === 0) setDone(true);
          setCurrentDrinks((old) => [...old, ...data]);
        })
        .catch((error) => {
          console.error("Error:", error);
        });
    }
  }, [currentFilters, currentPage, setCurrentDrinks]);

  const value: GlobalContextProps = useMemo(
    () => ({
      done: done,
      currentDrinks: currentDrinks,
      setCurrentDrinks: setCurrentDrinks,
      currentFilters: currentFilters,
      setCurrentFilters: setCurrentFilters,
      onSearchChange: onSearchChange,
      currentLockedDrinks: currentLockedDrinks,
      setCurrentLockedDrinks: setCurrentLockedDrinks,
      currentPage: currentPage,
      setCurrentPage: setCurrentPage,
    }),
    [currentDrinks, currentFilters, onSearchChange, currentLockedDrinks, currentPage, setCurrentPage]
  );

  return <GlobalContextProvider value={value}>{children}</GlobalContextProvider>;
};

export default GlobalProvider;
