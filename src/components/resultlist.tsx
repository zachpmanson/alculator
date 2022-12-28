import { useEffect, useState } from "react";
import { useGlobal } from "../contexts/Global/context";
import { Drink, PackType } from "../types";

type ResultListProps = { listItems: Drink[] };

export default function ResultList({ listItems }: ResultListProps) {
  const {
    currentFilters: { pack, includePromo },
  } = useGlobal();
  const [tableBody, setTableBody] = useState<JSX.Element[]>([]);

  useEffect(() => {
    console.log("pack type updated to", pack);
    const fullPackname = includePromo ? (("promo" + pack) as PackType) : pack;
    setTableBody(
      listItems
        .filter((a) => !!a)
        // check price for packtype and strength exists
        .filter((a) => !!a.prices[fullPackname] && !!a.strength)
        // make new entry for particular price
        .map((a) => {
          return { ...a, price: a.prices[fullPackname] };
        })
        // sort on ratio
        .sort((a, b) => b.strength / b.price - a.strength / a.price)
        .map((item, index) => (
          <tr key={index}>
            <td>
              <a
                href={`https://www.danmurphys.com.au/product/${item.stockcode}`}
              >
                {item.name}
              </a>
            </td>
            <td>{item.strength}</td>
            <td>${item.price}</td>
            <td>{Math.round((100 * item.strength) / item.price) / 100}</td>
          </tr>
        ))
    );
  }, [pack, listItems, includePromo]);

  return (
    <>
      {tableBody.length === 0 ? (
        <p className="text-center">No results</p>
      ) : (
        <table className="center">
          <thead>
            <tr>
              <th>name</th>
              <th>standard drinks</th>
              <th>price</th>
              <th>ratio</th>
            </tr>
          </thead>
          <tbody>{tableBody}</tbody>
        </table>
      )}
    </>
  );
}
