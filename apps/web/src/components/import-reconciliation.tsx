"use client";

import type { ImportReview, ImportReviewOptions } from "@/lib/import-review";
import { Button } from "@/components/ui/button";
import { fmtMoney } from "@/lib/utils";

export function ImportReconciliation({
  review,
  options,
  onChange,
  onReview,
  busy,
}: {
  review?: ImportReview;
  options: ImportReviewOptions;
  onChange: (next: ImportReviewOptions) => void;
  onReview: () => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-sm font-medium">Vérifier l’import NinjaTrader</p>
      <p className="text-xs text-muted-foreground">
        Conservez chaque compte source séparément dans le compte de journal sélectionné. Vérifiez le
        résultat avant l’enregistrement.
      </p>
      {review && (
        <>
          {review.sources.map((source) => (
            <label key={source.key} className="block space-y-1 text-sm">
              <span>{source.label}</span>
              <select
                aria-label={`Association de la source ${source.label}`}
                disabled={busy || source.saved}
                className="block w-full rounded-md border bg-background p-2 text-sm"
                value={options.sourceMappings?.[source.key] ?? source.selected ?? ""}
                onChange={(event) =>
                  onChange({
                    ...options,
                    sourceMappings: { ...options.sourceMappings, [source.key]: event.target.value },
                  })
                }
              >
                <option value="">Choisir la source à laquelle appartient ce fichier</option>
                {review.savedSources.map((saved) => (
                  <option key={saved.id} value={saved.id}>
                    {saved.name}
                  </option>
                ))}
                <option value="new">Créer un compte source distinct</option>
              </select>
            </label>
          ))}
          <p className="text-xs text-muted-foreground">
            Si un compte ou une connexion a été renommé, sélectionnez sa source existante. Ne
            choisissez une nouvelle source que pour un compte réellement différent.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm" role="status">
            <span>{review.inserted} nouvelles exécutions</span>
            <span>{review.duplicates} exécutions en double</span>
            <span>{review.corrections.length} corrections de frais</span>
          </div>
          {review.multipliers.map((item) => (
            <p key={item.symbol} className="text-xs">
              {item.symbol} multiplicateur :{" "}
              {item.value ?? "manquant — à configurer dans les paramètres"}
            </p>
          ))}
          {review.multipliers.some((item) => item.value === null) && (
            <a className="text-sm underline" href="/settings" target="_blank" rel="noreferrer">
              Ouvrir les paramètres, puis vérifier à nouveau
            </a>
          )}
          {review.totals && (
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <p className="font-medium">
                Compte de destination après l’import ({review.currency})
              </p>
              <p>
                {review.totals.closedTrades} trades clôturés · {review.totals.openTrades} trades
                ouverts
              </p>
              <p>
                Résultat net des trades clôturés : {fmtMoney(review.totals.netPnl, review.currency)}{" "}
                · Frais : {fmtMoney(review.totals.fees, review.currency)}
              </p>
            </div>
          )}
          {review.needsCompleteHistory && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!options.completeHistory}
                disabled={busy}
                onChange={(event) =>
                  onChange({ ...options, completeHistory: event.target.checked })
                }
              />
              <span>
                Cet export comprend toutes les exécutions de chaque contrat source listé, entre le
                premier et le dernier horodatage. Il ne s’agit pas d’une sélection partielle
                d’exécutions répétées.
              </span>
            </label>
          )}
          {!!review.corrections.length && (
            <div className="space-y-2">
              {review.corrections.slice(0, 10).map((correction, index) => (
                <p key={index} className="text-xs">
                  {correction.symbol} · {correction.executedAt} : commission{" "}
                  {fmtMoney(correction.oldFee, review.currency)} →{" "}
                  {fmtMoney(correction.newFee, review.currency)}
                </p>
              ))}
              {review.corrections.length > 10 && (
                <p className="text-xs">
                  Et {review.corrections.length - 10} autres corrections de frais.
                </p>
              )}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!options.approveFeeCorrections}
                  disabled={busy}
                  onChange={(event) =>
                    onChange({ ...options, approveFeeCorrections: event.target.checked })
                  }
                />
                <span>
                  Appliquer ces corrections de commission aux exécutions existantes et recalculer le
                  résultat.
                </span>
              </label>
            </div>
          )}
          {review.warnings.map((message) => (
            <p key={message} className="text-xs text-muted-foreground">
              {message}
            </p>
          ))}
          {review.conflicts.map((message) => (
            <p key={message} role="alert" className="text-xs text-loss">
              {message}
            </p>
          ))}
        </>
      )}
      <Button variant="outline" disabled={busy} onClick={onReview}>
        {busy ? "Vérification…" : "Vérifier l’import"}
      </Button>
      {review?.token && (
        <p className="text-xs text-muted-foreground">
          Vérification terminée. L’import enregistrera ce résultat ; si le fichier, les paramètres
          ou le journal changent, une nouvelle vérification sera nécessaire.
        </p>
      )}
    </div>
  );
}
