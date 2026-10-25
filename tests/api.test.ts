import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "@prisma/client";

const reports = vi.hoisted(() => ({ findMany: vi.fn(), create: vi.fn(), update: vi.fn() }));
const getAllDrinks = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ default: { reports } }));
vi.mock("@/lib/drinks", () => ({ getAllDrinks }));
import blacklist from "@/pages/api/blacklist";
import report from "@/pages/api/blacklist/report";
import resolve from "@/pages/api/blacklist/resolve";
import drinks from "@/pages/api/drinks";

async function request(handler: NextApiHandler, method: string, body?: unknown) {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
    end() { return this; },
    setHeader(name: string, value: unknown) { this.headers[name] = value; return this; },
  };
  await handler({ method, body } as NextApiRequest, response as unknown as NextApiResponse);
  return response;
}

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.REPORT_ADMIN_PASSWORD;
});

describe("public reports and blacklist compatibility", () => {
  it("returns only resolved blacklist product codes, oldest first (including duplicates)", async () => {
    reports.findMany.mockResolvedValue([{ product_code: "42" }, { product_code: "42" }]);
    const result = await request(blacklist, "GET");
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual(["42", "42"]);
    expect(reports.findMany).toHaveBeenCalledWith({
      select: { product_code: true }, where: { is_resolved: true, blacklisted: true }, orderBy: { timestamp: "asc" },
    });
  });
  it("returns unresolved IDs and codes without serializing BigInt timestamps", async () => {
    reports.findMany.mockResolvedValue([{ id: 7, product_code: "42" }]);
    expect((await request(report, "GET")).body).toEqual([{ id: 7, product_code: "42" }]);
    expect(reports.findMany).toHaveBeenCalledWith({
      select: { id: true, product_code: true }, where: { is_resolved: false }, orderBy: { timestamp: "asc" },
    });
  });
  it("creates a pending report with millisecond timestamp and empty 201 response", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1720000000000);
    const result = await request(report, "POST", { product_code: "00042" });
    expect(result.statusCode).toBe(201);
    expect(result.body).toBeUndefined();
    expect(reports.create).toHaveBeenCalledWith({ data: { product_code: "00042", is_resolved: false, timestamp: 1720000000000 } });
    vi.restoreAllMocks();
  });
  it.each([undefined, null, {}, { product_code: "" }, { product_code: 42 }])("rejects invalid report %j", async (body) => {
    expect((await request(report, "POST", body)).statusCode).toBe(400);
    expect(reports.create).not.toHaveBeenCalled();
  });
  it.each([[blacklist, "GET"], [report, "GET, POST"], [resolve, "PATCH"]] as const)("rejects unsupported methods", async (handler, allow) => {
    const result = await request(handler, "DELETE");
    expect(result.statusCode).toBe(405);
    expect(result.headers.Allow).toBe(allow);
  });
  it("does not expose database errors or credentials", async () => {
    reports.findMany.mockRejectedValue(new Error("postgresql://secret"));
    expect((await request(blacklist, "GET")).body).toEqual({ error: "Internal server error" });
    expect((await request(report, "GET")).statusCode).toBe(500);
  });
});

describe("admin resolution", () => {
  it.each([undefined, ""])("fails closed without a nonempty configured key (%j)", async (key) => {
    if (key !== undefined) process.env.REPORT_ADMIN_PASSWORD = key;
    const result = await request(resolve, "PATCH", { id: 1, blacklisted: true, password: "" });
    expect(result.statusCode).toBe(401);
    expect(reports.update).not.toHaveBeenCalled();
  });
  it("rejects missing or wrong password", async () => {
    process.env.REPORT_ADMIN_PASSWORD = "test-only";
    expect((await request(resolve, "PATCH", { id: 1, blacklisted: true })).statusCode).toBe(400);
    expect((await request(resolve, "PATCH", { id: 1, blacklisted: true, password: "wrong" })).statusCode).toBe(401);
    expect(reports.update).not.toHaveBeenCalled();
  });
  it.each([true, false])("preserves Keep/Remove behavior (%j)", async (blacklisted) => {
    process.env.REPORT_ADMIN_PASSWORD = "test-only";
    expect((await request(resolve, "PATCH", { id: 1, blacklisted, password: "test-only" })).statusCode).toBe(200);
    expect(reports.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { is_resolved: true, blacklisted } });
  });
  it.each([0, -1, 1.5, 2147483648, "1"])("rejects invalid ID %j", async (id) => {
    expect((await request(resolve, "PATCH", { id, blacklisted: false, password: "key" })).statusCode).toBe(400);
    expect(reports.update).not.toHaveBeenCalled();
  });
  it("returns 404 for a missing report", async () => {
    process.env.REPORT_ADMIN_PASSWORD = "test-only";
    reports.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("missing", { code: "P2025", clientVersion: "6.19.3" }));
    expect((await request(resolve, "PATCH", { id: 99, blacklisted: false, password: "test-only" })).statusCode).toBe(404);
  });
});

describe("drink requests", () => {
  const filterOptions = { type: "beer", pack: "bottle", includePromo: false, search: "", sortBy: "ratio", order: "asc" };
  it("preserves numeric-string paging and drink calculation", async () => {
    getAllDrinks.mockResolvedValue([{ name: "Example", stockcode: "42", standardDrinks: 2, prices: { bottle: 6 }, units: {} }]);
    const result = await request(drinks, "POST", { filterOptions, pageNum: "1", pageSize: "20" });
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual([expect.objectContaining({ stockcode: "42", price: 6, ratio: 3 })]);
    expect(getAllDrinks).toHaveBeenCalledWith("beer");
  });
  it.each([undefined, null, {}, { filterOptions, pageNum: 0, pageSize: 20 }, { filterOptions: { ...filterOptions, type: "bad" }, pageNum: 1, pageSize: 20 }])("rejects malformed request %j before fetching", async (body) => {
    expect((await request(drinks, "POST", body)).statusCode).toBe(400);
    expect(getAllDrinks).not.toHaveBeenCalled();
  });
});
