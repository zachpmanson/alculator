import Head from "next/head";
import { useState } from "react";
import DrinkCardList from "../components/drinkcardlist";
import Filters from "../components/filters";
import LockedDrinks from "../components/lockeddrinks";
import ResultList from "../components/resultlist";

export default function Home() {
  const [newUI, setNewUI] = useState(true);
  return (
    <>
      <Head>
        <title>Alculator</title>
        <meta name="description" content="Find the cheapest drinks, per standard" />
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />

        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
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
