export enum DrinkTypeEnum {
  // all = "all",
  beer = "beer",
  cider = "cider",
  premix = "premix",
  spirits = "spirits",
  redwine = "redwine",
  whitewine = "whitewine",
}

// export type DrinkType = "all" | "beer" | "cider" | "premix" | "spirits" | "redwine" | "whitewine";
export type DrinkType = keyof typeof DrinkTypeEnum;

export type PackType = "bottle" | "pack" | "case" | "promobottle" | "promopack" | "promocase";

export type Drink = {
  name: string;
  stockcode: string;
  standardDrinks: number;
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

export type SortByOption = "ratio" | "price" | "standardDrinks";

export type Ordering = "asc" | "desc";

export type FilterOptions = {
  type: DrinkType | "all";
  pack: PackType;
  includePromo: boolean;
  search: string;
  sortBy: SortByOption;
  order: Ordering;
};
