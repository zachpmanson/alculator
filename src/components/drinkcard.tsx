import {
  LockClosedIcon as LockClosedIconOutline,
  LockOpenIcon as LockOpenIconOutline,
} from "@heroicons/react/24/outline";
import { LockClosedIcon as LockClosedIconSolid, LockOpenIcon as LockOpenIconSolid } from "@heroicons/react/24/solid";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useGlobal } from "../contexts/Global/context";
import { Drink, PackType } from "../types";

type DrinkCardProps = {
  item: Drink;
  localPack?: PackType; // manual override for pack type
};

export default function DrinkCard({ item, localPack }: DrinkCardProps) {
  const { setCurrentDrinks } = useGlobal();
  const [lockFilled, setLockFilled] = useState(false);
  const [lockClosed, setLockClosed] = useState(true);
  const [greyed, setGreyed] = useState(false);

  const {
    currentFilters: { pack },
    currentLockedDrinks,
    setCurrentLockedDrinks,
    reportModeActive,
  } = useGlobal();

  const usedPackType = localPack ?? pack;

  const handleLock = (e: any) => {
    e.stopPropagation();
    e.preventDefault();
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

  const handleClick = (e: any) => {
    if (reportModeActive) {
      e.stopPropagation();
      e.preventDefault();
      setGreyed(true);
      console.log("Reporting", item.stockcode);
      fetch("/api/blacklist/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_code: item.stockcode,
        }),
      }).then((res) => {
        if (res.status === 201) {
          setCurrentDrinks((old) => old.filter((d) => d.stockcode !== item.stockcode));
        }
        setGreyed(false);
      });
    }
  };

  return (
    <div className={`card center ${greyed ? "bg-grey" : ""}`}>
      <a
        className="flex center-aligned"
        href={`https://www.danmurphys.com.au/product/${item.stockcode}`}
        onClick={handleClick}
      >
        <Image
          alt="Image of drink"
          height="100"
          width="80"
          src={`https://media.danmurphys.com.au/dmo/product/${item.stockcode}-1.png`}
        />
        <div className="fill-width">
          <div className="flex space-between align-center">
            <h3>
              {item.name} {localPack ? `(${localPack})` : ""}
            </h3>
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
            {(usedPackType === "case" || usedPackType === "pack") && (
              <div className="badge">
                <div className="badge-label">Units</div>
                <div className="badge-number">{item.units[usedPackType]}</div>
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
      </a>
    </div>
  );
}
