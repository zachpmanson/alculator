import DrinkCard from "@/components/drinkcard";
import { useGlobal } from "@/contexts/Global/context";
import { Drink, PackTypeEnum } from "@/types";
import { Link } from "../router";
import { useEffect, useState } from "react";

type ReportProps = {
  activeReports: {
    product_code: string;
    id: number;
  }[];
  drinkDetails: Drink[];
};

export default function Reports() {
  const { setCurrentFilters, setReportModeActive } = useGlobal();
  const [password, setPassword] = useState("");
  const [activeReports, setActiveReports] = useState<ReportProps["activeReports"]>([]);
  const [visibleDrinks, setVisibleDrinks] = useState<Drink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Pending Reports";
    const controller = new AbortController();
    fetch("/api/reports", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Could not load reports");
        return res.json() as Promise<ReportProps>;
      })
      .then(({ activeReports, drinkDetails }) => {
        setActiveReports(activeReports);
        setVisibleDrinks(drinkDetails);
        setLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) { setError("Could not load reports. Please reload to try again."); setLoading(false); }
      });
    return () => controller.abort();
  }, []);

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

  const handleResult = async (item: Drink, blacklisted: boolean) => {
    setError("");
    try {
      const resolvedReports = activeReports.filter((r) => r.product_code === item.stockcode);
      const responses = await Promise.all(resolvedReports.map((r) => fetch("/api/blacklist/resolve", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, blacklisted, password }),
      })));
      if (responses.some((res) => !res.ok)) throw new Error("Resolution failed");
      setVisibleDrinks((old) => old.filter((d) => d.stockcode !== item.stockcode));
    } catch {
      setError("Could not resolve report. Check the password and try again.");
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

  return (
    <>

      <main>
        <header className="col center text-center">
          <h1 title="Click here for table interface">Alculator</h1>
          <p className="vert-margin">Pending reports</p>
          <Link className="vert-margin" href={"/"}>
            Go home
          </Link>
        </header>
      </main>
      <div className="col center">
        <input
          type="password"
          name="search"
          className="searchbox fill"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {loading && <p role="status">Loading reports…</p>}
        {error && <p role="alert">{error}</p>}
        {!loading && !error && visibleDrinks.length === 0 && <p>No pending reports</p>}
        {drinkCards}
      </div>
    </>
  );
}
