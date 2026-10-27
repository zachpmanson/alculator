import { useEffect, useState } from "react";
import DrinkCardList from "../components/drinkcardlist";
import Filters from "../components/filters";
import LockedDrinks from "../components/lockeddrinks";
import ResultList from "../components/resultlist";

export default function Home() {
  useEffect(() => { document.title = "Alculator"; }, []);
  const [newUI, setNewUI] = useState(true);
  return (
    <>
      <main>
        <header className="col center text-center">
          <h1 title="Click here for table interface" onClick={() => setNewUI(!newUI)}>
            Alculator
          </h1>
          <p className="vert-margin">Find the cheapest drinks, per standard</p>
        </header>

        <Filters />

        {newUI ? (
          <>
            <LockedDrinks />
            <DrinkCardList />
          </>
        ) : (
          <ResultList />
        )}
      </main>
    </>
  );
}
