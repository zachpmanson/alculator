export type DrinkType = "beer" | "cider";

export type PackType =
  | "sixpack"
  | "single"
  | "case"
  | "promosixpack"
  | "promosingle"
  | "promocase";

export type Drink = {
  name: string;
  stockcode: string;
  strength: number;
  prices: {
    [key in PackType]: number;
  };
  percentage: string;
};

export type FilterOptions = {
  type: DrinkType;
  pack: PackType;
  includePromo: boolean;
  search: string;
};
