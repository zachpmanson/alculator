import Image from "next/image";
import { useGlobal } from "../contexts/Global/context";
import { Drink } from "../types";
import { LockClosedIcon as LockClosedIconOutline } from "@heroicons/react/24/outline";
import { LockOpenIcon as LockOpenIconOutline } from "@heroicons/react/24/outline";
import { LockClosedIcon as LockClosedIconSolid } from "@heroicons/react/24/solid";
import { LockOpenIcon as LockOpenIconSolid } from "@heroicons/react/24/solid";
import { useEffect, useState } from "react";
type DrinkCardProps = {
  item: Drink;
};

export default function DrinkCard({ item }: DrinkCardProps) {
  const [lockFilled, setLockFilled] = useState(false);
  const [lockClosed, setLockClosed] = useState(true);
  const {
    currentFilters: { pack },
    currentLockedDrinks,
    setCurrentLockedDrinks,
  } = useGlobal();

  const handleLock = (e: any) => {
    e.stopPropagation();
    if (currentLockedDrinks.map((d) => d.stockcode).includes(item.stockcode)) {
      setCurrentLockedDrinks(currentLockedDrinks.filter((d) => d.stockcode !== item.stockcode));
    } else {
      setCurrentLockedDrinks([...currentLockedDrinks, item]);
    }
  };

  useEffect(() => {
    if (currentLockedDrinks.map((d) => d.stockcode).includes(item.stockcode)) {
      setLockClosed(false);
    } else {
      setLockClosed(true);
    }
  }, [currentLockedDrinks, item.stockcode]);

  return (
    <div className="card center">
      <div
        className="flex center-aligned"
        onClick={() => (window.location.href = `https://www.danmurphys.com.au/product/${item.stockcode}`)}
      >
        <Image
          alt="Image of drink"
          height="100"
          width="80"
          src={`https://media.danmurphys.com.au/dmo/product/${item.stockcode}-1.png`}
        />
        <div className="fill-width">
          <div className="flex space-between align-center">
            <h3>{item.name}</h3>
            <div
              className="lock-button"
              onClick={handleLock}
              onMouseEnter={() => setLockFilled(true)}
              onMouseLeave={() => setLockFilled(false)}
            >
              {lockClosed && (lockFilled ? <LockClosedIconSolid width="20" /> : <LockClosedIconOutline width="20" />)}
              {!lockClosed && (lockFilled ? <LockOpenIconSolid width="20" /> : <LockOpenIconOutline width="20" />)}
            </div>
          </div>

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
    </div>
  );
}
