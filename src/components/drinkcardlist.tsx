import { useEffect } from "react";
import { useGlobal } from "../contexts/Global/context";
import DrinkCard from "./drinkcard";
import LoadingSpinner from "./loadingspinner";

export default function DrinkCardList() {
  const { currentDrinks, currentFilters, currentPage, loadNextPage, done, loading } = useGlobal();

  const cards = currentDrinks.map((item, index) => <DrinkCard key={index} item={item} />);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      const scrollTop = document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;
      if (!done && !loading && timer === undefined && scrollTop + clientHeight >= scrollHeight) {
        timer = setTimeout(() => {
          timer = undefined;
          loadNextPage();
        }, 500);
      }
    };
    window.addEventListener("scroll", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    };
  }, [currentDrinks, currentFilters, done, loading, loadNextPage, currentPage]);
  return (
    <>
      {currentDrinks.length === 0 && loading ? (
        <LoadingSpinner></LoadingSpinner>
      ) : cards.length === 0 ? (
        <p className="text-center">No results</p>
      ) : (
        <div className="col center">{cards}</div>
      )}

      {currentDrinks.length === 0 || done || (
        <div className="col center load-button-container">
          <button className="load-button" disabled={loading} onClick={loadNextPage}>
            Load more
          </button>
        </div>
      )}
    </>
  );
}
