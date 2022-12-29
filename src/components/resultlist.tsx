import { useGlobal } from "../contexts/Global/context";

export default function ResultList() {
  const {
    currentFilters: { pack, includePromo },
    currentDrinks
  } = useGlobal();

  const tableBody = currentDrinks.map((item, index) => (
    <tr key={index} className="drink-row">
      <td className="drink-name">
        <a href={`https://www.danmurphys.com.au/product/${item.stockcode}`}>{item.name}</a>
      </td>
      <td>{item.strength}</td>
      <td>${item.price}</td>
      <td>{Math.round(100 * item.ratio) / 100}</td>
    </tr>
  ));

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
              <th>sd/$</th>
            </tr>
          </thead>
          <tbody>{tableBody}</tbody>
        </table>
      )}
    </>
  );
}
