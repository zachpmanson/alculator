import Head from "next/head";
import { useState } from "react";
import DrinkCardList from "../components/drinkcardlist";
import Filters from "../components/filters";
import ResultList from "../components/resultlist";

export default function Home() {
  const [newUI, setNewUI] = useState(true);
  return (
    <>
      <Head>
        <title>Alculator</title>
        <meta name="description" content="Find the cheapest drinks, per standard" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main>
        <h1 className="col center text-center" title="Click here for table interface" onClick={() => setNewUI(!newUI)}>
          Alculator
        </h1>
        <Filters />
        {newUI ? <DrinkCardList /> : <ResultList />}
      </main>
    </>
  );
}
