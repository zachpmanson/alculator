import { ChangeEvent, Dispatch, ReactNode, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PAGE_SIZE } from "../../constants";
import { Drink, FilterOptions } from "../../types";
import { GlobalContextProps, GlobalContextProvider } from "./context";

const GlobalProvider = ({ children }: { children: ReactNode }) => {
  const [currentDrinks, setCurrentDrinks] = useState<Drink[]>([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const pending = useRef(true);
  const finished = useRef(false);
  const generation = useRef(0);
  const successfulPage = useRef(0);
  const [currentLockedDrinks, setCurrentLockedDrinks] = useState<Drink[]>([]);
  const [reportModeActive, setReportModeActive] = useState(false);

  const [currentFilters, updateFilters] = useState<FilterOptions>({
    type: "all",
    pack: "bottle",
    includePromo: false,
    search: "",
    sortBy: "ratio",
    order: "asc",
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [requestVersion, setRequestVersion] = useState(0);
  const filters = useRef(currentFilters);

  const setCurrentFilters: Dispatch<SetStateAction<FilterOptions>> = useCallback((update) => {
    const next = typeof update === "function" ? update(filters.current) : update;
    if (next === filters.current) return;
    filters.current = next;
    // Invalidate even an already-decoded response before React runs effect cleanup.
    generation.current++;
    pending.current = true;
    finished.current = false;
    successfulPage.current = 0;
    setLoading(true);
    setDone(false);
    setCurrentPage(1);
    updateFilters(next);
  }, []);

  const loadNextPage = useCallback(() => {
    // Shared synchronous guard: button/scroll events in the same tick cannot skip a page.
    if (pending.current || finished.current) return;
    pending.current = true;
    generation.current++;
    setLoading(true);
    setCurrentPage(successfulPage.current + 1);
    setRequestVersion((old) => old + 1); // Also retries a failed page without advancing it.
  }, []);

  const onSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const searchFieldString = event.target.value.toLocaleLowerCase();
    setCurrentFilters((old) => ({ ...old, search: searchFieldString }));
  }, [setCurrentFilters]);

  // Filters may supersede a pending page, but page advances are serialized above.
  useEffect(() => {
    const controller = new AbortController();
    const requestGeneration = generation.current;
    const isCurrent = () => !controller.signal.aborted && requestGeneration === generation.current;
    fetch("/api/drinks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ filterOptions: currentFilters, pageNum: currentPage, pageSize: PAGE_SIZE }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load drinks");
        return response.json() as Promise<Drink[]>;
      })
      .then((data) => {
        if (!isCurrent()) return;
        successfulPage.current = currentPage;
        finished.current = data.length === 0;
        setDone(finished.current);
        setCurrentDrinks((old) => currentPage === 1 ? data : [...old, ...data]);
      })
      .catch(() => { /* Keep the successful cursor so Load more retries this page. */ })
      .finally(() => {
        if (!isCurrent()) return;
        pending.current = false;
        setLoading(false);
      });
    return () => controller.abort();
  }, [currentFilters, currentPage, requestVersion]);

  const value: GlobalContextProps = useMemo(
    () => ({
      done: done,
      loading: loading,
      currentDrinks: currentDrinks,
      setCurrentDrinks: setCurrentDrinks,
      currentFilters: currentFilters,
      setCurrentFilters: setCurrentFilters,
      onSearchChange: onSearchChange,
      currentLockedDrinks: currentLockedDrinks,
      setCurrentLockedDrinks: setCurrentLockedDrinks,
      currentPage: currentPage,
      loadNextPage: loadNextPage,
      reportModeActive: reportModeActive,
      setReportModeActive: setReportModeActive,
    }),
    [
      done,
      loading,
      loadNextPage,
      setCurrentFilters,
      currentDrinks,
      currentFilters,
      onSearchChange,
      currentLockedDrinks,
      currentPage,
      reportModeActive,
      setReportModeActive,
    ]
  );

  return <GlobalContextProvider value={value}>{children}</GlobalContextProvider>;
};

export default GlobalProvider;
