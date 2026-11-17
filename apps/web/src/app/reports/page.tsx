"use client";
import { OptionSelect } from "@/components/ui/option-select";

import { HoverHint } from "@/components/ui/tooltip";
import { Suspense, useState } from "react";
import dynamic from "next/dynamic";
import {
  DIMENSIONS,
  type Dimension,
  type AnalysisFilters,
  type GroupSummary,
} from "@luxalgo/journal-core";
import { FilterBar, useFilters } from "@/components/filter-bar";
import { FilterFields, Field, fieldClass } from "@/components/filter-fields";
import { ReviewExport } from "@/components/review-export";
import { AskJournal } from "@/components/ask-journal";
import { ReportOverview } from "@/components/report-overview";
import { MonetaryValue, usePrivacy } from "@/components/privacy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApi } from "@/lib/use-api";
import { describeFilters } from "@/lib/filter-description";
import { fmtDuration, fmtNumber, fmtPercent } from "@/lib/utils";
const TradeExplorer = dynamic(
  () => import("@/components/trade-explorer").then((module) => module.TradeExplorer),
  {
    loading: () => (
      <p role="status" className="py-6 text-sm text-muted-foreground">
        Chargement de l’explorateur de trades…
      </p>
    ),
  },
);
const PerformanceTrendsReport = dynamic(
  () => import("@/components/performance-trends").then((module) => module.PerformanceTrendsReport),
  {
    loading: () => (
      <p role="status" className="py-6 text-sm text-muted-foreground">
        Chargement des tendances de performance…
      </p>
    ),
  },
);
interface Group extends GroupSummary {
  row: string;
  column: string;
}
interface Analysis {
  accounts: { id: string; name: string }[];
  summary: GroupSummary;
  groups: Group[];
  playbooks: { id: string; name: string }[];
  currencies: string[];
  timeZone: string;
}
const number = (n: number | null) => (n === null ? "-" : fmtNumber(n));
const percent = (n: number | null) => fmtPercent(n);
const money = (n: number, currency: string) => `${number(n)} ${currency}`;
const dimensionName = (dimension: Dimension) =>
  ({
    symbol: "Symbole",
    playbook: "Plan de trading",
    tag: "Étiquette",
    mistake: "Erreur",
    direction: "Sens",
    assetClass: "Classe d’actifs",
    weekday: "Jour de la semaine",
    month: "Mois",
    entryHour: "Heure d’entrée",
    exitHour: "Heure de sortie",
    entry15: "Entrée (15 min)",
    exit15: "Sortie (15 min)",
    duration: "Durée de détention",
    quantity: "Taille de position",
    entryPrice: "Prix d’entrée",
    exitPrice: "Prix de sortie",
    realizedR: "R réalisé",
    plannedR: "R prévu",
    outcome: "Résultat",
  })[dimension];
function Summary({ data }: { data: Analysis }) {
  const s = data.summary;
  return (
    <div className="report-summary">
      <div className="report-summary-grid grid grid-cols-2 gap-4">
        {[
          ["Trades clôturés", String(s.trades)],
          ["Résultat net", money(s.netPnl, data.currencies[0] ?? "USD")],
          ["Taux de réussite", percent(s.winRate)],
          ["Facteur de profit", s.noLosses ? "∞" : number(s.profitFactor)],
          ["Volume d’entrée", number(s.volume)],
          ["Durée moyenne de détention", fmtDuration(s.avgDurationMs)],
          ["R prévu moyen", number(s.avgPlannedR)],
          ["R réalisé moyen", number(s.avgRealizedR)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 break-words text-base font-semibold tabular-nums sm:text-lg">
              {label === "Résultat net" ? <MonetaryValue>{value}</MonetaryValue> : value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
function DimensionSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Dimension;
  onChange: (d: Dimension) => void;
}) {
  return (
    <Field label={label}>
      <OptionSelect
        className={fieldClass}
        value={value}
        onValueChange={(next) => onChange(next as Dimension)}
      >
        {(Object.keys(DIMENSIONS) as Dimension[]).map((key) => (
          <option key={key} value={key}>
            {dimensionName(key)}
          </option>
        ))}
      </OptionSelect>
    </Field>
  );
}
const labels = (data: Analysis, key: string) =>
  data.playbooks.find((p) => p.id === key)?.name ?? key;
function GroupLabel({ dimension, children }: { dimension: Dimension; children: string }) {
  return dimension === "entryPrice" || dimension === "exitPrice" ? (
    <MonetaryValue>{children}</MonetaryValue>
  ) : (
    children
  );
}
function Breakdown({
  data,
  cross,
  primary,
  secondary,
}: {
  data: Analysis;
  cross: boolean;
  primary: Dimension;
  secondary: Dimension;
}) {
  const rowLabel = (k: string) => (primary === "playbook" ? labels(data, k) : k),
    colLabel = (k: string) => (secondary === "playbook" ? labels(data, k) : k);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekdayLabels: Record<string, string> = {
    Sun: "Dimanche",
    Mon: "Lundi",
    Tue: "Mardi",
    Wed: "Mercredi",
    Thu: "Jeudi",
    Fri: "Vendredi",
    Sat: "Samedi",
  };
  const rows = [...new Set(data.groups.map((g) => g.row))],
    columns = [...new Set(data.groups.map((g) => g.column))].sort((a, b) =>
      secondary === "weekday"
        ? weekdays.indexOf(a) - weekdays.indexOf(b)
        : a.localeCompare(b, undefined, { numeric: true }),
    );
  if (primary === "weekday") rows.sort((a, b) => weekdays.indexOf(a) - weekdays.indexOf(b));
  const max = data.groups.reduce((max, g) => Math.max(max, Math.abs(g.netPnl)), 1);
  const cells = new Map(data.groups.map((g) => [JSON.stringify([g.row, g.column]), g]));
  return (
    <div className="space-y-4">
      {cross && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="p-3 text-left">
                  {dimensionName(primary)} / {dimensionName(secondary)}
                </th>
                {columns.map((c) => (
                  <th key={c} className="min-w-24 p-2">
                    <GroupLabel dimension={secondary}>
                      {secondary === "weekday"
                        ? (weekdayLabels[colLabel(c)] ?? colLabel(c))
                        : colLabel(c)}
                    </GroupLabel>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r}>
                  <th className="p-3 text-left font-medium">
                    <GroupLabel dimension={primary}>
                      {primary === "weekday"
                        ? (weekdayLabels[rowLabel(r)] ?? rowLabel(r))
                        : rowLabel(r)}
                    </GroupLabel>
                  </th>
                  {columns.map((c) => {
                    const g = cells.get(JSON.stringify([r, c]));
                    return (
                      <HoverHint
                        key={c}
                        content={
                          g
                            ? `${g.trades} trades · taux de réussite ${percent(g.winRate)}`
                            : "Aucun trade"
                        }
                      >
                        <td
                          key={c}
                          className="border border-background p-2 text-center tabular-nums"
                          style={{
                            background: g
                              ? `color-mix(in srgb, ${g.netPnl >= 0 ? "var(--profit-fill)" : "var(--loss)"} ${8 + (Math.abs(g.netPnl) / max) * 35}%, transparent)`
                              : undefined,
                          }}
                          tabIndex={0}
                        >
                          {g ? <MonetaryValue>{number(g.netPnl)}</MonetaryValue> : "-"}
                        </td>
                      </HoverHint>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            Les valeurs des cellules correspondent au résultat net en{" "}
            {data.currencies[0] ?? "devise du compte"}.
          </p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              {[
                dimensionName(primary),
                ...(cross ? [dimensionName(secondary)] : []),
                "Trades",
                "Réussite (%)",
                "Résultat net",
                "Volume d’entrée",
                "R prévu moyen",
                "R réalisé moyen",
                "Durée moyenne",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap border-b px-3 py-3 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.groups.map((g) => (
              <tr
                key={JSON.stringify([g.row, g.column])}
                className="border-b border-border/50 hover:bg-accent/30"
              >
                <td className="px-3 py-3 font-medium">
                  <GroupLabel dimension={primary}>{rowLabel(g.row)}</GroupLabel>
                </td>
                {cross && (
                  <td className="px-3 py-3">
                    <GroupLabel dimension={secondary}>{colLabel(g.column)}</GroupLabel>
                  </td>
                )}
                <td className="px-3">{g.trades}</td>
                <td className="px-3">{percent(g.winRate)}</td>
                <td
                  className={`whitespace-nowrap px-3 tabular-nums ${g.netPnl >= 0 ? "text-profit" : "text-loss"}`}
                >
                  <MonetaryValue>{money(g.netPnl, data.currencies[0] ?? "USD")}</MonetaryValue>
                </td>
                <td className="px-3">{number(g.volume)}</td>
                <td className="px-3">{number(g.avgPlannedR)}</td>
                <td className="px-3">{number(g.avgRealizedR)}</td>
                <td className="whitespace-nowrap px-3">{fmtDuration(g.avgDurationMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.groups.length && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Aucun trade clôturé ne correspond à ces filtres.
        </p>
      )}
    </div>
  );
}
export default function ReportsPage() {
  return (
    <Suspense>
      <Reports />
    </Suspense>
  );
}
function Reports() {
  const { query, values } = useFilters();
  const [mode, setMode] = useState<
      "overview" | "trends" | "explorer" | "breakdown" | "cross" | "compare"
    >("overview"),
    [primary, setPrimary] = useState<Dimension>("symbol"),
    [secondary, setSecondary] = useState<Dimension>("weekday");
  const { data, error, loading } = useApi<Analysis>(
    mode === "breakdown" || mode === "cross"
      ? `/api/analysis?${query}&primary=${primary}${mode === "cross" ? `&secondary=${secondary}` : ""}`
      : null,
  );
  const multi = (data?.currencies.length ?? 0) > 1;
  return (
    <div>
      <FilterBar title="Rapports" />
      <div className="space-y-4 p-4">
        <AskJournal />
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["overview", "Vue d’ensemble"],
              ["trends", "Tendances de performance"],
              ["explorer", "Explorateur de trades"],
              ["breakdown", "Répartition"],
              ["cross", "Analyse croisée"],
              ["compare", "Comparer des groupes"],
            ] as const
          ).map(([key, name]) => (
            <Button
              key={key}
              size="sm"
              variant={mode === key ? "default" : "outline"}
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
            >
              {name}
            </Button>
          ))}
        </div>
        <div key={mode} className="journal-report-section space-y-4" data-report-section={mode}>
          {mode === "overview" ? (
            <ReportOverview query={query} filters={values} />
          ) : mode === "trends" ? (
            <PerformanceTrendsReport key={query} query={query} />
          ) : mode === "explorer" ? (
            <TradeExplorer key={query} query={query} />
          ) : mode === "compare" ? (
            <Comparison key={query} initial={values} />
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="flex flex-wrap gap-3">
                      <DimensionSelect
                        label="Regrouper par"
                        value={primary}
                        onChange={setPrimary}
                      />
                      {mode === "cross" && (
                        <DimensionSelect
                          label="Puis par"
                          value={secondary}
                          onChange={setSecondary}
                        />
                      )}
                    </div>
                    {data && !multi && (
                      <ReviewExport
                        containsFinancialData
                        document={{
                          title:
                            mode === "cross"
                              ? `${dimensionName(primary)} par ${dimensionName(secondary)}`
                              : `Résultats : ${dimensionName(primary)}`,
                          subtitle: `${data.timeZone} · ${data.currencies[0] ?? "Devise du compte"}`,
                          lines: [
                            `Filtres : ${describeFilters(values, data.accounts, data.playbooks)}`,
                            `Trades clôturés : ${data.summary.trades} | Résultat net : ${number(data.summary.netPnl)} | Taux de réussite : ${percent(data.summary.winRate)}`,
                            "",
                            ...data.groups.map(
                              (g) =>
                                `${labels(data, g.row)}${g.column ? ` / ${labels(data, g.column)}` : ""} : ${g.trades} trades | Résultat ${number(g.netPnl)} | Réussite ${percent(g.winRate)} | R prévu ${number(g.avgPlannedR)} | R réalisé ${number(g.avgRealizedR)} | Volume ${number(g.volume)} | Durée de détention ${fmtDuration(g.avgDurationMs)}`,
                            ),
                          ],
                        }}
                      />
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {error ? (
                    <p role="alert" className="text-destructive">
                      {error}
                    </p>
                  ) : loading ? (
                    <p className="text-sm text-muted-foreground">Chargement du rapport…</p>
                  ) : multi ? (
                    <p className="text-sm">
                      Ces comptes utilisent des devises différentes ({data?.currencies.join(", ")}).
                      Sélectionnez dans les filtres des comptes utilisant la même devise pour
                      comparer les résultats financiers.
                    </p>
                  ) : data ? (
                    <Summary data={data} />
                  ) : null}
                </CardContent>
              </Card>
              {data && !multi && !loading && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {mode === "cross"
                        ? `${dimensionName(primary)} × ${dimensionName(secondary)}`
                        : `Performance par ${dimensionName(primary).toLowerCase()}`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Breakdown
                      data={data}
                      cross={mode === "cross"}
                      primary={primary}
                      secondary={secondary}
                    />
                  </CardContent>
                </Card>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">
                Trades clôturés uniquement. Les dates correspondent au jour de clôture ; le jour de
                la semaine et l’heure d’entrée utilisent le fuseau horaire{" "}
                {data?.timeZone ?? "de votre journal"}. Le volume correspond à la quantité totale à
                l’entrée. Le R est calculé à partir du prix d’entrée moyen pondéré et de la quantité
                totale à l’entrée ; les données de risque manquantes ou invalides sont exclues des
                moyennes R. Les produits dérivés nécessitent un multiplicateur configuré pour
                calculer le R réalisé. Plusieurs étiquettes ou erreurs peuvent placer un trade dans
                plusieurs groupes ; leurs totaux peuvent donc se chevaucher.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
function Comparison({ initial }: { initial: AnalysisFilters }) {
  const privateMode = usePrivacy();
  const [a, setA] = useState<AnalysisFilters>({ ...initial, direction: "long" }),
    [b, setB] = useState<AnalysisFilters>({ ...initial, direction: "short" }),
    [nameA, setNameA] = useState("Trades à l’achat"),
    [nameB, setNameB] = useState("Trades à la vente"),
    [editing, setEditing] = useState<"a" | "b" | null>(null),
    [draft, setDraft] = useState<AnalysisFilters>({});
  const aa = useApi<Analysis>(`/api/analysis?${new URLSearchParams(a).toString()}`),
    bb = useApi<Analysis>(`/api/analysis?${new URLSearchParams(b).toString()}`);
  const currencies = new Set([...(aa.data?.currencies ?? []), ...(bb.data?.currencies ?? [])]),
    multi = currencies.size > 1;
  const metricLines = (name: string, d: Analysis) => [
    name,
    `Trades : ${d.summary.trades} | Résultat net : ${number(d.summary.netPnl)} ${d.currencies[0] ?? ""}`,
    `Taux de réussite : ${percent(d.summary.winRate)} | R prévu : ${number(d.summary.avgPlannedR)} | R réalisé : ${number(d.summary.avgRealizedR)}`,
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Chaque groupe possède ses propres filtres. Comparez des stratégies, comptes, périodes ou
        caractéristiques de trades. Les groupes peuvent se chevaucher.
      </p>
      {multi && (
        <p role="alert" className="rounded-md border p-3 text-sm">
          Sélectionnez des comptes dans la même devise pour les deux groupes. Aucune conversion de
          devise n’est appliquée.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {(
          [
            { key: "a", name: nameA, setName: setNameA, filters: a, result: aa },
            { key: "b", name: nameB, setName: setNameB, filters: b, result: bb },
          ] as const
        ).map((group) => (
          <Card key={group.key}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  aria-label={`Nom du groupe ${group.key.toUpperCase()}`}
                  className={`${fieldClass} min-w-32 flex-1 font-semibold`}
                  value={group.name}
                  onChange={(e) => group.setName(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDraft({ ...group.filters });
                    setEditing(group.key);
                  }}
                >
                  Modifier les filtres
                </Button>
              </div>
              <p className="text-xs text-muted-foreground break-words">
                {describeFilters(
                  group.filters,
                  group.result.data?.accounts,
                  group.result.data?.playbooks,
                  privateMode,
                )}
              </p>
            </CardHeader>
            <CardContent>
              {group.result.error ? (
                <p role="alert" className="text-destructive">
                  {group.result.error}
                </p>
              ) : group.result.loading ? (
                <p>Chargement…</p>
              ) : group.result.data && !multi ? (
                <Summary data={group.result.data} />
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
      {aa.data && bb.data && !aa.loading && !bb.loading && !multi && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <p className="text-sm">
              {nameB} moins {nameA} :{" "}
              <strong>
                <MonetaryValue>
                  {money(
                    bb.data.summary.netPnl - aa.data.summary.netPnl,
                    [...currencies][0] ?? "USD",
                  )}
                </MonetaryValue>
              </strong>{" "}
              de résultat net · {number(bb.data.summary.trades - aa.data.summary.trades)} trades
            </p>
            <ReviewExport
              containsFinancialData
              document={{
                title: `${nameA} vs ${nameB}`,
                lines: [
                  `Groupe A : ${describeFilters(a, aa.data.accounts, aa.data.playbooks)}`,
                  `Groupe B : ${describeFilters(b, bb.data.accounts, bb.data.playbooks)}`,
                  "",
                  ...metricLines(nameA, aa.data),
                  "",
                  ...metricLines(nameB, bb.data),
                ],
              }}
            />
          </CardContent>
        </Card>
      )}
      <Dialog
        open={editing !== null}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Filtres du groupe {editing?.toUpperCase()}</DialogTitle>
          </DialogHeader>
          <FilterFields value={draft} onChange={setDraft} />
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setDraft({})}>
              Effacer
            </Button>
            <Button
              onClick={() => {
                if (editing === "a") setA(draft);
                else setB(draft);
                setEditing(null);
              }}
            >
              Appliquer au groupe
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
