"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import type { DayStats } from "@luxalgo/journal-core";
import { calendarTradeHref, type CalendarResponse } from "@/lib/calendar-insights";
import { cn, fmtMoney, fmtPercent } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { HelpHint, HoverHint } from "./ui/tooltip";
import { Pnl } from "./pnl";
import { usePrivacy } from "./privacy";
// Keep the calendar and summaries usable before the plotting bundle loads.
const CalendarDailyChart = dynamic(
  () => import("./charts/calendar-daily-chart").then((module) => module.CalendarDailyChart),
  {
    loading: () => (
      <div
        role="status"
        aria-label="Chargement du graphique de performance quotidienne"
        className="h-60 rounded-lg bg-muted/20"
      />
    ),
  },
);

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const dateLabel = (date: string) => dateFormatter.format(new Date(`${date}T12:00:00Z`));

function Metric({
  title,
  value,
  detail,
  hint,
}: {
  title: string;
  value: ReactNode;
  detail: ReactNode;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        <HelpHint heading={title}>{hint}</HelpHint>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );
}

export function CalendarPerformance({ data, query }: { data: CalendarResponse; query: string }) {
  const { insights: i, scope, timeZone, currencies } = data;
  const currency = currencies[0] ?? "USD";
  const mixed = currencies.length > 1;
  const privateMode = usePrivacy();
  const router = useRouter();
  const [weekday, setWeekday] = useState<number | null>(null);
  const href = (date?: string) => calendarTradeHref(query, scope, date);
  const money = (value: number | null) =>
    value === null || mixed ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <Pnl value={value} currency={currency} />
    );
  const selected = weekday === null ? null : i.weekdays[weekday]!;
  const weekdayNames = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const peak = Math.max(1, ...i.weekdays.map((day) => Math.abs(day.netPnl)));
  const dayLink = (day: DayStats | null) =>
    day && !mixed ? (
      <Link
        href={href(day.date)}
        className="inline-flex max-w-full items-center gap-2 rounded text-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        {money(day.netPnl)}
        <span className="text-xs font-normal text-muted-foreground">{dateLabel(day.date)}</span>
        <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" />
      </Link>
    ) : (
      money(null)
    );
  return (
    <section
      aria-labelledby="calendar-insights-heading"
      className="space-y-3"
      data-calendar-insights
    >
      <div className="flex flex-wrap items-end justify-between gap-2 pt-3">
        <div>
          <h2 id="calendar-insights-heading" className="text-base font-semibold tracking-tight">
            Statistiques de performance
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Mois affiché × filtres actifs · Trades clôturés, frais déduits · {timeZone}
          </p>
        </div>
        {i.trades > 0 && (
          <Link
            href={href()}
            className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Voir les trades correspondants <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        )}
      </div>
      {!i.tradingDays ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <CalendarDays aria-hidden="true" className="mb-1 size-6 text-muted-foreground" />
            <h3 className="text-sm font-medium">Aucun trade clôturé dans cette vue</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              Choisissez un autre mois ou modifiez le compte et les filtres. Les positions ouvertes
              et les jours sans trade ne sont pas inclus dans les statistiques de performance.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {mixed && (
            <p
              role="status"
              className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
            >
              Ces trades utilisent les devises {currencies.join(", ")}. Sélectionnez des comptes
              dans une même devise pour comparer les résultats financiers ; aucune conversion n’est
              appliquée.
            </p>
          )}
          <div className="grid gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
            <Metric
              title="Résultat net"
              value={money(i.netPnl)}
              detail={`${i.tradingDays} jour${i.tradingDays === 1 ? "" : "s"} de trading${mixed ? "" : ` · ${currency}`}`}
              hint="Somme du résultat net des trades clôturés pour ce mois et les filtres sélectionnés. Frais inclus. Aucune conversion de devise."
            />
            <Metric
              title="Résultat quotidien moyen"
              value={money(i.avgDailyPnl)}
              detail="Par jour avec des trades clôturés"
              hint="Résultat net divisé par le nombre de jours de trading. Les jours sans trade clôturé sont exclus ; les journées à l’équilibre sont incluses."
            />
            <Metric
              title="Taux de trades gagnants"
              value={fmtPercent(i.winRate)}
              detail={`${i.wins} gagnants · ${i.losses} perdants · ${i.breakevens} à l’équilibre`}
              hint="Trades clôturés gagnants divisés par tous les trades clôturés, y compris ceux à l’équilibre. Suit la règle de seuil de rentabilité configurée dans votre journal."
            />
            <Metric
              title="Nombre total de trades clôturés"
              value={
                <Link
                  className="rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  href={href()}
                >
                  {i.trades}
                </Link>
              }
              detail="Trades complets, et non exécutions"
              hint="Nombre de trades achevés dont le jour de clôture se trouve dans le mois affiché et la période sélectionnée, avec les autres filtres appliqués."
            />
          </div>
          {!mixed && (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle>Meilleure et pire journée</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-xs text-muted-foreground">Meilleure journée</span>
                      {dayLink(i.bestDay)}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-xs text-muted-foreground">Pire journée</span>
                      {dayLink(i.worstDay)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {i.tradingDays === 1
                        ? "Une seule journée de trading ; le maximum et le minimum sont identiques."
                        : "Résultats nets journaliers les plus élevés et les plus faibles."}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Journée positive et négative moyenne</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-xs text-muted-foreground">
                        {i.greenDays} journées gagnantes
                      </span>
                      {money(i.avgGreenDay)}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-xs text-muted-foreground">
                        {i.redDays} journées perdantes
                      </span>
                      {money(i.avgRedDay)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Chaque moyenne est calculée uniquement sur son propre groupe.
                    </p>
                  </CardContent>
                </Card>
                <Metric
                  title="Régularité des journées"
                  value={fmtPercent(i.profitableDayRate)}
                  detail={`${i.greenDays} positives · ${i.redDays} négatives · ${i.flatDays} à l’équilibre`}
                  hint="Part des journées de trading dont le résultat net est strictement positif. Il s’agit d’un taux de journées gagnantes, pas d’un score ajusté au risque ni d’une prédiction. Les journées à l’équilibre restent dans le calcul."
                />
              </div>
              <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
                <Card>
                  <CardHeader>
                    <h3 className="text-sm font-medium">Performance quotidienne</h3>
                    <p className="text-xs text-muted-foreground">
                      Résultat net par jour de clôture · {currency}
                      {i.tradingDays >= 8
                        ? " · Ligne en pointillés : moyenne sur 5 jours de trading"
                        : ""}
                    </p>
                  </CardHeader>
                  <CardContent>
                    {i.tradingDays >= 2 ? (
                      <CalendarDailyChart
                        data={i.trend}
                        currency={currency}
                        onInspect={(date) => router.push(href(date))}
                      />
                    ) : (
                      <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg bg-muted/30 p-5 text-center">
                        <span className="text-sm font-medium">
                          Une tendance nécessite plusieurs jours
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {dateLabel(i.days[0]!.date)} · {money(i.netPnl)} · {i.trades} trades
                          clôturés
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Consultez un mois antérieur avec davantage d’historique de trading.
                        </span>
                      </div>
                    )}
                    <details className="mt-3 border-t pt-3">
                      <summary className="cursor-pointer rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                        Valeurs quotidiennes et liens vers les trades ({i.tradingDays})
                      </summary>
                      <div className="mt-2 max-h-60 overflow-auto">
                        <table className="w-full text-left text-xs">
                          <caption className="sr-only">
                            Résultats quotidiens pour le mois et les filtres actuels
                          </caption>
                          <thead className="sticky top-0 bg-card text-muted-foreground">
                            <tr>
                              <th scope="col" className="py-2 font-medium">
                                Jour de clôture
                              </th>
                              <th scope="col" className="text-right font-medium">
                                Trades
                              </th>
                              <th scope="col" className="text-right font-medium">
                                Résultat net
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {i.days.map((day) => (
                              <tr key={day.date} className="border-t">
                                <th scope="row" className="py-2 font-normal">
                                  <Link
                                    href={href(day.date)}
                                    className="rounded underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    {dateLabel(day.date)}
                                  </Link>
                                </th>
                                <td className="text-right tabular-nums">{day.trades}</td>
                                <td className="text-right">{money(day.netPnl)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <h3 className="text-sm font-medium">Performance par jour de la semaine</h3>
                    <p className="text-xs text-muted-foreground">
                      Résultat net par jour de clôture · {currency} · Sélectionnez une ligne
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-3 rounded-lg bg-muted/40 px-3 py-2">
                      <div className="text-[11px] text-muted-foreground">Jour le plus rentable</div>
                      <div className="mt-0.5 flex flex-wrap justify-between gap-1 text-sm font-medium">
                        {i.mostProfitableWeekday ? (
                          <>
                            <span>{weekdayNames[i.mostProfitableWeekday.index]}</span>
                            {money(i.mostProfitableWeekday.netPnl)}
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            Aucun jour de la semaine rentable pour le moment
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {i.weekdays.map((day) => (
                        <HoverHint
                          key={day.index}
                          heading={weekdayNames[day.index]}
                          content={`${day.days.length} jours de trading · ${day.trades} trades clôturés · ${privateMode ? "Résultat masqué" : fmtMoney(day.netPnl, currency)}`}
                        >
                          <button
                            type="button"
                            disabled={!day.trades}
                            onClick={() => setWeekday(weekday === day.index ? null : day.index)}
                            aria-pressed={weekday === day.index}
                            aria-label={`${weekdayNames[day.index]} : ${day.trades} trades${privateMode ? "" : `, ${fmtMoney(day.netPnl, currency)}`}. Consulter les jours de clôture.`}
                            className={cn(
                              "grid w-full grid-cols-[2rem_minmax(0,1fr)_5.75rem] items-center gap-2 rounded-md px-2 py-2 text-left text-xs outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:hover:bg-transparent",
                              weekday === day.index && "bg-accent",
                            )}
                          >
                            <span>{weekdayNames[day.index]!.slice(0, 3)}</span>
                            <span aria-hidden="true" className="relative h-4">
                              <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                              <span
                                className={cn(
                                  "absolute top-1 h-2 rounded-sm",
                                  day.netPnl > 0
                                    ? "bg-profit"
                                    : day.netPnl < 0
                                      ? "bg-loss"
                                      : "bg-muted-foreground",
                                )}
                                style={{
                                  left:
                                    day.netPnl < 0
                                      ? `${50 - (Math.abs(day.netPnl) / peak) * 50}%`
                                      : "50%",
                                  width:
                                    day.netPnl === 0
                                      ? "2px"
                                      : `${(Math.abs(day.netPnl) / peak) * 50}%`,
                                }}
                              />
                            </span>
                            <span className="text-right">
                              {day.trades ? money(day.netPnl) : "—"}
                            </span>
                          </button>
                        </HoverHint>
                      ))}
                    </div>
                    {selected && (
                      <div className="mt-3 border-t pt-3" aria-live="polite">
                        <p className="mb-2 text-xs font-medium">
                          {weekdayNames[selected.index]} · {selected.trades} trades sur{" "}
                          {selected.days.length} jours
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {selected.days.map((day) => (
                            <Link
                              key={day.date}
                              href={href(day.date)}
                              className="rounded-md border px-2 py-1.5 text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {dateLabel(day.date)}{" "}
                              <span className="text-muted-foreground">· {day.trades} trades</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              {i.tradingDays < 5 && (
                <p className="px-1 text-xs text-muted-foreground">
                  Échantillon réduit : {i.tradingDays} jour{i.tradingDays === 1 ? "" : "s"} de
                  trading. Les résultats par jour de la semaine et la régularité ne décrivent que
                  cette sélection.
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
