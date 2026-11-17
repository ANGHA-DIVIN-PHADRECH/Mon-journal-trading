"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import { Textarea } from "@/components/ui/textarea";
import { postJson } from "@/lib/use-api";
import { useAiRequest, type AiScope } from "@/lib/use-ai-request";
import {
  COMFORT_RISK_PERCENT,
  MAX_RISK_PERCENT,
  MIN_REWARD_RISK,
  computeTradePlan,
  type PlanDirection,
} from "@/lib/trade-plan";
import { AiNotice } from "./ai-notice";
import { useFilters } from "./filter-bar";
import type { AnalysisFilters } from "@luxalgo/journal-core";

interface Form {
  symbol: string;
  direction: PlanDirection;
  entry: string;
  stop: string;
  target: string;
  balance: string;
  riskPercent: string;
  contractSize: string;
  notes: string;
}

const STORAGE_KEY = "trade-plan-form-v1";
// Notes are never persisted: they may contain pasted analysis the trader did not mean to keep.
const DEFAULT_FORM: Form = {
  symbol: "",
  direction: "long",
  entry: "",
  stop: "",
  target: "",
  balance: "",
  riskPercent: "1",
  contractSize: "100000",
  notes: "",
};

const CONTRACT_PRESETS = [
  { label: "Marché des changes (1 lot = 100 000)", value: "100000" },
  { label: "Or XAUUSD (1 lot = 100)", value: "100" },
  { label: "CFD sur crypto (1 lot = 1)", value: "1" },
];

const toNumber = (value: string): number =>
  value.trim() === "" ? Number.NaN : Number(value.replace(",", "."));

const fmt = (value: number, digits = 2) =>
  value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Risk gate first (always local, always on), then an optional AI review against your own journal. */
export function TradePlan() {
  const { values, query, timeZone } = useFilters();
  return <ScopedTradePlan key={`${timeZone}:${query}`} filters={values} timeZone={timeZone} />;
}

function ScopedTradePlan({ filters, timeZone }: { filters: AnalysisFilters; timeZone: string }) {
  const [form, setForm] = useState<Form>(DEFAULT_FORM);
  const [review, setReview] = useState<{ review: string; scope: AiScope } | null>(null);
  const { run, busy, error, dismiss } = useAiRequest();

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved)
        setForm((current) => ({ ...current, ...(JSON.parse(saved) as Partial<Form>), notes: "" }));
    } catch {
      // Storage can be unavailable; the form simply starts empty.
    }
  }, []);

  const update = (patch: Partial<Form>) => {
    const next = { ...form, ...patch };
    setForm(next);
    setReview(null);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...next, notes: "" }));
    } catch {
      // Ignore: persistence is a convenience only.
    }
  };

  const input = useMemo(
    () => ({
      direction: form.direction,
      entry: toNumber(form.entry),
      stop: toNumber(form.stop),
      target: form.target.trim() === "" ? null : toNumber(form.target),
      balance: toNumber(form.balance),
      riskPercent: toNumber(form.riskPercent),
      contractSize: toNumber(form.contractSize),
    }),
    [form],
  );
  const plan = useMemo(() => computeTradePlan(input), [input]);
  const started = form.entry !== "" || form.stop !== "" || form.balance !== "";

  const askReview = () =>
    run(
      () =>
        postJson<{ review: string; scope: AiScope }>("/api/ai/plan", {
          plan: { ...input, symbol: form.symbol, notes: form.notes },
          filters,
          timeZone,
        }),
      setReview,
    );

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Votre plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plan-symbol">Symbole</Label>
              <Input
                id="plan-symbol"
                value={form.symbol}
                onChange={(event) => update({ symbol: event.target.value })}
                placeholder="EURUSD, XAUUSD, BTCUSD…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Direction</Label>
              <OptionSelect
                aria-label="Direction"
                value={form.direction}
                onValueChange={(value) => update({ direction: value as PlanDirection })}
              >
                <option value="long">Achat</option>
                <option value="short">Vente</option>
              </OptionSelect>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ["entry", "Prix d'entrée"],
                ["stop", "Stop-loss (obligatoire)"],
                ["target", "Objectif (optionnel)"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`plan-${key}`}>{label}</Label>
                <Input
                  id={`plan-${key}`}
                  inputMode="decimal"
                  value={form[key]}
                  onChange={(event) => update({ [key]: event.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plan-balance">Solde du compte</Label>
              <Input
                id="plan-balance"
                inputMode="decimal"
                value={form.balance}
                onChange={(event) => update({ balance: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-risk">Risque par trade (% — max {MAX_RISK_PERCENT} %)</Label>
              <Input
                id="plan-risk"
                inputMode="decimal"
                value={form.riskPercent}
                onChange={(event) => update({ riskPercent: event.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Type d&apos;instrument (taille du contrat)</Label>
            <OptionSelect
              aria-label="Taille du contrat"
              value={
                CONTRACT_PRESETS.some((preset) => preset.value === form.contractSize)
                  ? form.contractSize
                  : "custom"
              }
              onValueChange={(value) => value !== "custom" && update({ contractSize: value })}
            >
              {CONTRACT_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">Autre (valeur ci-dessous)</option>
            </OptionSelect>
            <Input
              aria-label="Taille du contrat personnalisée"
              inputMode="decimal"
              value={form.contractSize}
              onChange={(event) => update({ contractSize: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-notes">Notes de marché (facultatif)</Label>
            <Textarea
              id="plan-notes"
              value={form.notes}
              onChange={(event) => update({ notes: event.target.value })}
              placeholder="Collez ici l'analyse obtenue dans Claude (TradingView, CoinGecko). L'IA du journal la traite comme une affirmation non vérifiée."
              className="min-h-24"
              maxLength={4000}
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Contrôle du risque
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!started && (
              <p className="text-muted-foreground">
                Remplissez l&apos;entrée, le stop et le solde. Sans stop valide et sans risque
                maîtrisé, aucun plan n&apos;est accepté.
              </p>
            )}
            {started && !plan.ok && (
              <ul className="space-y-1.5" role="alert">
                {plan.errors.map((message) => (
                  <li key={message} className="flex gap-2 text-destructive">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    {message}
                  </li>
                ))}
              </ul>
            )}
            {plan.ok && (
              <>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <dt className="text-muted-foreground">Taille de position</dt>
                  <dd className="text-right text-base font-semibold">{fmt(plan.lots)} lot</dd>
                  <dt className="text-muted-foreground">Risque réel</dt>
                  <dd className="text-right">
                    {fmt(plan.actualRiskAmount)} ({fmt(plan.actualRiskPercent)} %)
                  </dd>
                  <dt className="text-muted-foreground">Distance du stop</dt>
                  <dd className="text-right">{fmt(plan.stopDistance, 5)}</dd>
                  <dt className="text-muted-foreground">Gain potentiel</dt>
                  <dd className="text-right">
                    {plan.potentialReward === null ? "—" : fmt(plan.potentialReward)}
                  </dd>
                  <dt className="text-muted-foreground">Gain / risque</dt>
                  <dd className="text-right">
                    {plan.rewardRisk === null ? "—" : fmt(plan.rewardRisk)}
                  </dd>
                </dl>
                {plan.warnings.length > 0 && (
                  <ul className="space-y-1.5 border-t pt-3">
                    {plan.warnings.map((message) => (
                      <li key={message} className="flex gap-2 text-amber-600 dark:text-amber-400">
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        {message}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">
                  La taille est arrondie vers le bas : le risque réel ne dépasse jamais le risque
                  prévu. Seuils : confort {COMFORT_RISK_PERCENT} %, maximum {MAX_RISK_PERCENT} %,
                  gain/risque conseillé ≥ {MIN_REWARD_RISK}. Calcul exact pour les instruments cotés
                  dans la devise du compte ; sinon, vérifiez la valeur du pip dans votre plateforme.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Avis de l&apos;IA sur votre plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              L&apos;IA compare le plan à vos propres statistiques (symbole, jour, heure, erreurs
              fréquentes). Elle ne voit aucun prix en direct et ne garantit aucun résultat. Elle
              n&apos;est appelée que si le contrôle du risque est valide.
            </p>
            <Button
              onClick={() => void askReview()}
              disabled={busy || !plan.ok || form.symbol.trim() === ""}
            >
              <Sparkles />
              {busy ? "Analyse…" : "Demander un avis"}
            </Button>
            {plan.ok && form.symbol.trim() === "" && (
              <p className="text-xs text-muted-foreground">
                Indiquez le symbole pour demander un avis.
              </p>
            )}
            {error && (
              <AiNotice error={error} onRetry={() => void askReview()} onDismiss={dismiss} />
            )}
            {review && (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-muted-foreground">{review.scope.label}</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{review.review}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
