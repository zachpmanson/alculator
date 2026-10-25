import { afterEach, expect, it, vi } from "vitest";
import cache from "memory-cache";
import { getAllDrinks } from "@/lib/drinks";
import timestamp from "@/pages/api/drinks/timestamp";
import { DrinkTypeEnum } from "@/types";
import type { NextApiRequest, NextApiResponse } from "next";

afterEach(() => { cache.clear(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("preserves raw alculator-data master URLs, all/type output and hourly cache", async () => {
  const fetchMock = vi.fn(async (url: string) => ({ json: async () => [{ stockcode: url }] }));
  vi.stubGlobal("fetch", fetchMock);
  // DATA_REPO historically affects timestamp only, NOT the drinks URLs.
  vi.stubEnv("DATA_REPO", "different/repo");
  const all = await getAllDrinks("all");
  expect(all).toHaveLength(6);
  for (const type of Object.values(DrinkTypeEnum)) {
    const url = `https://raw.githubusercontent.com/pavo-etc/alculator-data/master/${type}.json`;
    expect(fetchMock).toHaveBeenCalledWith(url);
    expect(await getAllDrinks(type)).toEqual([{ stockcode: url }]);
  }
  expect(fetchMock).toHaveBeenCalledTimes(6);
});

it("preserves DATA_REPO master-branch timestamp shape and ten-minute cache", async () => {
  vi.stubEnv("DATA_REPO", "example/data");
  const date = "2026-01-01T00:00:00Z";
  const fetchMock = vi.fn(async () => ({ json: async () => ({ commit: { commit: { author: { date } } } }) }));
  vi.stubGlobal("fetch", fetchMock);
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await timestamp({ method: "GET" } as NextApiRequest, response as unknown as NextApiResponse);
  await timestamp({ method: "GET" } as NextApiRequest, response as unknown as NextApiResponse);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith("https://api.github.com/repos/example/data/branches/master");
  expect(response.status).toHaveBeenCalledWith(200);
  expect(response.json).toHaveBeenCalledWith({ date });
});
