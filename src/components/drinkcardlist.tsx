import { useGlobal } from "../contexts/Global/context";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Drink } from "../types";

export default function DrinkCardList() {
  const {
    currentFilters: { pack },
    currentDrinks,
  } = useGlobal();

  const [lastDrinkIndex, setLastDrinkIndex] = useState(20);

  const cards = currentDrinks.slice(0, lastDrinkIndex).map((item, index) => (
    <div key={index} className="card center">
      <a href={`https://www.danmurphys.com.au/product/${item.stockcode}`}>
        <div className="flex center-aligned">
          <Image
            alt="Image of drink"
            height="100"
            width="80"
            src={`https://media.danmurphys.com.au/dmo/product/${item.stockcode}-1.png`}
          />
          <div className="fill-width">
            <h3>{item.name}</h3>

            <div className="flex badge-row">
              <div className="badge">${item.price}</div>
              {(pack === "case" || pack === "pack") && <div className="badge">{item.units[pack]} units</div>}
              <div className="badge">{Math.round(10 * item.strength) / 10} standard drinks</div>
              <div className="badge">{Math.round(100 * item.ratio) / 100} SD/$</div>
            </div>
          </div>
        </div>
      </a>
    </div>
  ));

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
      {cards.length === 0 ? <p className="text-center">No results</p> : <div className="col center">{cards}</div>}
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
