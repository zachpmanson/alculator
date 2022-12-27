import { Drink } from "../types";

type ResultListProps = { listItems: Drink[] };

export default function ResultList({ listItems }: ResultListProps) {
  const tableBody = Array.isArray(listItems) ? (
    listItems
      .filter((a) => !!a.price && !!a.strength)
      .sort((a, b) => b.strength / b.price - a.strength / a.price)
      .map((item) => (
        <tr key={item.name}>
          <td>{item.name}</td>
          <td>${item.price}</td>
          <td>{item.strength}</td>
          <td>{Math.round((100 * item.strength) / item.price) / 100}</td>
        </tr>
      ))
  ) : (
    <></>
  );
  return (
    <>
      <table>
        <tbody>
          <tr>
            <th>Name</th>
            <th>Price per can</th>
            <th>Standard Drinks</th>
            <th>DPS</th>
          </tr>
          {tableBody}
        </tbody>
      </table>
    </>
  );
}
