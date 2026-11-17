import {
  byHour,
  byMistake,
  bySymbol,
  byWeekday,
  computeMetrics,
  type BucketStats,
} from "@luxalgo/journal-core";
import { bad, handler, ok, requireValue } from "@/server/api";
import { runAi } from "@/server/ai";
import { queryTrades } from "@/server/trades-query";
import { accountContext, readAiRequest } from "@/server/ai-scope";
import { computeTradePlan, type PlanDirection } from "@/lib/trade-plan";

const bucketBlock = (title: string, buckets: BucketStats[]): string =>
  buckets.length === 0
    ? ""
    : `${title}:\n${buckets
        .map(
          (b) =>
            `  ${b.key}: ${b.trades} trades, net ${b.netPnl.toFixed(2)}, win ${b.winRate === null ? "n/a" : `${(b.winRate * 100).toFixed(0)}%`}`,
        )
        .join("\n")}\n`;

const num = (value: unknown): number => (typeof value === "number" ? value : Number.NaN);

/**
 * Trade plan review. The risk gate (`computeTradePlan`) runs on the server first: an invalid
 * plan (no stop, wrong side, risk above the cap, ...) never reaches the AI. The AI then judges
 * the plan against the trader's OWN journal aggregates. It never sees live prices, so it cannot
 * invent market data, and it is told not to widen the stop or raise the risk.
 */
export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as Record<string, unknown>;
  requireValue(body && typeof body === "object" && !Array.isArray(body), "Invalid request");
  const raw = body.plan as Record<string, unknown> | undefined;
  requireValue(raw && typeof raw === "object" && !Array.isArray(raw), "plan is required");

  const symbol = typeof raw.symbol === "string" ? raw.symbol.trim().slice(0, 32) : "";
  requireValue(symbol.length > 0, "Le symbole est obligatoire.");
  const notes = typeof raw.notes === "string" ? raw.notes.trim().slice(0, 4000) : "";
  const direction = raw.direction as PlanDirection;
  const plan = computeTradePlan({
    direction,
    entry: num(raw.entry),
    stop: num(raw.stop),
    target: raw.target === null || raw.target === undefined ? null : num(raw.target),
    balance: num(raw.balance),
    riskPercent: num(raw.riskPercent),
    contractSize: num(raw.contractSize),
  });
  if (!plan.ok) return bad(plan.errors.join(" "));

  const scope = readAiRequest(
    { question: `Plan review ${symbol}`, filters: body.filters, timeZone: body.timeZone },
    "question",
  );
  const { trades } = queryTrades(scope.filters);
  const sameSymbol = trades.filter((t) => t.symbol.toLowerCase() === symbol.toLowerCase());
  const history =
    trades.length === 0
      ? "No trade history in the selected scope: judge only the structure of the plan and say the review is not grounded in the trader's data."
      : (() => {
          const m = computeMetrics(trades, { timeZone: scope.timeZone });
          const ms = computeMetrics(sameSymbol, { timeZone: scope.timeZone });
          return [
            scope.context,
            accountContext(trades, scope),
            `Overall: net ${m.netPnl.toFixed(2)} over ${m.closedTrades} closed trades, win rate ${m.winRate === null ? "n/a" : `${(m.winRate * 100).toFixed(1)}%`}, avg win ${m.avgWin?.toFixed(2) ?? "n/a"}, avg loss ${m.avgLoss?.toFixed(2) ?? "n/a"}, max drawdown ${m.maxDrawdown.toFixed(2)}.`,
            sameSymbol.length === 0
              ? `No past trades on ${symbol}.`
              : `Past trades on ${symbol}: ${ms.closedTrades} closed, net ${ms.netPnl.toFixed(2)}, win rate ${ms.winRate === null ? "n/a" : `${(ms.winRate * 100).toFixed(0)}%`}.`,
            bucketBlock("By symbol (top 12)", bySymbol(trades).slice(0, 12)),
            bucketBlock("By weekday", byWeekday(trades, scope.timeZone)),
            bucketBlock("By hour of open", byHour(trades, scope.timeZone)),
            bucketBlock("By mistake", byMistake(trades).slice(0, 12)),
          ].join("\n");
        })();

  const planBlock = [
    `Symbol: ${symbol}`,
    `Direction: ${direction}`,
    `Entry: ${num(raw.entry)}  Stop: ${num(raw.stop)}  Target: ${plan.targetDistance === null ? "none" : num(raw.target)}`,
    `Balance: ${num(raw.balance)}  Planned risk: ${num(raw.riskPercent)}% (${plan.riskAmount.toFixed(2)})`,
    `Lot size computed by the risk calculator: ${plan.lots} (real risk ${plan.actualRiskAmount.toFixed(2)}, ${plan.actualRiskPercent.toFixed(2)}%)`,
    `Reward:risk: ${plan.rewardRisk === null ? "n/a" : plan.rewardRisk.toFixed(2)}`,
    plan.warnings.length ? `Calculator warnings: ${plan.warnings.join(" | ")}` : "",
    notes
      ? `Trader's market notes (unverified claims, may come from another tool): ${JSON.stringify(notes)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const review = await runAi(
    `Review this trade plan BEFORE the trader places it. Answer in French, under 220 words.

Rules you must follow:
- Use ONLY the journal aggregates and the plan below. You have no live prices or news: never invent market data, levels, or indicator values. Treat the trader's market notes as unverified claims.
- Start with one line: "Verdict : GO", "Verdict : AJUSTER" or "Verdict : PASSER".
- Give 2 to 4 reasons that cite the trader's numbers (same symbol, weekday, hour, mistakes) or flaws in the plan itself.
- You may suggest tightening risk, a smaller size, or waiting. Never suggest widening the stop, removing the stop, or raising the risk percentage.
- Never promise or imply a profit. Say plainly when the history is too thin to judge.

PLAN
${planBlock}

JOURNAL
${history}`,
    900,
  );

  return ok({ review, plan, scope: scope.scope });
});
