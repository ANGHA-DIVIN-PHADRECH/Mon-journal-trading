"use client";

import { useEffect, useRef, useState } from "react";
import {
  RESOLUTIONS,
  type Resolution,
  type MarketConnection,
  type TradeMarketResult,
} from "@/lib/market-data";
import type { TradePoint } from "@/lib/trade-explorer";
import { providerInfo } from "@/lib/market-providers";
import { useApi } from "@/lib/use-api";
import { Button } from "./ui/button";
import { OptionSelect } from "./ui/option-select";

export function ReportMarketEstimates({
  points,
  currencies,
  onComplete,
}: {
  points: TradePoint[];
  currencies: string[];
  onComplete: () => void;
}) {
  const { data } = useApi<{ connections: MarketConnection[] }>("/api/market-data/connections");
  const available = data?.connections.filter((item) => item.configured) ?? [];
  const [provider, setProvider] = useState("");
  const [dataset, setDataset] = useState("");
  const [resolution, setResolution] = useState<Resolution>("1m");
  const info = providerInfo(provider);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const missing = points.filter((point) => point.mae === null || point.mfe === null);
  const calculate = async () => {
    if (!available.some((item) => item.id === provider) || (info?.datasets && !dataset)) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setIssues([]);
    let saved = 0,
      failed = 0,
      completed = 0,
      consecutiveFailures = 0;
    const problems = new Set<string>();
    try {
      for (const point of missing) {
        if (request.signal.aborted) break;
        setStatus(`Calcul de ${completed + 1} sur ${missing.length} · ${point.symbol}`);
        try {
          const response = await fetch(`/api/trades/${encodeURIComponent(point.key)}/market-data`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider,
              symbol: point.symbol,
              resolution,
              dataset,
              basisConfirmed: true,
              estimateOnly: true,
            }),
            signal: request.signal,
          });
          const body = (await response.json()) as TradeMarketResult & { error?: string };
          if (!response.ok) throw new Error(body.error ?? "Échec de la requête d’historique.");
          if (body.estimate.mae === null || body.estimate.mfe === null)
            throw new Error(body.estimate.warnings[0] ?? "Estimation indisponible.");
          saved++;
          consecutiveFailures = 0;
        } catch (cause) {
          if (request.signal.aborted) break;
          failed++;
          consecutiveFailures++;
          problems.add(
            `${point.symbol} : ${cause instanceof Error ? cause.message : "Échec de la requête d’historique."}`,
          );
          setIssues([...problems].slice(0, 3));
        }
        completed++;
        // Stop a systemic provider failure instead of repeating it across an entire account.
        if (consecutiveFailures >= 3) break;
      }
    } finally {
      setBusy(false);
      setStatus(
        `${request.signal.aborted ? "Arrêté. " : ""}${saved} estimations enregistrées · ${failed} indisponibles · ${missing.length - completed} non traitées.`,
      );
      onComplete();
    }
  };
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h3 className="text-sm font-medium">Estimations MAE et MFE</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {points.length - missing.length} trades clôturés sur {points.length} ont des estimations
          enregistrées. Les estimations d’excursion brute excluent les frais ; le MAE est affiché
          comme une valeur défavorable positive. Les valeurs manquantes sont exclues des graphiques,
          jamais considérées comme nulles.
        </p>
      </div>
      {missing.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">Calculer les estimations manquantes</summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Charge des chandeliers {resolution} pour cette sélection, à partir du symbole indiqué
              pour chaque trade. Cette opération utilise votre quota fournisseur et peut prendre
              plusieurs minutes. Pour les symboles personnalisés ou un jeu de données CSV précis,
              chargez et enregistrez les estimations depuis chaque trade.
            </p>
            {available.length ? (
              <>
                <OptionSelect
                  aria-label="Fournisseur de données pour les estimations"
                  value={provider}
                  disabled={busy}
                  onValueChange={(value) => {
                    setProvider(value);
                    setDataset("");
                    setConfirmed(false);
                  }}
                >
                  <option value="" disabled>
                    Choisissez une source de données
                  </option>
                  {available.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </OptionSelect>
                <OptionSelect
                  aria-label="Granularité des chandeliers pour les estimations"
                  disabled={busy}
                  value={resolution}
                  onValueChange={(value) => setResolution(value as Resolution)}
                >
                  {Object.keys(RESOLUTIONS).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </OptionSelect>
                {info?.datasets && (
                  <OptionSelect
                    aria-label="Jeu de données pour les estimations"
                    value={dataset}
                    disabled={busy}
                    onValueChange={(value) => {
                      setDataset(value);
                      setConfirmed(false);
                    }}
                  >
                    {info.datasets.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </OptionSelect>
                )}
                <p className="text-xs text-muted-foreground">{info?.symbolHint}</p>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={busy || currencies.length !== 1}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  Je confirme que ces symboles, ajustements de prix et devises de cotation
                  correspondent aux exécutions et à la devise du compte (
                  {currencies.join(", ") || "aucune"}).
                </label>
                {currencies.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    Sélectionnez des comptes dans une même devise pour calculer les estimations
                    ensemble.
                  </p>
                )}
                <Button
                  disabled={
                    busy ||
                    !confirmed ||
                    currencies.length !== 1 ||
                    !available.some((item) => item.id === provider) ||
                    Boolean(info?.datasets && !dataset)
                  }
                  onClick={() => void calculate()}
                >
                  Calculer les {missing.length} estimations manquantes
                </Button>
              </>
            ) : (
              <a className="text-sm underline" href="/settings#market-data">
                Connecter un fournisseur de données de marché dans les paramètres
              </a>
            )}
          </div>
        </details>
      )}
      {busy && (
        <Button variant="outline" onClick={() => controller.current?.abort()}>
          Arrêter le calcul
        </Button>
      )}
      {status && (
        <p role="status" className="text-xs text-muted-foreground">
          {status}
        </p>
      )}
      {issues.length > 0 && (
        <ul className="space-y-1 text-xs text-destructive">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
