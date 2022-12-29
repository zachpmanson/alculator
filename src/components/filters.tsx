import { useGlobal } from "../contexts/Global/context";
import { DrinkType, Ordering, PackType, SortByOption } from "../types";

export default function Filters() {
  const {
    currentFilters,
    currentFilters: { includePromo },
    setCurrentFilters,
    onSearchChange,
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
              type: e.target.value as DrinkType,
            })
          }
        >
          <option key="beer" value="beer">
            Beer
          </option>
          <option key="cider" value="cider">
            Cider
          </option>
          <option key="premix" value="premix">
            Premix
          </option>
          <option key="spirit" value="spirit">
            Spirit
          </option>
        </select>
        <select
          name="pack"
          id="pack"
          onChange={(e) =>
            setCurrentFilters({
              ...currentFilters,
              pack: e.target.value as PackType,
            })
          }
        >
          <option key="bottle" value="bottle">
            Bottle
          </option>
          <option key="pack" value="pack">
            Pack
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
                includePromo: !includePromo,
              })
            }
          />
          Include promotions
        </label>
      </div>
      <div className="filters col center">
        <label>
          Sort by:
          <select
            name="sortby"
            id="sortby"
            onChange={(e) =>
              setCurrentFilters({
                ...currentFilters,
                sortBy: e.target.value as SortByOption,
              })
            }
          >
            <option key="ratio" value="ratio">
              SD/$
            </option>
            <option key="price" value="price">
              Price
            </option>
            <option key="strength" value="strength">
              Strength
            </option>
          </select>
          <select
            name="order"
            id="order"
            onChange={(e) =>
              setCurrentFilters({
                ...currentFilters,
                order: e.target.value as Ordering,
              })
            }
          >
            <option key="desc" value="desc">
              High to low
            </option>
            <option key="asc" value="asc">
              Low to high
            </option>
          </select>
        </label>
      </div>
    </>
  );
}
