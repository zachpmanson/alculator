import DrinkCard from "@/components/drinkcard";
import { useGlobal } from "@/contexts/Global/context";
import { getAllDrinks } from "@/lib/drinks";
import prisma from "@/lib/prisma";
import { Drink, PackTypeEnum } from "@/types";
import { debounce } from "@/utils/debounce";
import { GetServerSideProps } from "next";
import Link from "next/link";
import { ChangeEvent, useEffect, useState } from "react";

type ReportProps = {
  activeReports: {
    product_code: string;
    id: number;
  }[];
  drinkDetails: Drink[];
};

export default function Reports({ activeReports, drinkDetails }: ReportProps) {
  const { setCurrentFilters, setReportModeActive } = useGlobal();
  const [password, setPassword] = useState("");
  const [visibleDrinks, setVisibleDrinks] = useState(drinkDetails);

  useEffect(() => {
    setCurrentFilters({
      type: "all",
      pack: "bottle",
      includePromo: false,
      search: "",
      sortBy: "ratio",
      order: "asc",
    });
    setReportModeActive(false);
  }, [setCurrentFilters, setReportModeActive]);

  const handleResult = (item: Drink, blacklisted: boolean) => {
    const resolvedReports = activeReports.filter((r) => r.product_code === item.stockcode);
    for (let r of resolvedReports) {
      fetch("/api/blacklist/resolve", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: r.id,
          blacklisted: blacklisted,
          password: password,
        }),
      }).then((res) => {
        if (res.status === 200) {
          setVisibleDrinks((old) => old.filter((d) => d.stockcode !== item.stockcode));
        }
      });
    }
  };

  const drinkCards = visibleDrinks.map((d, i) => (
    <div key={i}>
      {Object.values(PackTypeEnum)
        .filter((p) => d.prices[p])
        .map((p, j) => (
          <DrinkCard key={j} item={{ ...d, price: d.prices[p], ratio: d.prices[p] / d.standardDrinks }} localPack={p} />
        ))}
      <div className="flex space-between">
        <button className="load-button" onClick={() => handleResult(d, false)}>
          Keep
        </button>
        <button className="load-button" onClick={() => handleResult(d, true)}>
          Remove
        </button>
      </div>
    </div>
  ));

  const onSearchChange: (event: ChangeEvent<HTMLInputElement>) => void = (event) => {
    const searchFieldString = event.target.value;
    setPassword(searchFieldString);
  };

  return (
    <>
      <main>
        <header className="col center text-center">
          <h1 title="Click here for table interface">Alculator</h1>
          <p className="vert-margin">Active reports</p>
          <Link className="vert-margin" href={"/"}>
            Go home
          </Link>
        </header>
      </main>
      {/* <ReportedCardList /> */}
      <div className="col center">
        <input
          type="password"
          name="search"
          className="searchbox fill"
          placeholder="Password"
          onChange={debounce(onSearchChange, 250)}
        />
        {drinkCards}
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  const activeReports = await prisma.reports.findMany({
    select: {
      id: true,
      product_code: true,
    },
    where: {
      is_resolved: false,
    },
    orderBy: {
      timestamp: "asc",
    },
  });
  let allDrinks = await getAllDrinks("all");
  let drinkList = activeReports.map((r) => r.product_code);
  const filteredDrinks = allDrinks.filter((d) => !!d && drinkList.includes(d.stockcode));
  return { props: { activeReports, drinkDetails: filteredDrinks } };
};
