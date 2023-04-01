import { useEffect } from "react";
import { useGlobal } from "../contexts/Global/context";
import DrinkCard from "./drinkcard";
import LoadingSpinner from "./loadingspinner";

export default function DrinkCardList() {
  const { currentDrinks, currentPage, setCurrentPage, done } = useGlobal();

  const cards = currentDrinks.map((item, index) => <DrinkCard key={index} item={item} />);

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;
      if (scrollTop + clientHeight >= scrollHeight) {
        setTimeout(() => {
          setCurrentPage(currentPage + 1);
        }, 500);
      }
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [cards, setCurrentPage, currentPage]);
  return (
    <>
      {currentDrinks.length === 0 ? (
        <LoadingSpinner></LoadingSpinner>
      ) : cards.length === 0 ? (
        <p className="text-center">No results</p>
      ) : (
        <div className="col center">{cards}</div>
      )}

      {done || (
        <div className="col center load-button-container">
          <button className="load-button" onClick={() => setCurrentPage(currentPage + 1)}>
            Load more
          </button>
        </div>
      )}
    </>
  );
}
