import { useGlobal } from "../contexts/Global/context";

export default function ResultList() {
  const {
    currentFilters: { pack },
    currentDrinks,
  } = useGlobal();

  const tableBody = currentDrinks.map((item, index) => (
    <tr key={index} className="drink-row">
      <td className="drink-name">
        <a href={`https://www.danmurphys.com.au/product/${item.stockcode}`}>{item.name}</a>
      </td>
      <td>${item.price}</td>
      {(pack === "case" || pack === "pack") && <td>{item.units[pack]}</td>}
      <td>{Math.round(10 * item.standardDrinks) / 10}</td>
      <td>{Math.round(100 * item.ratio) / 100}</td>
    </tr>
  ));

  return (
    <>
      {tableBody.length === 0 ? (
        <p className="text-center">No results</p>
      ) : (
        <div className="table-responsive">
          <table className="center results-list">
            <thead>
              <tr>
                <th>name</th>
                <th>price</th>
                {pack !== "bottle" && <th>units</th>}
                <th>standard drinks</th>
                <th>Price per Drink</th>
              </tr>
            </thead>
            <tbody>{tableBody}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
