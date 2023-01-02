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
        <link rel="canonical" href="https://alculator.zachmanson.com" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png" />
        <link rel="manifest" href="/icons/site.webmanifest" />
        <link rel="mask-icon" href="/icons/safari-pinned-tab.svg" color="#bd93f9" />
        <link rel="shortcut icon" href="/icons/favicon.ico" />
        <meta name="msapplication-TileColor" content="#603cba" />
        <meta name="msapplication-config" content="/icons/browserconfig.xml" />
        <meta name="theme-color" content="#282A36" />

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
