import { useGlobal } from "../contexts/Global/context";
import { DrinkType, PackType } from "../types";

export default function Filters() {
  const {
    currentFilters,
    currentFilters: { includePromo },
    setCurrentFilters,
    onSearchChange
  } = useGlobal();
  const initPromo = includePromo;

  return (
    <>
      <div className="filters col center">
        <input type="search" name="search" className="searchbox" placeholder="Search..." onChange={onSearchChange} />
        <select
          name="drinks"
          id="drinks"
          onChange={(e) =>
            setCurrentFilters({
              ...currentFilters,
              type: e.target.value as DrinkType
            })
          }
        >
          <option key="beer" value="beer">
            Beer
          </option>
          <option key="cider" value="cider">
            Cider
          </option>
        </select>
        <select
          name="pack"
          id="pack"
          onChange={(e) =>
            setCurrentFilters({
              ...currentFilters,
              pack: e.target.value as PackType
            })
          }
        >
          <option key="sixpack" value="sixpack">
            Six Pack
          </option>
          <option key="single" value="single">
            Single
          </option>
          <option key="case" value="case">
            Case
          </option>
        </select>
        <label>
          <input
            type="checkbox"
            defaultChecked={initPromo}
            onChange={() =>
              setCurrentFilters({
                ...currentFilters,
                includePromo: !includePromo
              })
            }
          />
          Include promotions
        </label>
      </div>
    </>
  );
}
