import { describe, expect, it } from "vitest";
import { computeTradePlan, MAX_RISK_PERCENT, type TradePlanInput } from "../src/lib/trade-plan";

const base: TradePlanInput = {
  direction: "long",
  entry: 1.1,
  stop: 1.095,
  target: 1.11,
  balance: 1000,
  riskPercent: 1,
  contractSize: 100000,
};

describe("trade plan risk gate", () => {
  it("sizes a long forex plan from the risk amount and rounds the lot down", () => {
    const plan = computeTradePlan(base);
    expect(plan.ok).toBe(true);
    expect(plan.riskAmount).toBeCloseTo(10);
    // 10 / 0.005 / 100000 = 0.02 lots
    expect(plan.lots).toBe(0.02);
    expect(plan.actualRiskAmount).toBeCloseTo(10);
    expect(plan.rewardRisk).toBeCloseTo(2);
    expect(plan.potentialReward).toBeCloseTo(20);
  });

  it("never lets the real risk exceed the planned risk", () => {
    const plan = computeTradePlan({ ...base, stop: 1.0941 });
    expect(plan.ok).toBe(true);
    expect(plan.actualRiskAmount).toBeLessThanOrEqual(plan.riskAmount + 1e-9);
    expect(plan.actualRiskPercent).toBeLessThanOrEqual(base.riskPercent + 1e-9);
  });

  it("works for a short plan", () => {
    const plan = computeTradePlan({
      ...base,
      direction: "short",
      entry: 2000,
      stop: 2010,
      target: 1970,
      contractSize: 100,
      balance: 5000,
      riskPercent: 1,
    });
    expect(plan.ok).toBe(true);
    // 50 / 10 / 100 = 0.05 lots
    expect(plan.lots).toBe(0.05);
    expect(plan.rewardRisk).toBeCloseTo(3);
  });

  it("refuses a plan without a stop", () => {
    const plan = computeTradePlan({ ...base, stop: Number.NaN });
    expect(plan.ok).toBe(false);
    expect(plan.errors.join(" ")).toMatch(/stop/i);
    expect(plan.lots).toBe(0);
  });

  it("refuses a stop on the wrong side of the entry", () => {
    expect(computeTradePlan({ ...base, stop: 1.105 }).ok).toBe(false);
    expect(computeTradePlan({ ...base, direction: "short", stop: 1.095, target: 1.09 }).ok).toBe(
      false,
    );
    expect(computeTradePlan({ ...base, stop: 1.1 }).ok).toBe(false);
  });

  it("refuses a target on the wrong side of the entry", () => {
    expect(computeTradePlan({ ...base, target: 1.09 }).ok).toBe(false);
  });

  it("refuses a risk above the hard cap but accepts the cap itself", () => {
    expect(computeTradePlan({ ...base, riskPercent: MAX_RISK_PERCENT + 0.5 }).ok).toBe(false);
    expect(computeTradePlan({ ...base, riskPercent: MAX_RISK_PERCENT }).ok).toBe(true);
  });

  it("refuses when the balance cannot fund even the minimum lot within the risk", () => {
    const plan = computeTradePlan({ ...base, balance: 50 });
    expect(plan.ok).toBe(false);
    expect(plan.lots).toBe(0);
    expect(plan.errors.join(" ")).toMatch(/trop petit/i);
  });

  it("warns on a poor reward:risk, a missing target and an above-comfort risk", () => {
    expect(computeTradePlan({ ...base, target: 1.1055 }).warnings.join(" ")).toMatch(
      /gain\/risque/,
    );
    expect(computeTradePlan({ ...base, target: null }).warnings.join(" ")).toMatch(/objectif/i);
    expect(computeTradePlan({ ...base, riskPercent: 1.5 }).warnings.join(" ")).toMatch(/confort/);
  });

  it("rejects non-finite or non-positive inputs", () => {
    for (const patch of [
      { entry: 0 },
      { entry: Number.POSITIVE_INFINITY },
      { balance: -10 },
      { riskPercent: 0 },
      { contractSize: 0 },
    ])
      expect(computeTradePlan({ ...base, ...patch }).ok).toBe(false);
  });
});
