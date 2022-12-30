import { useGlobal } from "../contexts/Global/context";
import { DrinkType, Ordering, PackType, SortByOption } from "../types";

export default function Filters() {
  const { currentFilters, setCurrentFilters, onSearchChange } = useGlobal();
  const initPromo = currentFilters.includePromo;

  return (
    <>
      <div className="col center">
        <div>
          <input
            type="search"
            name="search"
            className="searchbox fill"
            placeholder="Search..."
            onChange={onSearchChange}
          />
        </div>
        <p>Drink:</p>

        <div className="table">
          <select
            name="drinks"
            id="drinks"
            defaultValue={currentFilters.type}
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
            <option key="spirits" value="spirits">
              Spirits
            </option>
            <option key="redwine" value="redwine">
              Red Wine
            </option>
            <option key="whitewine" value="whitewine">
              White Wine
            </option>
          </select>
          <select
            name="pack"
            id="pack"
            defaultValue={currentFilters.pack}
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
        </div>
        <p>Sort by:</p>
        <div className="table">
          <select
            name="sortby"
            id="sortby"
            defaultValue={currentFilters.sortBy}
            onChange={(e) =>
              setCurrentFilters({
                ...currentFilters,
                sortBy: e.target.value as SortByOption,
              })
            }
          >
            <option key="ratio" value="ratio">
              Price per Drink
            </option>
            <option key="price" value="price">
              Price
            </option>
            <option key="standardDrinks" value="standardDrinks">
              Standard Drinks
            </option>
          </select>
          <select
            name="order"
            id="order"
            defaultValue={currentFilters.order}
            onChange={(e) =>
              setCurrentFilters({
                ...currentFilters,
                order: e.target.value as Ordering,
              })
            }
          >
            <option key="asc" value="asc">
              Low to high
            </option>
            <option key="desc" value="desc">
              High to low
            </option>
          </select>
        </div>
        <div className="vert-margin">
          <details>
            <summary>Show all filters</summary>
            <label>
              <input
                type="checkbox"
                defaultChecked={initPromo}
                onChange={() =>
                  setCurrentFilters({
                    ...currentFilters,
                    includePromo: !currentFilters.includePromo,
                  })
                }
              />
              Include promotions
            </label>
          </details>
        </div>
      </div>
    </>
  );
}
