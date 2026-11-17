"use client";

import type { AnalysisFilters, BucketStats } from "@luxalgo/journal-core";
import { TimeHeatmap } from "./charts/time-heatmap";
import { ReviewExport } from "./review-export";
import { MonetaryValue } from "./privacy";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { useApi } from "@/lib/use-api";
import { fmtMoney, fmtPercent, pnlClass } from "@/lib/utils";
import { describeFilters } from "@/lib/filter-description";

interface OverviewData {
  buckets: Record<
    "symbol" | "tag" | "mistake" | "playbook" | "weekday" | "hour" | "duration" | "direction",
    BucketStats[]
  >;
  currencies: string[];
  timeZone: string;
  accounts: { id: string; name: string }[];
  playbooks: { id: string; name: string }[];
}

// Keep the original overview's aggregations and ordering alongside the advanced reports.
const SECTIONS = [
  { key: "symbol", title: "Par symbole" },
  { key: "direction", title: "Achats et ventes" },
  { key: "weekday", title: "Par jour de la semaine" },
  { key: "duration", title: "Par durée de détention" },
  { key: "tag", title: "Par étiquette" },
  { key: "mistake", title: "Par erreur" },
  { key: "playbook", title: "Par plan de trading" },
] as const;

export function ReportOverview({ query, filters }: { query: string; filters: AnalysisFilters }) {
  const { data, error, loading } = useApi<OverviewData>(`/api/stats?${query}`);
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  if (loading || !data) return <Skeleton className="h-72" />;
  if (data.currencies.length > 1)
    return (
      <p className="rounded-lg border p-4 text-sm">
        Ces comptes utilisent différentes devises ({data.currencies.join(", ")}). Sélectionnez des
        comptes dans la même devise dans les filtres pour comparer les résultats monétaires.
      </p>
    );
  const currency = data.currencies[0] ?? "USD";
  const label = (dimension: string, key: string) =>
    dimension === "playbook" ? (data.playbooks.find((book) => book.id === key)?.name ?? key) : key;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Vue d’ensemble du trading · {data.timeZone} · {currency}
        </p>
        <ReviewExport
          containsFinancialData
          document={{
            title: "Vue d’ensemble du trading",
            subtitle: `${data.timeZone} · ${currency}`,
            lines: [
              `Filtres : ${describeFilters(filters, data.accounts, data.playbooks)}`,
              "",
              "Performance selon l’heure d’ouverture des trades",
              ...data.buckets.hour.map(
                (b) =>
                  `${b.key}:00 : ${b.trades} trades | Résultat net ${fmtMoney(b.netPnl, currency)}`,
              ),
              ...SECTIONS.flatMap((section) => [
                "",
                section.title,
                ...data.buckets[section.key].map(
                  (b) =>
                    `${label(section.key, b.key)} : ${b.trades} trades | Gagnants ${fmtPercent(b.winRate, 0)} | Résultat net ${fmtMoney(b.netPnl, currency)}`,
                ),
              ]),
            ],
          }}
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Performance selon l’heure d’ouverture des trades</CardTitle>
          </CardHeader>
          <CardContent>
            <TimeHeatmap hours={data.buckets.hour} currency={currency} />
          </CardContent>
        </Card>
        {SECTIONS.map((section) => (
          <Card key={section.key}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.buckets[section.key].length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {section.key === "tag" || section.key === "mistake" || section.key === "playbook"
                    ? "Ajoutez des annotations aux trades pour afficher cette répartition."
                    : "Aucune donnée pour le moment."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{section.title.replace(/^Par /, "")}</TableHead>
                      <TableHead className="text-right">Trades</TableHead>
                      <TableHead className="text-right">Gagnants (%)</TableHead>
                      <TableHead className="text-right">Résultat net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.buckets[section.key].map((bucket) => (
                      <TableRow key={bucket.key}>
                        <TableCell className="font-medium">
                          {label(section.key, bucket.key)}
                        </TableCell>
                        <TableCell className="tnum text-right text-muted-foreground">
                          {bucket.trades}
                        </TableCell>
                        <TableCell className="tnum text-right">
                          {fmtPercent(bucket.winRate, 0)}
                        </TableCell>
                        <TableCell className={`tnum text-right ${pnlClass(bucket.netPnl)}`}>
                          <MonetaryValue>{fmtMoney(bucket.netPnl, currency)}</MonetaryValue>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Le jour de la semaine et l’heure sont basés sur l’ouverture des trades. Les totaux de la vue
        d’ensemble incluent les positions ouvertes ; le taux de réussite ne concerne que les trades
        clôturés. La durée de détention nécessite un trade clôturé. Les étiquettes et erreurs
        peuvent se chevaucher. La vue par symbole affiche les 20 meilleurs résultats nets ; les
        répartitions incluent tous les symboles et des mesures supplémentaires sur les trades
        clôturés.
      </p>
    </div>
  );
}
