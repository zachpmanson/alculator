import { XMarkIcon } from "@heroicons/react/24/outline";
import { useGlobal } from "../contexts/Global/context";

export default function LockedDrinks() {
  const {
    currentFilters: { pack },
    currentLockedDrinks,
    setCurrentLockedDrinks,
  } = useGlobal();

  const tableBody = currentLockedDrinks.map((item, index) => (
    <>
      <div className="locked-drinks-title-line flex space-between">
        <a href={`https://www.danmurphys.com.au/product/${item.stockcode}`}>{item.name}</a>
        <div className="close-button">
          <XMarkIcon
            onClick={() => setCurrentLockedDrinks(currentLockedDrinks.filter((d) => d.stockcode !== item.stockcode))}
            width="20"
          />
        </div>
      </div>

      <div className="flex space-evenly">
        <td>${item.price}</td>
        <td>{Math.round(10 * item.standardDrinks) / 10} SD</td>
        <td>${Math.round(100 * item.ratio) / 100}/SD</td>
      </div>
    </>
  ));

  return (
    <>
      {tableBody.length !== 0 && (
        <div className="locked-drinks-container center col table-responsive">
          <div className="locked-drinks fill">{tableBody}</div>
        </div>
      )}
    </>
  );
}
