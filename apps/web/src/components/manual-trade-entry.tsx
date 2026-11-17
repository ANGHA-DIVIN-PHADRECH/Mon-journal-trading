"use client";

import { useId, useState } from "react";
import { MonetaryField } from "@/components/privacy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { postJson } from "@/lib/use-api";

import { AccountPicker } from "./account-picker";
import { fmtNumber } from "@/lib/utils";

interface ManualLeg {
  datetime: string;
  side: "buy" | "sell";
  quantity: string;
  price: string;
  fee: string;
}

export function ManualTradeEntry({ onSaved }: { onSaved: () => void }) {
  const [accountId, setAccountId] = useState("");
  const [symbol, setSymbol] = useState("");
  const [notes, setNotes] = useState("");
  const [legs, setLegs] = useState<ManualLeg[]>([
    { datetime: "", side: "buy", quantity: "", price: "", fee: "" },
    { datetime: "", side: "sell", quantity: "", price: "", fee: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fieldId = useId();

  const setLeg = (index: number, patch: Partial<ManualLeg>) =>
    setLegs((current) => current.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)));

  const valid =
    accountId &&
    symbol &&
    legs.some((leg) => leg.datetime && Number(leg.quantity) > 0 && leg.price !== "");

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      await postJson("/api/executions", {
        accountId,
        ...(notes.trim() ? { notes } : {}),
        executions: legs
          .filter((leg) => leg.datetime && Number(leg.quantity) > 0 && leg.price !== "")
          .map((leg) => ({
            symbol,
            side: leg.side,
            quantity: Number(leg.quantity),
            price: Number(leg.price),
            fee: leg.fee === "" ? 0 : Number(leg.fee),
            executedAt: new Date(leg.datetime).toISOString(),
          })),
      });
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Impossible d’enregistrer le trade. Réessayez.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset disabled={busy} className="min-w-0 space-y-3">
      <AccountPicker value={accountId} onChange={setAccountId} kind="manual" />
      <div>
        <Label htmlFor={`${fieldId}-symbol`} className="mb-1 block text-xs text-muted-foreground">
          Symbole
        </Label>
        <Input
          id={`${fieldId}-symbol`}
          value={symbol}
          onChange={(event) => setSymbol(event.target.value.toUpperCase())}
          placeholder="AAPL, ESZ6, BTCUSDT…"
        />
      </div>
      <div className="manual-executions space-y-3">
        {legs.map((leg, index) => (
          <fieldset
            key={index}
            className="manual-execution-row grid min-w-0 gap-2 rounded-lg border p-3"
          >
            <legend className="px-1 text-xs text-muted-foreground">Exécution {index + 1}</legend>
            <label className="manual-execution-date grid min-w-0 gap-1 text-xs text-muted-foreground">
              Date et heure
              <Input
                type="datetime-local"
                value={leg.datetime}
                onChange={(event) => setLeg(index, { datetime: event.target.value })}
              />
            </label>
            <div className="grid min-w-0 gap-1 text-xs text-muted-foreground">
              <span id={`${fieldId}-execution-side-${index}`}>Sens</span>
              <Select
                value={leg.side}
                onValueChange={(value) => setLeg(index, { side: value as "buy" | "sell" })}
              >
                <SelectTrigger aria-labelledby={`${fieldId}-execution-side-${index}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">Achat</SelectItem>
                  <SelectItem value="sell">Vente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
              Quantité
              <Input
                placeholder="Qté"
                inputMode="decimal"
                value={leg.quantity}
                onChange={(event) => setLeg(index, { quantity: event.target.value })}
              />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
              Prix
              <MonetaryField>
                <Input
                  placeholder="Prix"
                  inputMode="decimal"
                  value={leg.price}
                  onChange={(event) => setLeg(index, { price: event.target.value })}
                />
              </MonetaryField>
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
              Frais
              <MonetaryField>
                <Input
                  placeholder="Frais"
                  inputMode="decimal"
                  value={leg.fee}
                  onChange={(event) => setLeg(index, { fee: event.target.value })}
                />
              </MonetaryField>
            </label>
          </fieldset>
        ))}
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${fieldId}-notes`}>Notes (facultatif)</Label>
        <textarea
          id={`${fieldId}-notes`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={100000}
          rows={4}
          placeholder="Votre configuration, pourquoi vous avez pris ce trade ou ce que vous en avez appris…"
          className="flex w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        />
        <p className="text-xs text-muted-foreground">
          Markdown est pris en charge. Les notes sont enregistrées avec le trade ; les notes
          existantes sont conservées lors de l’ajout à une position ouverte.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setLegs((current) => [
              ...current,
              { datetime: "", side: "sell", quantity: "", price: "", fee: "" },
            ])
          }
        >
          Ajouter une exécution
        </Button>
        <Button size="sm" onClick={save} disabled={!valid || busy}>
          {busy ? "Enregistrement…" : "Enregistrer le trade"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Les dates et heures suivent le fuseau horaire de votre appareil. Les exécutions
        correspondant à une position ouverte sur {symbol || "ce symbole"} sont automatiquement
        regroupées en trades complets ({fmtNumber(legs.filter((leg) => leg.datetime).length, 0)}{" "}
        exécution(s) pour le moment).
      </p>
    </fieldset>
  );
}
