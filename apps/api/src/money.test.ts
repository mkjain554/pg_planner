import { describe, expect, it } from "vitest";
import { moneyAmountSchema } from "./money.js";

describe("money amount validation", () => {
  it.each(["0", "0.01", "12000.99", "9999999999.99"])("accepts exact decimal string %s", (amount) => {
    expect(moneyAmountSchema.parse(amount)).toBe(amount);
  });

  it.each(["", "-1", "1.234", "10000000000", "1e3", 1200])("rejects invalid or imprecise amount %s", (amount) => {
    expect(moneyAmountSchema.safeParse(amount).success).toBe(false);
  });
});
