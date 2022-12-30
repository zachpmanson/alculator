import { Drink } from "../types";
import Image from "next/image";
import { useGlobal } from "../contexts/Global/context";

type DrinkCardProps = {
  item: Drink;
};

export default function DrinkCard({ item }: DrinkCardProps) {
  const {
    currentFilters: { pack },
  } = useGlobal();

  return (
    <div className="card center">
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
              <div className="badge">
                <div className="badge-label">Price</div>
                <div className="badge-number">${item.price}</div>
              </div>
              {(pack === "case" || pack === "pack") && (
                <div className="badge">
                  <div className="badge-label">Units</div>
                  <div className="badge-number">{item.units[pack]}</div>
                </div>
              )}
              <div className="badge">
                <div className="badge-label">Standard Drinks</div>
                <div className="badge-number">{Math.round(10 * item.standardDrinks) / 10}</div>
              </div>
              <div className="badge">
                <div className="badge-label">Price per Drink</div>
                <div className="badge-number">${Math.round(100 * item.ratio) / 100}</div>
              </div>
            </div>
          </div>
        </div>
      </a>
    </div>
  );
}
