export type DrinkType = "beer" | "cider" | "premix" | "spirit";

export type PackType = "bottle" | "pack" | "case" | "promobottle" | "promopack" | "promocase";

export type Drink = {
  name: string;
  stockcode: string;
  strength: number;
  units: {
    [key in "case" | "pack"]: number;
  };
  prices: {
    [key in PackType]: number;
  };
  price: number;
  ratio: number;
  percentage: string;
};

export type SortByOption = "ratio" | "price" | "strength";

export type Ordering = "asc" | "desc";

export type FilterOptions = {
  type: DrinkType;
  pack: PackType;
  includePromo: boolean;
  search: string;
  sortBy: SortByOption;
  order: Ordering;
};
