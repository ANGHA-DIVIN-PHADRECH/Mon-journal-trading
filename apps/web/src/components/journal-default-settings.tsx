"use client";
import { OptionSelect } from "@/components/ui/option-select";

import { MonetaryField } from "./privacy";
import { useEffect, useState } from "react";
import { useApi, postJson } from "@/lib/use-api";
import {
  EMPTY_DEFAULTS,
  type JournalDefaults,
  type FeeRule,
  type RiskRule,
} from "@/lib/journal-defaults";
import { Field, fieldClass } from "@/components/filter-fields";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export function JournalDefaultSettings() {
  const { data, error } = useApi<JournalDefaults>("/api/workspace/defaults"),
    { data: accounts } = useApi<{ accounts: { id: string; name: string }[] }>("/api/accounts");
  const [draft, setDraft] = useState(EMPTY_DEFAULTS),
    [status, setStatus] = useState("");
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);
  const matchFields = (r: FeeRule | RiskRule, update: (r: FeeRule | RiskRule) => void) => (
    <>
      <Field label="Compte">
        <OptionSelect
          className={fieldClass}
          value={r.accountId}
          onValueChange={(next) => update({ ...r, accountId: next })}
        >
          <option value="">Tous les comptes</option>
          {accounts?.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </OptionSelect>
      </Field>
      <Field label="Symbole (vide = tous)">
        <input
          className={fieldClass}
          value={r.symbol}
          placeholder="ex. : ES"
          onChange={(e) => update({ ...r, symbol: e.target.value.toUpperCase() })}
        />
      </Field>
    </>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Seuil de rentabilité, frais et paramètres de risque par défaut</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Marge du seuil de rentabilité (±)">
            <MonetaryField sensitive={draft.breakevenMode === "money"}>
              <input
                type="number"
                step="any"
                min="0"
                className={fieldClass}
                value={draft.breakeven}
                onChange={(e) => setDraft({ ...draft, breakeven: Number(e.target.value) })}
              />
            </MonetaryField>
          </Field>
          <Field label="Unité de la marge">
            <OptionSelect
              className={fieldClass}
              value={draft.breakevenMode}
              onValueChange={(next) =>
                setDraft({ ...draft, breakevenMode: next as "money" | "percent" })
              }
            >
              <option value="money">Devise du compte</option>
              <option value="percent">% du montant à l’entrée</option>
            </OptionSelect>
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Les trades clôturés dont le résultat net se trouve dans cette marge sont considérés à
          l’équilibre. Le résultat réel n’est pas modifié. Le mode pourcentage utilise le prix
          d’entrée × la quantité totale à l’entrée × le multiplicateur de contrat ; configurez
          d’abord les multiplicateurs des produits dérivés.
        </p>
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Frais par défaut</h3>
          <p className="text-xs text-muted-foreground">
            Appliqués aux nouvelles exécutions dont les frais sont nuls, y compris lorsque zéro est
            explicitement indiqué. Les frais importés non nuls et ceux des exécutions existantes
            sont conservés. La première règle correspondante est appliquée.
          </p>
          {draft.feeRules.map((r, i) => {
            const update = (next: FeeRule | RiskRule) =>
              setDraft({
                ...draft,
                feeRules: draft.feeRules.map((old, j) => (j === i ? (next as FeeRule) : old)),
              });
            return (
              <div key={r.id} className="space-y-2 rounded-md border p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {matchFields(r, update)}
                  <Field label="Montant des frais">
                    <MonetaryField>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className={fieldClass}
                        value={r.amount}
                        onChange={(e) => update({ ...r, amount: Number(e.target.value) })}
                      />
                    </MonetaryField>
                  </Field>
                  <Field label="Facturation par">
                    <OptionSelect
                      className={fieldClass}
                      value={r.mode}
                      onValueChange={(next) => update({ ...r, mode: next as FeeRule["mode"] })}
                    >
                      <option value="execution">Exécution</option>
                      <option value="unit">Unité / contrat</option>
                    </OptionSelect>
                  </Field>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDraft({ ...draft, feeRules: draft.feeRules.filter((x) => x.id !== r.id) })
                  }
                >
                  Supprimer la règle de frais
                </Button>
              </div>
            );
          })}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setDraft({
                ...draft,
                feeRules: [
                  ...draft.feeRules,
                  {
                    id: crypto.randomUUID(),
                    accountId: "",
                    symbol: "",
                    amount: 0,
                    mode: "execution",
                  },
                ],
              })
            }
          >
            Ajouter une règle de frais
          </Button>
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Stops et objectifs par défaut</h3>
          <p className="text-xs text-muted-foreground">
            Distances par rapport au prix d’entrée moyen pondéré, ajustées selon le sens achat ou
            vente. Appliquées uniquement à la création d’un nouveau trade. La première règle
            correspondante est appliquée.
          </p>
          {draft.riskRules.map((r, i) => {
            const update = (next: FeeRule | RiskRule) =>
              setDraft({
                ...draft,
                riskRules: draft.riskRules.map((old, j) => (j === i ? (next as RiskRule) : old)),
              });
            return (
              <div key={r.id} className="space-y-2 rounded-md border p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {matchFields(r, update)}
                  <Field label="Distance du stop">
                    <MonetaryField sensitive={r.mode === "price"}>
                      <input
                        type="number"
                        min="0.000001"
                        step="any"
                        className={fieldClass}
                        value={r.stop}
                        onChange={(e) => update({ ...r, stop: Number(e.target.value) })}
                      />
                    </MonetaryField>
                  </Field>
                  <Field label="Distance de l’objectif">
                    <MonetaryField sensitive={r.mode === "price"}>
                      <input
                        type="number"
                        min="0.000001"
                        step="any"
                        className={fieldClass}
                        value={r.target}
                        onChange={(e) => update({ ...r, target: Number(e.target.value) })}
                      />
                    </MonetaryField>
                  </Field>
                  <Field label="Unité de distance">
                    <OptionSelect
                      className={fieldClass}
                      value={r.mode}
                      onValueChange={(next) => update({ ...r, mode: next as RiskRule["mode"] })}
                    >
                      <option value="price">Points de prix</option>
                      <option value="percent">% du prix d’entrée</option>
                    </OptionSelect>
                  </Field>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDraft({ ...draft, riskRules: draft.riskRules.filter((x) => x.id !== r.id) })
                  }
                >
                  Supprimer la règle de risque
                </Button>
              </div>
            );
          })}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setDraft({
                ...draft,
                riskRules: [
                  ...draft.riskRules,
                  {
                    id: crypto.randomUUID(),
                    accountId: "",
                    symbol: "",
                    stop: 1,
                    target: 2,
                    mode: "price",
                  },
                ],
              })
            }
          >
            Ajouter une règle de risque
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!data}
            onClick={async () => {
              try {
                setStatus("Enregistrement…");
                await postJson("/api/workspace/defaults", draft);
                setStatus("Paramètres par défaut enregistrés");
              } catch (e) {
                setStatus(e instanceof Error ? e.message : "Échec de l’enregistrement.");
              }
            }}
          >
            Enregistrer les paramètres par défaut
          </Button>
          <span role="status" className="text-xs">
            {status}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
