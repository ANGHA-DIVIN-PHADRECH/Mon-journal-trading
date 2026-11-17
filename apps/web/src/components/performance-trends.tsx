"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { MIN_TREND_POINTS, type PerformanceTrendsResponse } from "@/lib/performance-trends";
import { useApi } from "@/lib/use-api";
import { fmtPercent } from "@/lib/utils";
import { Pnl } from "./pnl";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

const RollingTradeChart = dynamic(
  () => import("./charts/rolling-trade-chart").then((module) => module.RollingTradeChart),
  {
    loading: () => (
      <div role="status" aria-label="Chargement du graphique de tendance">
        <Skeleton className="h-60" />
      </div>
    ),
  },
);
const tradeHref = (key: string) => `/trades/${encodeURIComponent(key)}`;

export function PerformanceTrendsReport({ query }: { query: string }) {
  const { data, loading, error, refresh } = useApi<PerformanceTrendsResponse>(
    `/api/performance-trends?${query}`,
  );
  const [tableOpen, setTableOpen] = useState(false);
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat("fr-FR", {
        timeZone: data?.timeZone ?? "UTC",
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [data?.timeZone],
  );
  if (loading)
    return (
      <div
        role="status"
        aria-label="Chargement des tendances de performance"
        className="grid gap-3 md:grid-cols-2"
      >
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    );
  if (error || !data)
    return (
      <div role="alert" className="rounded-xl border p-5">
        <p className="text-sm text-destructive">
          {error ?? "Impossible de charger les tendances de performance."}
        </p>
        <Button onClick={refresh} variant="outline" size="sm" className="mt-3">
          Réessayer
        </Button>
      </div>
    );
  const { trends, timeZone, currencies } = data;
  const currency = currencies[0] ?? "USD";
  const monetary = currencies.length <= 1;
  const latest = trends.points.at(-1);
  const chartReady = trends.points.length >= MIN_TREND_POINTS;
  return (
    <section
      className="space-y-4"
      aria-labelledby="performance-trends-title"
      data-performance-trends
    >
      <div>
        <h2 id="performance-trends-title" className="text-lg font-semibold">
          Tendances de performance
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {trends.count} trades clôturés · Compte et filtres actifs · Ordre de clôture · {timeZone}
          {monetary && trends.count > 0 ? ` · ${currency}` : ""}
        </p>
      </div>
      {trends.count === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <h3 className="font-medium">Aucun trade clôturé dans cette sélection</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Modifiez la période ou les filtres pour explorer votre historique de trading. Les
              positions ouvertes sont exclues.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {!monetary && (
            <p
              role="note"
              className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground"
            >
              Ces trades utilisent différentes devises ({currencies.join(", ")}). Le taux de
              réussite reste disponible ; sélectionnez des comptes dans une même devise pour
              comparer le résultat et les plus grands trades. Aucune conversion de devise n’est
              appliquée.
            </p>
          )}
          <div className={`grid items-start gap-3 ${monetary ? "lg:grid-cols-2" : ""}`}>
            {(["winRate", ...(monetary ? ["avgNetPnl" as const] : [])] as const).map((metric) => {
              const rate = metric === "winRate";
              const reference = rate ? trends.overallWinRate! : trends.overallAvgNetPnl!;
              return (
                <Card key={metric} className="min-w-0 overflow-hidden">
                  <CardHeader>
                    <CardTitle>
                      {rate
                        ? "Évolution du taux de réussite"
                        : "Évolution du résultat moyen par trade"}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Les 20 derniers trades clôturés à chaque point
                      {rate ? " · Trades à l’équilibre inclus" : " · Après frais"}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Dernière période complète</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">
                          {latest ? (
                            rate ? (
                              fmtPercent(latest.winRate, 1)
                            ) : (
                              <Pnl value={latest.avgNetPnl} currency={currency} />
                            )
                          ) : (
                            "—"
                          )}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{rate ? "Taux de réussite" : "Moyenne"} de la période sélectionnée</p>
                        <p className="mt-1 text-sm tabular-nums">
                          {rate ? (
                            fmtPercent(reference, 1)
                          ) : (
                            <Pnl value={reference} currency={currency} />
                          )}
                        </p>
                      </div>
                    </div>
                    {chartReady ? (
                      <>
                        <RollingTradeChart
                          data={trends.points}
                          metric={metric}
                          reference={reference}
                          currency={currency}
                          timeZone={timeZone}
                        />
                        <p className="text-xs text-muted-foreground">
                          Ordre des trades clôturés · Ligne en pointillés :{" "}
                          {rate ? "taux de réussite" : "moyenne"} de la période sélectionnée
                        </p>
                      </>
                    ) : (
                      <div className="rounded-lg bg-muted/30 px-4 py-6 text-sm leading-relaxed text-muted-foreground">
                        {!latest
                          ? `Encore ${20 - trends.count} trade${20 - trends.count === 1 ? "" : "s"} clôturé${20 - trends.count === 1 ? "" : "s"} requis pour obtenir la première période complète de 20 trades.`
                          : "La dernière période est disponible. Le graphique linéaire s’affichera à partir de 27 trades clôturés, soit 8 périodes complètes à comparer."}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {monetary && (
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Plus grand trade gagnant et perdant</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Trades clôturés individuels, après frais — pas les totaux quotidiens. La
                  classification gagnant/perdant de votre journal est utilisée.
                </p>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["Plus grand gagnant", trends.largestWin],
                    ["Plus grand perdant", trends.largestLoss],
                  ] as const
                ).map(([label, trade]) => (
                  <div key={label} className="min-w-0 rounded-lg border p-4">
                    <h3 className="text-xs text-muted-foreground">{label}</h3>
                    {trade ? (
                      <>
                        <p className="mt-2 text-xl font-semibold">
                          <Pnl value={trade.netPnl} currency={currency} />
                        </p>
                        <Link
                          href={tradeHref(trade.key)}
                          className="mt-2 inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded text-sm underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-current"
                        >
                          <span className="break-all font-medium">
                            {trade.symbol} · {trade.direction}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {dateFormat.format(new Date(trade.closedAt))} ↗
                          </span>
                        </Link>
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Aucun trade {label === "Plus grand gagnant" ? "gagnant" : "perdant"} dans
                        cette sélection.
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {latest && (
            <details
              className="rounded-xl border bg-card"
              onToggle={(event) => setTableOpen(event.currentTarget.open)}
            >
              <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium">
                Explorer les valeurs et les trades de la période
              </summary>
              {tableOpen && (
                <div className="max-h-72 overflow-auto px-4 pb-4">
                  <table className="w-full text-left text-xs">
                    <caption className="pb-3 text-left text-muted-foreground">
                      Chaque ligne couvre 20 trades se terminant par le trade lié. Dates au fuseau
                      {timeZone}.
                    </caption>
                    <thead>
                      <tr className="border-b">
                        <th scope="col" className="py-2 pr-3">
                          Période / trade de clôture
                        </th>
                        <th scope="col" className="px-2 text-right">
                          Taux de réussite
                        </th>
                        {monetary && (
                          <th scope="col" className="pl-2 text-right">
                            Résultat net moyen
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {trends.points.map((point) => (
                        <tr key={point.key} className="border-b last:border-0">
                          <th scope="row" className="py-3 pr-3 font-normal">
                            <Link
                              className="rounded underline underline-offset-4"
                              href={tradeHref(point.key)}
                            >
                              #{point.sequence - 19}–{point.sequence}
                              <span className="mt-1 block text-muted-foreground">
                                {dateFormat.format(new Date(point.closedAt))}
                              </span>
                            </Link>
                          </th>
                          <td className="px-2 text-right tabular-nums">
                            {fmtPercent(point.winRate, 1)}
                          </td>
                          {monetary && (
                            <td className="pl-2 text-right">
                              <Pnl value={point.avgNetPnl} currency={currency} />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </details>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">
            Seuls les trades de votre sélection sont utilisés ; les trades antérieurs ne sont pas
            ajoutés pour compléter une période. Les périodes glissantes se chevauchent et décrivent
            les résultats récents — elles ne constituent pas une prévision. Les petits échantillons
            peuvent varier fortement.
          </p>
        </>
      )}
    </section>
  );
}
