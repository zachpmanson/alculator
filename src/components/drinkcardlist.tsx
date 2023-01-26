import { useEffect, useState } from "react";
import { useGlobal } from "../contexts/Global/context";
import DrinkCard from "./drinkcard";
import LoadingSpinner from "./loadingspinner";

export default function DrinkCardList() {
  const { currentDrinks, allDrinks } = useGlobal();

  const [lastDrinkIndex, setLastDrinkIndex] = useState(20);

  const cards = currentDrinks.slice(0, lastDrinkIndex).map((item, index) => <DrinkCard key={index} item={item} />);

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;
      if (scrollTop + clientHeight >= scrollHeight) {
        setTimeout(() => {
          setLastDrinkIndex(lastDrinkIndex + 10);
        }, 500);
      }
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [cards, setLastDrinkIndex, lastDrinkIndex]);
  return (
    <>
      {allDrinks.length === 0 ? (
        <LoadingSpinner></LoadingSpinner>
      ) : cards.length === 0 ? (
        <p className="text-center">No results</p>
      ) : (
        <div className="col center">{cards}</div>
      )}
      {cards.length === currentDrinks.length || (
        <div className="col center load-button-container">
          <button className="load-button" onClick={() => setLastDrinkIndex(lastDrinkIndex + 20)}>
            Load more
          </button>
        </div>
      )}
    </>
  );
}
