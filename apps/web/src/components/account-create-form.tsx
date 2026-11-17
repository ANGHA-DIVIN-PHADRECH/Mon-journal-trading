"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postJson } from "@/lib/use-api";
import { CurrencyPicker } from "./currency-picker";

export interface CreatedAccount {
  id: string;
  name: string;
  kind: string;
  archivedAt: null;
}

/** Shared local account creation for Import, manual entry and account management. */
export function AccountCreateForm({
  kind,
  onCreated,
  onSavingChange,
  className,
  showTitle = true,
}: {
  kind?: "import" | "manual";
  onCreated: (account: CreatedAccount) => void;
  onSavingChange?: (saving: boolean) => void;
  className?: string;
  showTitle?: boolean;
}) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [balance, setBalance] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [accountKind, setAccountKind] = useState<"manual" | "import">("manual");
  const fieldId = useId();
  const create = async () => {
    if (
      saving ||
      !name.trim() ||
      !/^[A-Z]{3}$/.test(currency) ||
      !balance.trim() ||
      !Number.isFinite(Number(balance)) ||
      Number(balance) < 0
    )
      return;
    setSaving(true);
    onSavingChange?.(true);
    setError("");
    try {
      const result = await postJson<{ id: string }>("/api/accounts", {
        name: name.trim(),
        kind: kind ?? accountKind,
        currency,
        initialBalance: Number(balance),
      });
      onCreated({ id: result.id, name: name.trim(), kind: kind ?? accountKind, archivedAt: null });
      setName("");
      setBalance("0");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Échec de la création du compte.");
    } finally {
      setSaving(false);
      onSavingChange?.(false);
    }
  };
  return (
    <form
      className={className ?? "space-y-3"}
      onSubmit={(event) => {
        event.preventDefault();
        if (!saving) void create();
      }}
    >
      {showTitle && <h3 className="text-sm font-medium">Créer un compte</h3>}
      {!kind && (
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-kind`}>Type de compte</Label>
          <select
            id={`${fieldId}-kind`}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={accountKind}
            disabled={saving}
            onChange={(event) => setAccountKind(event.target.value as "manual" | "import")}
          >
            <option value="manual">Trades saisis manuellement</option>
            <option value="import">Import de fichier</option>
          </select>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-name`}>Nom du compte</Label>
          <Input
            id={`${fieldId}-name`}
            autoFocus
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={saving}
            placeholder="Compte de test"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-currency`}>Devise</Label>
          <CurrencyPicker
            id={`${fieldId}-currency`}
            value={currency}
            onChange={setCurrency}
            disabled={saving}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-balance`}>Solde initial</Label>
          <Input
            id={`${fieldId}-balance`}
            required
            type="number"
            min="0"
            step="0.01"
            value={balance}
            onChange={(event) => setBalance(event.target.value)}
            disabled={saving}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="submit"
        disabled={
          saving ||
          !name.trim() ||
          !/^[A-Z]{3}$/.test(currency) ||
          !balance.trim() ||
          !Number.isFinite(Number(balance)) ||
          Number(balance) < 0
        }
      >
        {saving ? "Création…" : "Créer le compte"}
      </Button>
    </form>
  );
}
