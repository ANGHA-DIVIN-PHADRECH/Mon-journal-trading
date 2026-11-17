"use client";
import { OptionSelect } from "@/components/ui/option-select";
import { Checkbox } from "@/components/ui/checkbox";

import type { AnalysisFilters, FilterKey } from "@luxalgo/journal-core";
import { useApi } from "@/lib/use-api";
import { MonetaryField } from "./privacy";
import { ChevronDown, CircleHelp } from "lucide-react";
import { HoverHint } from "./ui/tooltip";
import { DatePicker } from "./ui/date-picker";
const FIELD_HINTS: Record<string, string> = {
  Du: "Première date incluse. Pour les trades clôturés, il s’agit du jour de clôture ; pour les trades ouverts, du jour d’ouverture.",
  Au: "Dernière date incluse. Les dates suivent le fuseau horaire du journal.",
  Stratégie:
    "Inclure les trades associés à ce plan de trading. « Tout » inclut aussi ceux qui n’en ont pas.",
  "Symboles (séparés par des virgules)":
    "Inclure ces symboles. Séparez-les par des virgules, par exemple AAPL, NVDA.",
  "Exclure les symboles": "Masquer ces symboles dans les résultats. Séparez-les par des virgules.",
  "Étiquettes requises (séparées par des virgules)":
    "Filtrer selon les étiquettes de vos trades. Séparez-les par des virgules.",
  "Erreurs requises":
    "Filtrer selon les erreurs de trading consignées. Séparez-les par des virgules.",
  "État de l’analyse":
    "Rechercher les trades marqués comme analysés ou ceux qui restent à analyser.",
  "R réalisé": "Gain ou perte du trade exprimé en multiple du risque initial.",
  "R prévu": "Gain prévu par rapport au risque initial du trade.",
  "Durée de détention (minutes)":
    "Temps écoulé entre l’ouverture et la clôture du trade, en minutes.",
};
export const fieldClass = "h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm";
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="journal-filter-field grid min-w-0 gap-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        {label}
        {FIELD_HINTS[label.split(" · ")[0]!] && (
          <HoverHint heading={label} content={FIELD_HINTS[label.split(" · ")[0]!]}>
            <span
              tabIndex={0}
              aria-label={`À propos de ${label}`}
              className="inline-flex cursor-help rounded-sm text-muted-foreground/70 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CircleHelp aria-hidden="true" className="h-3 w-3" />
            </span>
          </HoverHint>
        )}
      </span>
      {children}
    </label>
  );
}
export function FilterFields({
  value,
  onChange,
}: {
  value: AnalysisFilters;
  onChange: (v: AnalysisFilters) => void;
}) {
  const { data: accounts } = useApi<{
    accounts: { id: string; name: string; archivedAt: string | null }[];
  }>("/api/accounts");
  const { data: playbooks } = useApi<{ playbooks: { id: string; name: string }[] }>(
    "/api/playbooks",
  );
  const set = (key: FilterKey, v: string) => onChange({ ...value, [key]: v });
  const input = (key: FilterKey, label: string, type = "text") => (
    <Field key={key} label={label}>
      <MonetaryField sensitive={/^(entry|exit|pnl)(Min|Max)$/.test(key)}>
        {type === "date" ? (
          <DatePicker
            value={value[key] ?? ""}
            onValueChange={(next) => set(key, next)}
            label={label}
          />
        ) : (
          <input
            className={fieldClass}
            aria-label={label}
            type={type}
            step={type === "number" ? "any" : undefined}
            value={value[key] ?? ""}
            onChange={(e) => set(key, e.target.value)}
          />
        )}
      </MonetaryField>
    </Field>
  );
  const select = (key: FilterKey, label: string, choices: [string, string][]) => (
    <Field key={key} label={label}>
      <span className="journal-filter-select relative block min-w-0">
        <OptionSelect
          className={fieldClass}
          value={value[key] ?? ""}
          onValueChange={(next) => set(key, next)}
        >
          <option value="">Tout</option>
          {choices.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </OptionSelect>
      </span>
    </Field>
  );
  return (
    <div className="journal-filter-fields space-y-5">
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3">
        {input("from", "Du", "date")}
        {input("to", "Au", "date")}
        {select(
          "playbookId",
          "Stratégie",
          (playbooks?.playbooks ?? []).map((p) => [p.id, p.name]),
        )}
        {input("symbol", "Symboles (séparés par des virgules)")}
        {input("excludeSymbol", "Exclure les symboles")}
        {input("tag", "Étiquettes requises (séparées par des virgules)")}
        {input("mistake", "Erreurs requises")}
        {select("direction", "Direction", [
          ["long", "Achat"],
          ["short", "Vente"],
        ])}
        {select("status", "Résultat", [
          ["closed", "Tous les trades clôturés"],
          ["open", "Ouvert"],
          ["win", "Gagnant"],
          ["loss", "Perdant"],
          ["breakeven", "À l’équilibre"],
        ])}
        {select("reviewed", "État de l’analyse", [
          ["yes", "Analysé"],
          ["no", "Non analysé"],
        ])}
        {select("assetClass", "Classe d’actifs", [
          ["equity", "Actions"],
          ["futures", "Contrats à terme"],
          ["forex", "Devises"],
          ["option", "Options"],
          ["crypto", "Cryptomonnaies"],
          ["cfd", "CFD"],
          ["other", "Autre"],
        ])}
      </div>
      <fieldset className="journal-filter-accounts rounded-lg border p-3">
        <legend className="px-1 text-xs text-muted-foreground">
          Comptes · aucun compte sélectionné signifie tous les comptes
        </legend>
        <div className="flex flex-wrap gap-3">
          {accounts?.accounts
            .filter((a) => !a.archivedAt)
            .map((a) => (
              <label key={a.id} className="journal-filter-choice flex items-center gap-2 text-xs">
                <Checkbox
                  checked={(value.accounts ?? "").split(",").includes(a.id)}
                  onCheckedChange={(checked) => {
                    const ids = new Set((value.accounts ?? "").split(",").filter(Boolean));
                    if (checked === true) ids.add(a.id);
                    else ids.delete(a.id);
                    set("accounts", [...ids].join(","));
                  }}
                />
                {a.name}
              </label>
            ))}
        </div>
      </fieldset>
      <details className="journal-filter-advanced">
        <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm">
          <span>Taille, prix, risque et durée</span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        </summary>
        <div className="journal-filter-advanced-grid mt-3 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-4">
          {(
            [
              ["quantity", "Quantité totale à l’entrée"],
              ["entry", "Prix d’entrée"],
              ["exit", "Prix de sortie"],
              ["duration", "Durée de détention (minutes)"],
              ["r", "R réalisé"],
              ["plannedR", "R prévu"],
              ["pnl", "Résultat net"],
              ["rating", "Note"],
            ] as const
          ).flatMap(([k, l]) => [
            input(`${k}Min` as FilterKey, `${l} · min`, "number"),
            input(`${k}Max` as FilterKey, `${l} · max`, "number"),
          ])}
          {input("entryAfter", "Entrée après", "time")}
          {input("entryBefore", "Entrée avant", "time")}
          {input("exitAfter", "Sortie après", "time")}
          {input("exitBefore", "Sortie avant", "time")}
        </div>
        <div className="journal-filter-weekdays mt-3 flex flex-wrap gap-2">
          {["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"].map((day, i) => (
            <label key={day} className="journal-filter-choice flex items-center gap-2 text-xs">
              <Checkbox
                checked={(value.weekdays ?? "").split(",").includes(String(i))}
                onCheckedChange={(checked) => {
                  const days = new Set((value.weekdays ?? "").split(",").filter(Boolean));
                  if (checked === true) days.add(String(i));
                  else days.delete(String(i));
                  set("weekdays", [...days].join(","));
                }}
              />
              {day}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
