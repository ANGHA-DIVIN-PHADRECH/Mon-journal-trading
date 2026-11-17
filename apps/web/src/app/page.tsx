"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import type {
  CalendarMonth,
  DayStats,
  EdgeScore,
  EquityPoint,
  TradeMetrics,
} from "@luxalgo/journal-core";
import { dayKeyOf, relativeDrawdownCurve } from "@luxalgo/journal-core";
import { CurrencyNotice } from "@/components/currency-notice";
import type { CurrencyScope } from "@/lib/currencies";
import { CalendarPnl } from "@/components/calendar-pnl";
import { DailyBars } from "@/components/charts/daily-bars";
import { EdgeRadar } from "@/components/charts/edge-radar";
import { EquityArea } from "@/components/charts/equity-area";
import { Gauge } from "@/components/charts/gauge";
import { RelativeDrawdownBars } from "@/components/charts/relative-drawdown-bars";
import { TimeHeatmap } from "@/components/charts/time-heatmap";
import {
  ArrowUpDown,
  CalendarCheck2,
  CircleDollarSign,
  Flame,
  Scale,
  Sigma,
  Target,
  Timer,
  TrendingDown,
  Trophy,
} from "lucide-react";
import { FilterBar, useFilters } from "@/components/filter-bar";
import { AddTradeDialog } from "@/components/add-trade-dialog";
import { DashboardLayout } from "@/components/dashboard-layout";
import { MonetaryValue } from "@/components/privacy";
import { Pnl } from "@/components/pnl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpHint, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { postJson, useApi } from "@/lib/use-api";
import type { CalendarPnlPoint } from "@/lib/calendar-insights";
import { cn, fmtDuration, fmtMoney, fmtNumber, fmtPercent } from "@/lib/utils";

interface Bucket {
  key: string;
  trades: number;
  netPnl: number;
  winRate: number | null;
}

interface StatsPayload {
  timeZone: string;
  metrics: TradeMetrics | null;
  currencyScope: CurrencyScope;
  currencyGroups: { currency: string; metrics: TradeMetrics }[];
  initialBalance: number;
  edgeScore: EdgeScore | null;
  days: DayStats[];
  dailyCumulative: EquityPoint[];
  calendar: CalendarMonth;
  calendarCurrencies: string[];
  runningPnl: Record<string, CalendarPnlPoint[]>;
  buckets: Record<"symbol" | "weekday" | "hour" | "duration" | "direction", Bucket[]>;
  openPositions: {
    key: string;
    symbol: string;
    direction: string;
    openedAt: string;
    quantity: number;
    avgEntry: number;
    currency: string;
  }[];
  recentTrades: {
    key: string;
    symbol: string;
    closedAt: string;
    netPnl: number;
    currency: string;
    status: string;
  }[];
}

export default function DashboardPage() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  const { query } = useFilters();
  const { data, loading, error, refresh } = useApi<StatsPayload>(`/api/stats?${query}`);

  return (
    <>
      <FilterBar title="Tableau de bord" actions={<AddTradeDialog onSaved={refresh} />} />
      <DashboardContent
        data={data}
        loading={loading}
        error={error}
        refresh={refresh}
        query={query}
      />
    </>
  );
}

function DashboardContent({
  data,
  loading,
  error,
  refresh,
  query,
}: {
  data: StatsPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  query: string;
}) {
  if (loading && !data) return <DashboardSkeleton />;
  if (!data)
    return (
      <div>
        <div className="space-y-3 p-4">
          <p role="alert" className="text-sm text-destructive">
            {error ?? "Impossible de charger le tableau de bord."}
          </p>
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
            onClick={refresh}
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  if (!data.currencyScope.monetary) {
    const closed = data.currencyGroups.reduce((sum, group) => sum + group.metrics.closedTrades, 0);
    const wins = data.currencyGroups.reduce((sum, group) => sum + group.metrics.wins, 0);
    return (
      <>
        <CurrencyNotice scope={data.currencyScope} />
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Tous les comptes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {closed} trades clôturés · {closed ? fmtPercent(wins / closed) : "–"} gagnants
            </CardContent>
          </Card>
          {data.currencyGroups.map((group) => (
            <Card key={group.currency}>
              <CardHeader>
                <CardTitle>Comptes en {group.currency}</CardTitle>
              </CardHeader>
              <CardContent>
                <Pnl
                  value={group.metrics.netPnl}
                  currency={group.currency}
                  className="text-2xl font-semibold"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {group.metrics.closedTrades} trades clôturés · {fmtPercent(group.metrics.winRate)}{" "}
                  gagnants
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </>
    );
  }
  const { metrics: m, edgeScore } = data;
  if (!m || !edgeScore) return null;
  const currency = data.currencyScope.currency ?? "USD";

  if (m.totalTrades === 0)
    return query ? (
      <div>
        <p className="p-12 text-center text-sm text-muted-foreground">
          Aucun trade ne correspond à ces filtres. Effacez ou modifiez les filtres pour afficher
          plus de résultats.
        </p>
      </div>
    ) : (
      <EmptyState />
    );

  // Momentum: net P&L of the last 7 calendar days vs the 7 before them.
  // Hidden when either window has no trading days (e.g. the 7D range).
  const weekDelta = (() => {
    const now = Date.now();
    let last = 0;
    let prior = 0;
    let lastDays = 0;
    let priorDays = 0;
    for (const day of data.days) {
      const ageDays = (now - Date.parse(`${day.date}T00:00:00Z`)) / 86_400_000;
      if (ageDays <= 7) {
        last += day.netPnl;
        lastDays++;
      } else if (ageDays <= 14) {
        prior += day.netPnl;
        priorDays++;
      }
    }
    return lastDays > 0 && priorDays > 0 ? last - prior : null;
  })();
  const bestDay = data.days.length
    ? data.days.reduce((a, b) => (b.netPnl > a.netPnl ? b : a))
    : null;
  const worstDay = data.days.length
    ? data.days.reduce((a, b) => (b.netPnl < a.netPnl ? b : a))
    : null;

  return (
    <>
      <CurrencyNotice scope={data.currencyScope} />
      <DashboardLayout
        widgets={[
          {
            id: "widget-0",
            label: "Résultat net",
            size: "small",
            layoutGroup: "summary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="Résultat net"
                  icon={CircleDollarSign}
                  hint="Gains et pertes réalisés, déduction faite des frais, sur la période sélectionnée."
                />
                <CardContent>
                  <Pnl
                    value={m.netPnl}
                    currency={currency}
                    className="text-3xl font-semibold tracking-tight"
                  />
                  {weekDelta !== null && (
                    <div
                      className={cn(
                        "mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        weekDelta >= 0 ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss",
                      )}
                    >
                      {weekDelta >= 0 ? "▲" : "▼"}{" "}
                      <MonetaryValue>
                        {fmtMoney(Math.abs(weekDelta), currency).replace("+", "")}
                      </MonetaryValue>{" "}
                      par rapport aux 7 jours précédents
                    </div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {m.closedTrades} trades clôturés ·{" "}
                    <MonetaryValue>{fmtMoney(m.fees, currency)}</MonetaryValue> de frais
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-1",
            label: "Trades gagnants (%)",
            size: "small",
            layoutGroup: "summary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="Trades gagnants (%)"
                  icon={Target}
                  hint="Nombre de trades gagnants divisé par le nombre total de trades clôturés, y compris ceux à l’équilibre."
                />
                <CardContent className="flex items-center justify-between gap-2">
                  <Gauge value={m.winRate} label="Taux de trades gagnants" />
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    <div>{m.wins} gagnants</div>
                    <div>{m.breakevens} à l’équilibre</div>
                    <div>{m.losses} perdants</div>
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-2",
            label: "Facteur de profit",
            size: "small",
            layoutGroup: "summary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="Facteur de profit"
                  icon={Scale}
                  hint="Gains bruts ÷ pertes brutes. Au-dessus de 1, les gains dépassent les pertes."
                />
                <CardContent>
                  <div className="text-3xl font-semibold tracking-tight tnum">
                    {m.profitFactorIsInfinite
                      ? "∞"
                      : m.profitFactor === null
                        ? "–"
                        : fmtNumber(m.profitFactor)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    gains bruts ÷ pertes brutes
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-3",
            label: "Journées gagnantes (%)",
            size: "small",
            layoutGroup: "summary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="Journées gagnantes (%)"
                  icon={CalendarCheck2}
                  hint="Journées de trading positives ÷ total des journées de trading sur la période sélectionnée."
                />
                <CardContent className="flex items-center justify-between gap-2">
                  <Gauge value={m.dayWinRate} label="Taux de journées gagnantes" />
                  <div className="text-xs text-muted-foreground">{m.tradingDays} jours</div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-4",
            label: "Gain / perte moyen",
            size: "small",
            layoutGroup: "summary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="Gain / perte moyen"
                  icon={ArrowUpDown}
                  hint="Gain moyen par trade gagnant ÷ perte moyenne par trade perdant. La barre compare les deux à l’échelle."
                />
                <CardContent>
                  <div className="text-3xl font-semibold tracking-tight tnum">
                    {m.avgWinLossRatio === null ? "–" : fmtNumber(m.avgWinLossRatio)}
                  </div>
                  {m.avgWin !== null && m.avgLoss !== null && m.avgWin + m.avgLoss > 0 && (
                    <div
                      className="journal-progress-visual mt-2 flex h-1.5 gap-0.5"
                      role="img"
                      aria-label="Comparaison à l’échelle du gain moyen et de la perte moyenne"
                    >
                      <span
                        className="rounded-full bg-profit"
                        style={{
                          width: `${((m.avgWin / (m.avgWin + m.avgLoss)) * 100).toFixed(1)}%`,
                        }}
                      />
                      <span className="flex-1 rounded-full bg-loss" />
                    </div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    <span className="text-profit">
                      {m.avgWin === null ? (
                        "–"
                      ) : (
                        <MonetaryValue>{fmtMoney(m.avgWin, currency)}</MonetaryValue>
                      )}
                    </span>
                    {" gain moyen · "}
                    <span className="text-loss">
                      {m.avgLoss === null ? (
                        "–"
                      ) : (
                        <MonetaryValue>{fmtMoney(-m.avgLoss, currency)}</MonetaryValue>
                      )}
                    </span>
                    {" perte moyenne"}
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-5",
            label: "Score d’avantage",
            size: "medium",
            layoutGroup: "visuals",
            content: (
              <Card className="dashboard-visual-card h-full">
                <CardHeader className="flex-row items-center justify-between">
                  <div className="flex min-w-0 items-center gap-1">
                    <CardTitle>Score d’avantage</CardTitle>
                    <HelpHint heading="Score d’avantage">
                      Score de 0 à 100 combinant le taux de trades gagnants, le facteur de profit,
                      le gain/perte moyen, le drawdown, la récupération et la régularité. Nécessite
                      au moins cinq trades clôturés.
                    </HelpHint>
                  </div>
                  <span className="text-2xl font-semibold tracking-tight tnum">
                    {edgeScore.score === null ? (
                      "–"
                    ) : (
                      <span className="text-brand">{edgeScore.score}</span>
                    )}
                    <span className="text-xs text-muted-foreground"> /100</span>
                  </span>
                </CardHeader>
                <CardContent className="dashboard-visual-card-content">
                  {edgeScore.score === null ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Il faut au moins 5 trades clôturés. La formule est publique —{" "}
                      <a
                        className="underline"
                        href="https://github.com/LuxAlgo/trade-journal/blob/main/docs/edge-score.md"
                        target="_blank"
                        rel="noreferrer"
                      >
                        la consulter
                      </a>
                      .
                    </p>
                  ) : (
                    <EdgeRadar components={edgeScore.components} height="100%" />
                  )}
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-6",
            label: "Résultat cumulé",
            size: "medium",
            layoutGroup: "visuals",
            content: (
              <Card className="dashboard-visual-card h-full">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Résultat net cumulé par jour</CardTitle>
                  <HelpHint heading="Résultat cumulé">
                    Total cumulé des gains et pertes nets sur la période sélectionnée. Les barres de
                    drawdown ci-dessous indiquent les baisses depuis le plus haut du capital.
                  </HelpHint>
                </CardHeader>
                <CardContent>
                  <EquityArea
                    currency={currency}
                    data={data.dailyCumulative.map((p) => ({ t: p.t, cumNetPnl: p.cumNetPnl }))}
                  />
                  <RelativeDrawdownBars
                    data={relativeDrawdownCurve(data.dailyCumulative, data.initialBalance)}
                  />
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-7",
            label: "Résultat quotidien",
            size: "medium",
            layoutGroup: "visuals",
            content: (
              <Card className="dashboard-visual-card h-full">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Résultat net quotidien</CardTitle>
                  <HelpHint heading="Résultat quotidien">
                    Gain ou perte net de chaque journée de trading. Les barres au-dessus de zéro
                    représentent les gains, celles en dessous les pertes.
                  </HelpHint>
                </CardHeader>
                <CardContent className="dashboard-visual-card-content">
                  <DailyBars
                    currency={currency}
                    data={data.days.map((d) => ({ date: d.date, netPnl: d.netPnl }))}
                    height="100%"
                  />
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-8",
            label: "Calendrier",
            size: "wide",
            layoutGroup: "detail",
            content: (
              <Card className="h-full">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>
                    {new Date(Date.UTC(data.calendar.year, data.calendar.month - 1)).toLocaleString(
                      "fr-FR",
                      { month: "long", year: "numeric", timeZone: "UTC" },
                    )}
                  </CardTitle>
                  <Link
                    href={`/calendar?${query}`}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Calendrier complet
                  </Link>
                </CardHeader>
                <CardContent>
                  <CalendarPnl
                    calendar={data.calendar}
                    runningPnl={data.runningPnl}
                    currency={data.calendarCurrencies[0] ?? "USD"}
                    monetary={data.calendarCurrencies.length <= 1}
                  />
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-9",
            label: "Activité",
            size: "medium",
            layoutGroup: "detail",
            content: (
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Activité</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="recent">
                    <TabsList className="h-8">
                      <TabsTrigger value="recent" className="text-xs">
                        Trades récents
                      </TabsTrigger>
                      <TabsTrigger value="open" className="text-xs">
                        Positions ouvertes
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="recent" className="space-y-1">
                      {data.recentTrades.length === 0 && (
                        <Empty label="Aucun trade clôturé pour le moment" />
                      )}
                      {data.recentTrades.map((trade) => (
                        <Link
                          key={trade.key}
                          href={`/trades/${encodeURIComponent(trade.key)}?${query}`}
                          className="dashboard-activity-row flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent/60"
                        >
                          <span className="flex items-center gap-2">
                            <Badge
                              variant={
                                trade.status === "win"
                                  ? "profit"
                                  : trade.status === "loss"
                                    ? "loss"
                                    : "secondary"
                              }
                            >
                              {trade.status === "win"
                                ? "GAGNANT"
                                : trade.status === "loss"
                                  ? "PERDANT"
                                  : "À L’ÉQUILIBRE"}
                            </Badge>
                            {trade.symbol}
                          </span>
                          <span className="dashboard-activity-detail flex items-center">
                            <span className="text-xs text-muted-foreground">
                              {trade.closedAt && dayKeyOf(trade.closedAt, data.timeZone)}
                            </span>
                            <Pnl value={trade.netPnl} currency={trade.currency} />
                          </span>
                        </Link>
                      ))}
                    </TabsContent>
                    <TabsContent value="open" className="space-y-1">
                      {data.openPositions.length === 0 && (
                        <Empty label="À l’équilibre — aucune position ouverte" />
                      )}
                      {data.openPositions.map((position) => (
                        <div
                          key={position.key}
                          className="dashboard-activity-row flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
                        >
                          <span className="flex items-center gap-2">
                            <Badge variant="secondary">
                              {position.direction === "long" ? "ACHAT (LONG)" : "VENTE (SHORT)"}
                            </Badge>
                            {position.symbol}
                          </span>
                          <span className="tnum text-xs text-muted-foreground">
                            {fmtNumber(position.quantity, 4)} @{" "}
                            <MonetaryValue>
                              {fmtNumber(position.avgEntry)} {position.currency}
                            </MonetaryValue>
                          </span>
                        </div>
                      ))}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-10",
            label: "Drawdown maximal",
            size: "small",
            layoutGroup: "secondary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="Drawdown maximal"
                  icon={TrendingDown}
                  hint="Plus forte baisse entre un sommet et un creux de la courbe de résultat cumulé."
                />
                <CardContent>
                  <div className="text-xl font-semibold tnum text-loss">
                    <MonetaryValue>{fmtMoney(-m.maxDrawdown, currency)}</MonetaryValue>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {m.maxDrawdownPct === null
                      ? "Indiquez un solde initial pour obtenir le pourcentage"
                      : fmtPercent(m.maxDrawdownPct)}
                    {m.recoveryFactor !== null &&
                      ` · facteur de récupération ${fmtNumber(m.recoveryFactor)}x`}
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-11",
            label: "Séries",
            size: "small",
            layoutGroup: "secondary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="Séries"
                  icon={Flame}
                  hint="Série actuelle de trades gagnants ou perdants consécutifs, avec les meilleures et les pires séries."
                />
                <CardContent>
                  <div className="text-xl font-semibold tnum">
                    {m.currentStreak > 0
                      ? `${m.currentStreak}G`
                      : m.currentStreak < 0
                        ? `${-m.currentStreak}P`
                        : "–"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    meilleure série : {m.maxWinStreak} gagnants · pire série : {m.maxLossStreak}{" "}
                    perdants
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-12",
            label: "Espérance par trade",
            size: "small",
            layoutGroup: "secondary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="Espérance par trade"
                  icon={Sigma}
                  hint="Résultat net moyen par trade clôturé, calculé à partir de vos données."
                />
                <CardContent>
                  {m.expectancy === null ? (
                    "–"
                  ) : (
                    <Pnl
                      value={m.expectancy}
                      currency={currency}
                      className="text-xl font-semibold"
                    />
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {m.avgRealizedR !== null && m.tradesWithRisk > 0
                      ? `moyenne de ${fmtNumber(m.avgRealizedR)}R sur ${m.tradesWithRisk} trades avec un risque défini`
                      : "renseignez les stop-loss pour afficher les multiples R"}
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-13",
            label: "Durée moyenne",
            size: "small",
            layoutGroup: "secondary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="Durée moyenne"
                  icon={Timer}
                  hint="Temps moyen entre l’exécution de la première entrée et la clôture finale."
                />
                <CardContent>
                  <div className="text-xl font-semibold tnum">{fmtDuration(m.avgDurationMs)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    gagnants et perdants dans les rapports
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-14",
            label: "Meilleure / pire journée",
            size: "small",
            layoutGroup: "secondary",
            content: (
              <Card className="h-full">
                <StatHeader
                  title="Meilleure / pire journée"
                  icon={Trophy}
                  hint="Résultat net journalier le plus élevé et le plus faible sur la période sélectionnée."
                />
                <CardContent className="space-y-1">
                  {bestDay && (
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <Pnl
                        value={bestDay.netPnl}
                        currency={currency}
                        className="text-base font-semibold"
                      />
                      <span className="text-xs text-muted-foreground">{bestDay.date.slice(5)}</span>
                    </div>
                  )}
                  {worstDay && (
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <Pnl
                        value={worstDay.netPnl}
                        currency={currency}
                        className="text-base font-semibold"
                      />
                      <span className="text-xs text-muted-foreground">
                        {worstDay.date.slice(5)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ),
          },
          {
            id: "widget-15",
            label: "Résultats selon l’heure de trading",
            size: "full",
            layoutGroup: "full",
            content: (
              <Card className="h-full">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Résultats selon l’heure de trading</CardTitle>
                  <HelpHint heading="Résultats selon l’heure de trading">
                    Trades regroupés selon leur heure d’ouverture. Le graphique supérieur montre le
                    résultat net ; celui du bas indique le nombre de trades.
                  </HelpHint>
                </CardHeader>
                <CardContent>
                  <TimeHeatmap
                    currency={currency}
                    hours={data.buckets.hour.map((b) => ({
                      key: b.key,
                      netPnl: b.netPnl,
                      trades: b.trades,
                    }))}
                  />
                </CardContent>
              </Card>
            ),
          },
        ]}
      />
    </>
  );
}

/** Stat-tile header: quiet label left, metric icon with an explainer right. */
function StatHeader({
  title,
  hint,
  icon: Icon,
}: {
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <CardHeader className="flex-row items-center justify-between space-y-0">
      <CardTitle>{title}</CardTitle>
      <Tooltip>
        <TooltipTrigger className="cursor-help" aria-label={`À propos de ${title}`}>
          <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />
        </TooltipTrigger>
        <TooltipContent>
          <div className="mb-1 font-semibold">{title}</div>
          <div className="text-muted-foreground">{hint}</div>
        </TooltipContent>
      </Tooltip>
    </CardHeader>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="px-2 py-6 text-center text-sm text-muted-foreground">{label}</p>;
}

function EmptyState() {
  const [loadingDemo, setLoadingDemo] = useState(false);
  const loadDemo = async () => {
    setLoadingDemo(true);
    try {
      await postJson("/api/demo", {});
      window.location.reload();
    } catch {
      setLoadingDemo(false);
    }
  };
  return (
    <div>
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-24 text-center">
        <h2 className="text-xl font-semibold">Votre journal est vide</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Connectez un courtier pour synchroniser automatiquement vos données, importez un relevé de
          plus de 10 plateformes (y compris un export TradeZella) ou ajoutez vos trades
          manuellement.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/import"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Importer vos premiers trades
          </Link>
          <button
            onClick={loadDemo}
            disabled={loadingDemo}
            className="rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {loadingDemo ? "Chargement…" : "Charger les données de démonstration"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Les données de démonstration sont placées dans un compte séparé ; vous pouvez les
          supprimer à tout moment dans la section Comptes.
        </p>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div>
      <div className="dashboard-grid-stage space-y-3 p-4">
        <div className="dashboard-grid grid gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} data-card-size="small" className="dashboard-grid-card h-28" />
          ))}
        </div>
        <div className="dashboard-grid grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} data-card-size="medium" className="dashboard-grid-card h-72" />
          ))}
        </div>
      </div>
    </div>
  );
}
