import { z } from "zod";

export enum DrinkTypeEnum {
  // all = "all",
  beer = "beer",
  cider = "cider",
  premix = "premix",
  spirits = "spirits",
  redwine = "redwine",
  whitewine = "whitewine",
}

export type DrinkType = keyof typeof DrinkTypeEnum;

export enum PackTypeEnum {
  bottle = "bottle",
  pack = "pack",
  case = "case",
  promobottle = "promobottle",
  promopack = "promopack",
  promocase = "promocase",
}
export type PackType = keyof typeof PackTypeEnum;

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

export type GenericApiError = { error: string | z.ZodError<any> };
