"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  clockLabel,
  plotTradePoints,
  type PlottedTrade,
  type TradeExplorerResponse,
  type TradeXAxis,
  type TradeYAxis,
} from "@/lib/trade-explorer";
import { useApi } from "@/lib/use-api";
import { ReportMarketEstimates } from "./report-market-estimates";
import { MonetaryValue } from "./privacy";
import { fmtMoney } from "@/lib/utils";
import { Pnl } from "./pnl";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { OptionSelect } from "./ui/option-select";
import { Skeleton } from "./ui/skeleton";

const TradeScatter = dynamic(
  () => import("./charts/trade-scatter").then((module) => module.TradeScatter),
  {
    loading: () => (
      <div role="status" aria-label="Chargement du graphique de dispersion">
        <Skeleton className="h-80" />
      </div>
    ),
  },
);
const PAGE_SIZE = 25;
const detailHref = (key: string) => `/trades/${encodeURIComponent(key)}`;

export function TradeExplorer({ query }: { query: string }) {
  const { data, error, loading, refresh } = useApi<TradeExplorerResponse>(
    `/api/trade-explorer?${query}`,
  );
  const [x, setX] = useState<TradeXAxis>("durationMinutes");
  const [y, setY] = useState<TradeYAxis>("netPnl");
  const [selected, setSelected] = useState<PlottedTrade | null>(null);
  const [page, setPage] = useState(0);
  const [tableOpen, setTableOpen] = useState(false);
  const points = useMemo(() => plotTradePoints(data?.points ?? [], x, y), [data, x, y]);
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat("fr-FR", {
        timeZone: data?.timeZone ?? "UTC",
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [data?.timeZone],
  );
  if (loading && !data)
    return (
      <div role="status" aria-label="Chargement de l’explorateur de trades">
        <Skeleton className="h-96" />
      </div>
    );
  if (error || !data)
    return (
      <div role="alert" className="rounded-xl border p-5">
        <p className="text-sm text-destructive">
          {error ?? "Impossible de charger l’explorateur de trades."}
        </p>
        <Button onClick={refresh} variant="outline" size="sm" className="mt-3">
          Réessayer
        </Button>
      </div>
    );
  const currency = data.currencies[0] ?? "USD";
  const excursion = x === "mae" || x === "mfe" || y === "mae" || y === "mfe";
  const blocked = (y !== "realizedR" || excursion) && data.currencies.length > 1;
  const xTitle =
    x === "durationMinutes"
      ? "Durée (minutes)"
      : x === "entryMinute"
        ? `Heure d’entrée (${data.timeZone})`
        : `Estimation ${x.toUpperCase()} (${currency})`;
  const yTitle =
    y === "netPnl"
      ? `Résultat net (${currency})`
      : y === "realizedR"
        ? "R réalisé"
        : `Estimation ${y.toUpperCase()} (${currency})`;
  const value = (point: PlottedTrade) =>
    y === "mae" || y === "mfe" ? (
      <MonetaryValue>{fmtMoney(point.y, currency)}</MonetaryValue>
    ) : y === "netPnl" ? (
      <Pnl value={point.y} currency={currency} />
    ) : (
      <span className="tabular-nums">
        {point.y > 0 ? "+" : ""}
        {point.y.toFixed(2)}R
      </span>
    );
  const xValue = (point: PlottedTrade) =>
    x === "mae" || x === "mfe" ? (
      <MonetaryValue>{fmtMoney(point.x, currency)}</MonetaryValue>
    ) : x === "entryMinute" ? (
      clockLabel(point.x)
    ) : (
      `${point.x.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} min`
    );
  const pages = Math.ceil(points.length / PAGE_SIZE);
  const shownPage = Math.min(page, Math.max(0, pages - 1));
  const table = (
    <div className="space-y-3 px-4 pb-4">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <caption className="pb-3 text-left text-muted-foreground">
            {points.length} trades comparables, de la clôture la plus récente à la plus ancienne.
            Chaque lien ouvre le trade d’origine.
          </caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className="py-2 pr-3">
                Trade / clôture
              </th>
              <th scope="col" className="px-2 text-right">
                {xTitle}
              </th>
              <th scope="col" className="pl-2 text-right">
                {yTitle}
              </th>
            </tr>
          </thead>
          <tbody>
            {points.slice(shownPage * PAGE_SIZE, (shownPage + 1) * PAGE_SIZE).map((point) => (
              <tr key={point.key} className="border-b last:border-0">
                <th scope="row" className="py-3 pr-3 font-normal">
                  <Link
                    href={detailHref(point.key)}
                    className="rounded underline underline-offset-4"
                  >
                    <span className="break-all font-medium">
                      {point.symbol} ·{" "}
                      {point.direction === "long" ? "Achat (long)" : "Vente (short)"}
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      {date.format(new Date(point.closedAt))}
                    </span>
                  </Link>
                </th>
                <td className="px-2 text-right tabular-nums">{xValue(point)}</td>
                <td className="pl-2 text-right">{value(point)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={shownPage === 0}
            onClick={() => setPage(shownPage - 1)}
          >
            Précédent
          </Button>
          <p aria-live="polite" className="text-xs text-muted-foreground">
            Page {shownPage + 1} sur {pages}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={shownPage === pages - 1}
            onClick={() => setPage(shownPage + 1)}
          >
            Suivant
          </Button>
        </div>
      )}
    </div>
  );
  return (
    <section className="space-y-4" aria-labelledby="trade-explorer-title" data-trade-explorer>
      <div>
        <h2 id="trade-explorer-title" className="text-lg font-semibold">
          Explorateur de trades
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Comparez les trades individuels, pas les moyennes des groupes · Compte et filtres actifs ·{" "}
          {data.timeZone}
        </p>
      </div>
      <ReportMarketEstimates
        points={data.points}
        currencies={data.currencies}
        onComplete={refresh}
      />
      <div className="flex flex-wrap gap-2" aria-label="Préréglages du graphique de dispersion">
        {(
          [
            ["durationMinutes", "netPnl", "Durée de détention"],
            ["mae", "netPnl", "MAE / résultat net"],
            ["mfe", "netPnl", "MFE / résultat net"],
            ["mae", "mfe", "MAE / MFE"],
          ] as const
        ).map(([nextX, nextY, label]) => (
          <Button
            key={label}
            size="sm"
            variant={x === nextX && y === nextY ? "secondary" : "outline"}
            onClick={() => {
              setX(nextX);
              setY(nextY);
              setSelected(null);
              setPage(0);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <CardTitle>
                {excursion
                  ? `${xTitle} vs ${yTitle}`
                  : `Résultats des trades selon ${x === "durationMinutes" ? "la durée de détention" : "l’heure d’entrée"}`}
              </CardTitle>
              <p className="mt-2 text-xs text-muted-foreground">
                {blocked
                  ? `${data.points.length} trades clôturés`
                  : `${points.length} trades comparables sur ${data.points.length} clôturés`}{" "}
                · Un point par trade ·{" "}
                {excursion
                  ? "Estimations de l’excursion brute ; résultat net après frais"
                  : "Après frais"}
              </p>
            </div>
            <div className="flex w-full flex-wrap gap-3 sm:w-auto">
              <div className="min-w-0 flex-1 sm:w-44">
                <label
                  htmlFor="trade-x-axis"
                  className="mb-1.5 block text-xs text-muted-foreground"
                >
                  Axe X
                </label>
                <OptionSelect
                  id="trade-x-axis"
                  value={x}
                  onValueChange={(value) => {
                    setX(value as TradeXAxis);
                    setSelected(null);
                    setPage(0);
                  }}
                >
                  <option value="durationMinutes">Durée (minutes)</option>
                  <option value="entryMinute">Heure d’entrée</option>
                  <option value="mae">MAE estimé</option>
                  <option value="mfe">MFE estimé</option>
                </OptionSelect>
              </div>
              <div className="min-w-0 flex-1 sm:w-44">
                <label
                  htmlFor="trade-y-axis"
                  className="mb-1.5 block text-xs text-muted-foreground"
                >
                  Axe Y
                </label>
                <OptionSelect
                  id="trade-y-axis"
                  value={y}
                  onValueChange={(value) => {
                    setY(value as TradeYAxis);
                    setSelected(null);
                    setPage(0);
                  }}
                >
                  <option value="netPnl">Résultat net</option>
                  <option value="realizedR">R réalisé</option>
                  <option value="mae">MAE estimé</option>
                  <option value="mfe">MFE estimé</option>
                </OptionSelect>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.points.length === 0 ? (
            <div className="py-10 text-center">
              <h3 className="font-medium">Aucun trade clôturé dans cette sélection</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Modifiez la période ou les filtres pour explorer votre historique. Les positions
                ouvertes sont exclues.
              </p>
            </div>
          ) : blocked ? (
            <p role="note" className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">
              Ces trades utilisent différentes devises ({data.currencies.join(", ")}). Sélectionnez
              des comptes dans une même devise pour les axes monétaires, ou utilisez la durée et R
              réalisé pour comparer des résultats normalisés par le risque. Aucune conversion de
              devise n’est appliquée.
            </p>
          ) : (
            <>
              {points.length < data.points.length && (
                <p role="note" className="text-xs leading-relaxed text-muted-foreground">
                  {data.points.length - points.length} trades exclus :{" "}
                  {y === "realizedR"
                    ? "R réalisé nécessite un stop-loss planifié valide et, le cas échéant, un multiplicateur de contrat ; "
                    : ""}
                  {excursion
                    ? "Le MAE/MFE nécessite des estimations de données de marché actuelles et enregistrées. "
                    : ""}
                  Les deux axes nécessitent des valeurs et des horodatages valides.
                </p>
              )}
              {y === "realizedR" && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  R = résultat net ÷ risque planifié à partir de votre stop-loss. Le calcul utilise
                  le prix d’entrée moyen pondéré et la quantité totale à l’entrée ; il ne mesure pas
                  le risque maximal pendant le trade.
                </p>
              )}
              {points.length >= (excursion ? 1 : 8) ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{yTitle}</span>
                    <span className="flex flex-wrap gap-x-4 gap-y-1">
                      <span>
                        <span aria-hidden="true" className="text-[var(--profit)]">
                          ●
                        </span>{" "}
                        Résultat net positif
                      </span>
                      <span>
                        <span aria-hidden="true" className="text-[var(--loss)]">
                          ●
                        </span>{" "}
                        Résultat net négatif
                      </span>
                      <span>
                        <span aria-hidden="true">●</span> Résultat net nul
                      </span>
                    </span>
                  </div>
                  <TradeScatter
                    points={points}
                    x={x}
                    y={y}
                    currency={currency}
                    timeZone={data.timeZone}
                    onSelect={setSelected}
                  />
                  <p className="text-center text-xs text-muted-foreground">{xTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    Sélectionnez un point pour examiner le trade correspondant. Les points
                    superposés restent accessibles individuellement dans le tableau.
                  </p>
                  <div aria-live="polite">
                    {selected && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-4">
                        <div>
                          <p className="text-sm font-medium break-all">
                            {selected.symbol} ·{" "}
                            {selected.direction === "long" ? "Achat (long)" : "Vente (short)"} ·{" "}
                            {value(selected)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {xValue(selected)} · Clôturé le{" "}
                            {date.format(new Date(selected.closedAt))}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Link
                            href={detailHref(selected.key)}
                            className="rounded text-sm underline underline-offset-4"
                          >
                            Ouvrir le trade ↗
                          </Link>
                          <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                            Fermer
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="rounded-lg bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                  {points.length === 0
                    ? "Aucun trade ne contient les données requises pour ces axes. Essayez un autre axe ou modifiez vos filtres."
                    : "Moins de 8 trades comparables. Consultez les valeurs exactes ci-dessous ou élargissez vos filtres pour afficher un graphique de dispersion pertinent."}
                </p>
              )}
              {points.length > 0 && points.length < 20 && (
                <p className="text-xs text-muted-foreground">
                  Échantillon réduit : interprétez les tendances apparentes avec prudence jusqu’à ce
                  que davantage de trades soient disponibles.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
      {!blocked &&
        points.length > 0 &&
        (points.length < 8 ? (
          <Card>
            <CardHeader>
              <CardTitle>Trades comparables</CardTitle>
            </CardHeader>
            {table}
          </Card>
        ) : (
          <details
            className="rounded-xl border bg-card"
            onToggle={(event) => setTableOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium">
              Explorer les {points.length} trades
            </summary>
            {tableOpen && table}
          </details>
        ))}
      <p className="text-xs leading-relaxed text-muted-foreground">
        La durée correspond au temps écoulé entre la première entrée et la dernière sortie, y
        compris la nuit. L’heure d’entrée utilise le fuseau horaire du journal ; les heures proches
        de minuit apparaissent aux deux extrémités de cet axe. Les tendances décrivent cette
        sélection, sans indiquer de causalité ni de durée de détention recommandée.
      </p>
    </section>
  );
}
