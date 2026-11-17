"use client";
import { AiNotice } from "@/components/ai-notice";
import { Checkbox } from "@/components/ui/checkbox";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { netReturnOnEntry } from "@luxalgo/journal-core";
import { FilterBar } from "@/components/filter-bar";
import { Pnl } from "@/components/pnl";
import { MonetaryValue, MonetaryField } from "@/components/privacy";
import { TradeMarketData } from "@/components/trade-market-data";
import { TradeNavigation } from "@/components/trade-navigation";
import { TradeRating } from "@/components/trade-rating";
import { EquityArea } from "@/components/charts/equity-area";
import { VoiceNote } from "@/components/voice-note";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RichEditor, type RichEditorHandle } from "@/components/rich-editor";
import { Attachments } from "@/components/attachments";
import { ReviewExport } from "@/components/review-export";
import { RuleChecklist } from "@/components/rule-checklist";
import { useAutosave } from "@/lib/use-autosave";
import { postJson, useApi } from "@/lib/use-api";
import { fmtDuration, fmtMoney, fmtNumber, fmtPercent } from "@/lib/utils";
import { tradeKeyFromSegment } from "@/lib/trade-links";
import { formatTimestamp } from "@/lib/timezone";

interface TradeDetail {
  riskAmount: number | null;
  realizedR: number | null;
  plannedR: number | null;
  contractMultiplier: number | null;
  currency: string;
  key: string;
  accountId: string;
  symbol: string;
  assetClass: string | null;
  direction: "long" | "short";
  status: string;
  openedAt: string;
  closedAt: string | null;
  quantity: number;
  avgEntry: number;
  avgExit: number | null;
  grossPnl: number;
  fees: number;
  netPnl: number;
  durationMs: number | null;
  exitsJson: string;
  notes: string | null;
  tagsJson: string | null;
  mistakesJson: string | null;
  playbookId: string | null;
  rating: number | null;
  stopLoss: number | null;
  profitTarget: number | null;
  reviewedAt: string | null;
}

interface ExecutionRow {
  id: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  executedAt: string;
}

export default function TradePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const tradeKey = tradeKeyFromSegment(key);
  return <TradeView key={tradeKey} tradeKey={tradeKey} />;
}

function TradeView({ tradeKey }: { tradeKey: string }) {
  const { data, error, refresh } = useApi<{
    trade: TradeDetail;
    executions: ExecutionRow[];
    timeZone: string;
  }>(`/api/trades/${encodeURIComponent(tradeKey)}`);
  const [aiBusy, setAiBusy] = useState(false);
  const [critique, setCritique] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  if (!data) {
    return (
      <div>
        <FilterBar title="Trade" />
        <div className="p-4">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : (
            <Skeleton className="h-96" />
          )}
        </div>
      </div>
    );
  }
  const { trade, executions, timeZone } = data;

  const patch = async (body: Record<string, unknown>) => {
    if (Object.keys(body).length)
      await postJson(`/api/trades/${encodeURIComponent(tradeKey)}`, body, "PATCH");
    refresh();
  };

  const runningPnl = (() => {
    const exits = JSON.parse(trade.exitsJson) as {
      executionId: string;
      grossPnl: number;
      quantity: number;
    }[];
    const times = new Map(executions.map((e) => [e.id, e.executedAt]));
    const totalExitQty = exits.reduce((total, exit) => total + exit.quantity, 0);
    let cum = 0;
    return exits
      .map((exit) => ({
        t: times.get(exit.executionId) ?? trade.openedAt,
        pnl: exit.grossPnl - (totalExitQty > 0 ? trade.fees * (exit.quantity / totalExitQty) : 0),
      }))
      .sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
      .map((event) => ({
        t: formatTimestamp(event.t, timeZone).slice(11, 16),
        cumNetPnl: (cum += event.pnl),
      }));
  })();

  const askCritique = async () => {
    setAiBusy(true);
    setAiError(null);
    try {
      const result = await postJson<{ critique: string }>("/api/ai/critique", { key: tradeKey });
      setCritique(result.critique);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Échec de l’analyse par l’IA");
    } finally {
      setAiBusy(false);
    }
  };

  const riskAmount = trade.riskAmount;

  return (
    <div>
      <FilterBar
        title={`${trade.symbol} · ${trade.direction === "long" ? "ACHAT (LONG)" : "VENTE (SHORT)"}`}
      />
      <TradeNavigation tradeKey={tradeKey} />
      <div className="grid gap-3 p-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-3 xl:col-span-2">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 py-4">
              <div>
                <div className="text-xs text-muted-foreground">Résultat net</div>
                <Pnl value={trade.netPnl} className="text-2xl font-semibold" />
              </div>
              <Badge
                variant={
                  trade.status === "win" ? "profit" : trade.status === "loss" ? "loss" : "secondary"
                }
                className="text-sm"
              >
                {trade.status === "win"
                  ? "GAGNANT"
                  : trade.status === "loss"
                    ? "PERDANT"
                    : "À L’ÉQUILIBRE"}
              </Badge>
              <Meta label="Résultat brut" value={fmtMoney(trade.grossPnl)} monetary />
              <Meta label="Frais" value={fmtMoney(trade.fees)} monetary />
              <Meta label="Volume" value={fmtNumber(trade.quantity, 4)} />
              <Meta label="Entrée moyenne" value={fmtNumber(trade.avgEntry)} monetary />
              <Meta
                label="Sortie moyenne"
                monetary
                value={trade.avgExit === null ? "ouverte" : fmtNumber(trade.avgExit)}
              />
              <Meta label="Durée" value={fmtDuration(trade.durationMs)} />
              <Meta
                label="Rendement net / montant d’entrée"
                value={fmtPercent(netReturnOnEntry(trade), 2)}
              />
              <Meta
                label="R prévu"
                value={trade.plannedR === null ? "–" : `${fmtNumber(trade.plannedR)}R`}
              />
              <Meta
                label="R réalisé"
                value={trade.realizedR === null ? "–" : `${fmtNumber(trade.realizedR)}R`}
              />
            </CardContent>
          </Card>

          <TradeMarketData trade={trade} executions={executions} />

          {runningPnl.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Résultat cumulé</CardTitle>
                <p className="text-xs text-muted-foreground">Heures : {timeZone}</p>
              </CardHeader>
              <CardContent>
                <EquityArea data={runningPnl} height={180} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Exécutions</CardTitle>
              <p className="text-xs text-muted-foreground">Heures : {timeZone}</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Heure</TableHead>
                    <TableHead>Sens</TableHead>
                    <TableHead>Quantité</TableHead>
                    <TableHead>Prix</TableHead>
                    <TableHead>Frais</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {executions
                    .sort((a, b) => a.executedAt.localeCompare(b.executedAt))
                    .map((execution) => (
                      <TableRow key={execution.id}>
                        <TableCell className="text-muted-foreground">
                          {formatTimestamp(execution.executedAt, timeZone)}
                        </TableCell>
                        <TableCell>
                          <span className={execution.side === "buy" ? "text-profit" : "text-loss"}>
                            {execution.side === "buy" ? "▲ ACHAT" : "▼ VENTE"}
                          </span>
                        </TableCell>
                        <TableCell className="tnum">{fmtNumber(execution.quantity, 4)}</TableCell>
                        <TableCell className="tnum">
                          <MonetaryValue>{fmtNumber(execution.price)}</MonetaryValue>
                        </TableCell>
                        <TableCell className="tnum text-muted-foreground">
                          <MonetaryValue>{fmtMoney(execution.fee)}</MonetaryValue>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-3">
          <AnnotationsCard key={trade.key} trade={trade} onPatch={patch} />
          <RuleChecklist tradeKey={trade.key} playbookId={trade.playbookId} />
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Analyse par l’IA</CardTitle>
              <Button variant="outline" size="sm" onClick={askCritique} disabled={aiBusy}>
                <Sparkles />
                {aiBusy ? "Analyse…" : "Analyser ce trade"}
              </Button>
            </CardHeader>
            {aiError && (
              <CardContent>
                <AiNotice
                  error={aiError}
                  onRetry={() => void askCritique()}
                  onDismiss={() => setAiError(null)}
                />
              </CardContent>
            )}
            {critique && (
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{critique}</p>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Meta({
  label,
  value,
  monetary = false,
}: {
  label: string;
  value: string;
  monetary?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="tnum text-sm font-medium">
        {monetary ? <MonetaryValue>{value}</MonetaryValue> : value}
      </div>
    </div>
  );
}

function AnnotationsCard({
  trade,
  onPatch,
}: {
  trade: TradeDetail;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [notes, setNotes] = useState(trade.notes ?? "");
  const noteEditor = useRef<RichEditorHandle>(null);
  const [tags, setTags] = useState((JSON.parse(trade.tagsJson ?? "[]") as string[]).join(", "));
  const [mistakes, setMistakes] = useState(
    (JSON.parse(trade.mistakesJson ?? "[]") as string[]).join(", "),
  );
  const [stopLoss, setStopLoss] = useState(trade.stopLoss?.toString() ?? "");
  const [profitTarget, setProfitTarget] = useState(trade.profitTarget?.toString() ?? "");
  const { data: playbookData } = useApi<{ playbooks: { id: string; name: string }[] }>(
    "/api/playbooks",
  );
  const {
    save: debounced,
    status: saveStatus,
    flush,
  } = useAutosave(`/api/trades/${encodeURIComponent(trade.key)}`, "PATCH", () => void onPatch({}));

  const parseList = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Journaliser ce trade</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <TradeRating value={trade.rating} onChange={(rating) => onPatch({ rating })} />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={trade.reviewedAt !== null}
              onCheckedChange={(checked) => void onPatch({ reviewed: checked === true })}
            />
            Analysé
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Stop-loss</label>
            <MonetaryField>
              <Input
                value={stopLoss}
                onChange={(event) => {
                  setStopLoss(event.target.value);
                  debounced({
                    stopLoss: event.target.value === "" ? null : Number(event.target.value),
                  });
                }}
                placeholder="Stop prévu"
                inputMode="decimal"
              />
            </MonetaryField>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Objectif de profit</label>
            <MonetaryField>
              <Input
                value={profitTarget}
                onChange={(event) => {
                  setProfitTarget(event.target.value);
                  debounced({
                    profitTarget: event.target.value === "" ? null : Number(event.target.value),
                  });
                }}
                placeholder="Objectif prévu"
                inputMode="decimal"
              />
            </MonetaryField>
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Plan de trading</label>
          <Select
            value={trade.playbookId ?? "none"}
            onValueChange={(value) => void onPatch({ playbookId: value === "none" ? null : value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Aucun plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Aucun plan</SelectItem>
              {playbookData?.playbooks.map((playbook) => (
                <SelectItem key={playbook.id} value={playbook.id}>
                  {playbook.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">
            Étiquettes (séparées par des virgules)
          </label>
          <Input
            value={tags}
            onChange={(event) => {
              setTags(event.target.value);
              debounced({ tags: parseList(event.target.value) });
            }}
            placeholder="Cassure, configuration A+"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Erreurs</label>
          <Input
            value={mistakes}
            onChange={(event) => {
              setMistakes(event.target.value);
              debounced({ mistakes: parseList(event.target.value) });
            }}
            placeholder="Entrée poursuivie, stop déplacé"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Notes</label>
            <VoiceNote
              onPrepare={() => noteEditor.current?.focus()}
              onText={(text) => {
                const next = notes ? `${notes} ${text}` : text;
                setNotes(next);
                debounced({ notes: next });
              }}
            />
          </div>
          <RichEditor
            editorRef={noteEditor}
            value={notes}
            onChange={(value) => {
              setNotes(value);
              debounced({ notes: value });
            }}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span role="status">{saveStatus}</span>
            <Button variant="ghost" size="sm" onClick={() => void flush()}>
              Enregistrer maintenant
            </Button>
          </div>
          <ReviewExport
            containsFinancialData
            document={{
              title: `${trade.symbol} · analyse ${trade.direction === "long" ? "achat" : "vente"}`,
              subtitle: `${trade.openedAt} · ${trade.currency}`,
              lines: [
                `Statut : ${trade.status} | Quantité : ${trade.quantity}`,
                `Entrée : ${trade.avgEntry} | Sortie : ${trade.avgExit ?? "Ouverte"}`,
                `Résultat net : ${trade.netPnl.toFixed(2)} | Frais : ${trade.fees.toFixed(2)}`,
                `Stop : ${stopLoss || "Non précisé"} | Objectif : ${profitTarget || "Non précisé"}`,
                `Étiquettes : ${tags || "Aucune"} | Erreurs : ${mistakes || "Aucune"}`,
                "",
                notes,
              ],
            }}
          />
          <Attachments type="trade" id={trade.key} />
        </div>
      </CardContent>
    </Card>
  );
}
