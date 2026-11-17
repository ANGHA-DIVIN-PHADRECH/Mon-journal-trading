"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Vela } from "@luxalgo/vela";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import {
  RESOLUTIONS,
  type MarketConnection,
  type ExcursionEstimate,
  type Resolution,
  type TradeMarketResult,
} from "@/lib/market-data";
import { providerInfo } from "@/lib/market-providers";
import type { MarketCsvDataset } from "@/lib/market-csv";
import { replayFrame } from "@/lib/trade-replay";
import { useApi } from "@/lib/use-api";
import { fmtMoney } from "@/lib/utils";
import { TradeChart, type ChartExecution, type ChartTrade } from "./trade-chart";
import { usePrivacy } from "./privacy";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { OptionSelect } from "./ui/option-select";

export function TradeMarketData({
  trade,
  executions,
}: {
  trade: ChartTrade & { currency: string };
  executions: ChartExecution[];
}) {
  const privacy = usePrivacy();
  const { data: saved, refresh: refreshSaved } = useApi<{
    saved: { estimate: ExcursionEstimate } | null;
  }>(`/api/trades/${encodeURIComponent(trade.key)}/market-data`);
  const { data: connections, error: connectionError } = useApi<{ connections: MarketConnection[] }>(
    "/api/market-data/connections",
  );
  const available = connections?.connections.filter((connection) => connection.configured) ?? [];
  const [provider, setProvider] = useState("");
  const [symbol, setSymbol] = useState(trade.symbol);
  const [dataset, setDataset] = useState("");
  const [resolution, setResolution] = useState<Resolution>("1m");
  const info = providerInfo(provider);
  const { data: csv } = useApi<{ datasets: MarketCsvDataset[] }>(
    info?.mode === "csv" ? "/api/market-data/csv" : null,
  );
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<TradeMarketResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const invalidate = () => {
    controller.current?.abort();
    setBusy(false);
    setResult(null);
    setError("");
  };
  const load = async () => {
    if (!available.some((item) => item.id === provider) || (info?.datasets && !dataset)) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`/api/trades/${encodeURIComponent(trade.key)}/market-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          symbol,
          dataset,
          resolution,
          basisConfirmed: confirmed,
        }),
        signal: request.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Échec de la requête d’historique.");
      if (!request.signal.aborted) {
        setResult(body);
        refreshSaved();
      }
    } catch (cause) {
      if (!request.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Échec de la requête d’historique.");
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Données de marché et relecture</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Chargez les chandeliers de ce trade pour utiliser la relecture. Cochez la case pour
            calculer et enregistrer également les estimations monétaires MAE/MFE dans les rapports.
          </p>
          {connectionError && (
            <p role="alert" className="text-sm text-destructive">
              {connectionError}
            </p>
          )}
          {!available.length && (
            <p className="text-sm text-muted-foreground">
              <a className="underline" href="/settings#market-data">
                Connecter un fournisseur de données de marché dans les paramètres
              </a>{" "}
              pour utiliser la relecture historique et les estimations.
            </p>
          )}
          {!trade.closedAt ? (
            <p className="text-sm text-muted-foreground">
              Disponible après la clôture de ce trade.
            </p>
          ) : (
            available.length > 0 && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="market-provider">Fournisseur de données</Label>
                    <OptionSelect
                      id="market-provider"
                      value={provider}
                      onValueChange={(value) => {
                        invalidate();
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
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="market-symbol">Symbole chez le fournisseur</Label>
                    <Input
                      id="market-symbol"
                      value={symbol}
                      onChange={(event) => {
                        invalidate();
                        setSymbol(event.target.value);
                        setConfirmed(false);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="market-resolution">Granularité des chandeliers</Label>
                    <OptionSelect
                      id="market-resolution"
                      value={resolution}
                      onValueChange={(value) => {
                        invalidate();
                        setResolution(value as Resolution);
                      }}
                    >
                      {Object.keys(RESOLUTIONS).map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </OptionSelect>
                  </div>
                  {(info?.datasets ||
                    info?.mode === "csv" ||
                    info?.id === "london-strategic-edge") && (
                    <div className="space-y-1">
                      <Label htmlFor="market-dataset">Flux / jeu de données</Label>
                      {info?.datasets || info?.mode === "csv" ? (
                        <OptionSelect
                          id="market-dataset"
                          value={dataset}
                          onValueChange={(value) => {
                            invalidate();
                            setDataset(value);
                            setConfirmed(false);
                          }}
                        >
                          {(
                            info.datasets ?? [
                              {
                                value: "",
                                label: "Sélection automatique du fichier correspondant",
                              },
                              ...(csv?.datasets ?? []).map((item) => ({
                                value: item.id,
                                label: `${item.name} · ${item.symbol} · ${item.resolution}`,
                              })),
                            ]
                          ).map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </OptionSelect>
                      ) : (
                        <Input
                          id="market-dataset"
                          value={dataset}
                          placeholder="Laisser vide pour la sélection automatique"
                          onChange={(event) => {
                            invalidate();
                            setDataset(event.target.value);
                            setConfirmed(false);
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {info?.description} {info?.symbolHint} L’historique des contrats d’options n’est
                  pas encore pris en charge.
                </p>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    className="mt-0.5"
                    onChange={(event) => {
                      invalidate();
                      setConfirmed(event.target.checked);
                    }}
                  />
                  <span>
                    Calculer et enregistrer les estimations MAE/MFE dans les rapports. Je confirme
                    que cet instrument, les ajustements de prix et la devise de cotation
                    correspondent à mes exécutions et à mon compte ({trade.currency}).
                  </span>
                </label>
                <p className="text-xs text-muted-foreground">
                  Non cochée : charger les chandeliers et utiliser uniquement la relecture. Cochée :
                  calculer également les estimations monétaires et enregistrer les résultats valides
                  dans les rapports. Les données manquantes ou incompatibles restent indisponibles.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={
                      busy ||
                      !symbol.trim() ||
                      !available.some((item) => item.id === provider) ||
                      Boolean(info?.datasets && !dataset)
                    }
                    onClick={() => void load()}
                  >
                    {busy
                      ? "Chargement de l’historique…"
                      : confirmed
                        ? "Charger les données et enregistrer les estimations"
                        : "Charger les chandeliers et lancer la relecture"}
                  </Button>
                  {busy && (
                    <Button variant="outline" onClick={invalidate}>
                      Annuler
                    </Button>
                  )}
                  {result && (
                    <Button variant="outline" onClick={invalidate}>
                      Afficher le graphique d’origine
                    </Button>
                  )}
                </div>
              </>
            )
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
      {!result && saved?.saved && (
        <p className="text-xs text-muted-foreground">
          Les estimations MAE/MFE déjà enregistrées sont affichées ci-dessous. Le chargement des
          chandeliers sans cocher la case conserve ces estimations et n’en calcule pas de nouvelles.
        </p>
      )}
      {result && result.bars.length > 0 ? (
        <HistoricalReplay
          history={result}
          trade={trade}
          executions={executions}
          privacy={privacy}
        />
      ) : (
        <>
          <div
            className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-3"
            aria-label="État des fonctions de données de marché"
          >
            <div>
              <p className="text-xs text-muted-foreground">MAE estimé</p>
              <p className="text-sm">
                {busy
                  ? "Chargement des chandeliers…"
                  : error
                    ? "Échec de la requête de données"
                    : saved?.saved
                      ? privacy
                        ? "••••"
                        : fmtMoney(saved.saved.estimate.mae!, trade.currency)
                      : "Charger les données de marché pour calculer"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">MFE estimé</p>
              <p className="text-sm">
                {busy
                  ? "Chargement des chandeliers…"
                  : error
                    ? "Échec de la requête de données"
                    : saved?.saved
                      ? privacy
                        ? "••••"
                        : fmtMoney(saved.saved.estimate.mfe!, trade.currency)
                      : "Charger les données de marché pour calculer"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Relecture du trade</p>
              <p className="text-sm">
                {busy
                  ? "Chargement des chandeliers…"
                  : "Disponible après le chargement des chandeliers"}
              </p>
            </div>
          </div>
          {result && (
            <p role="status" className="text-sm text-muted-foreground">
              Aucun chandelier n’a été renvoyé pour cet instrument et la période du trade. Vérifiez
              le symbole, le jeu de données et la couverture de votre offre.
            </p>
          )}
          <TradeChart trade={trade} executions={executions} />
        </>
      )}
    </div>
  );
}

export function HistoricalReplay({
  history,
  trade,
  executions,
  privacy,
}: {
  history: TradeMarketResult;
  trade: ChartTrade & { currency: string };
  executions: ChartExecution[];
  privacy: boolean;
}) {
  const [count, setCount] = useState(history.bars.length);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("4");
  useEffect(() => {
    setCount(history.bars.length);
    setPlaying(false);
  }, [history]);
  useEffect(() => {
    if (!playing || privacy) return;
    const timer = window.setInterval(
      () => {
        if (!document.hidden) setCount((current) => Math.min(current + 1, history.bars.length));
      },
      1000 / Number(speed),
    );
    return () => window.clearInterval(timer);
  }, [playing, privacy, speed, history.bars.length]);
  useEffect(() => {
    if (count >= history.bars.length || privacy) setPlaying(false);
  }, [count, privacy, history.bars.length]);
  const complete = count === history.bars.length;
  const frame = useMemo(
    () => replayFrame(history, history.estimate.priceBasisMismatch ? [] : executions, count),
    [history, executions, count],
  );
  return (
    <Card className="journal-replay-enter">
      <CardHeader>
        <CardTitle>Chandeliers historiques</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {history.provider} · {history.symbol} · {history.resolution} ·{" "}
          {history.bars.length.toLocaleString("fr-FR")} chandeliers · Récupérés le{" "}
          {new Date(history.fetchedAt).toLocaleString("fr-FR")}
        </p>
        {privacy ? (
          <p className="text-sm text-muted-foreground">
            Les cours historiques et les montants d’excursion sont masqués en mode confidentialité.
          </p>
        ) : (
          <>
            {history.estimate.priceBasisMismatch && (
              <p role="status" className="rounded-md border p-3 text-sm text-muted-foreground">
                Les chandeliers de marché et les cours d’exécution enregistrés ne correspondent pas.
                La relecture affiche les cours du marché ; les libellés des exécutions et les
                estimations MAE/MFE sont masqués. Consultez les limites des données ci-dessous.
              </p>
            )}
            <ReplayChart history={history} nextFrame={frame} />
            <div
              className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2"
              role="group"
              aria-label="Commandes de relecture des chandeliers"
            >
              <Button
                variant="outline"
                size="icon"
                aria-label="Recommencer la relecture"
                onClick={() => {
                  setPlaying(false);
                  setCount(1);
                }}
              >
                <RotateCcw />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Chandelier précédent"
                disabled={count <= 1}
                onClick={() => {
                  setPlaying(false);
                  setCount((current) => Math.max(1, current - 1));
                }}
              >
                <ChevronLeft />
              </Button>
              <Button
                className="min-w-24"
                disabled={history.bars.length <= 1}
                onClick={() => {
                  if (complete) setCount(1);
                  setPlaying(!playing);
                }}
              >
                {playing ? <Pause /> : <Play />}
                {playing ? "Pause" : "Lecture"}
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Chandelier suivant"
                disabled={complete}
                onClick={() => {
                  setPlaying(false);
                  setCount((current) => Math.min(current + 1, history.bars.length));
                }}
              >
                <ChevronRight />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Afficher tous les chandeliers"
                disabled={complete}
                onClick={() => {
                  setPlaying(false);
                  setCount(history.bars.length);
                }}
              >
                <SkipForward />
              </Button>
              <span className="mx-1 text-xs tabular-nums text-muted-foreground" aria-live="off">
                {count.toLocaleString()} / {history.bars.length.toLocaleString()}
              </span>
              <OptionSelect
                aria-label="Vitesse de relecture"
                className="ml-auto w-20"
                value={speed}
                onValueChange={setSpeed}
              >
                <option value="1">1×</option>
                <option value="2">2×</option>
                <option value="4">4×</option>
              </OptionSelect>
            </div>
            <input
              aria-label="Position de relecture"
              type="range"
              min={1}
              max={history.bars.length}
              value={count}
              className="w-full accent-primary"
              onChange={(event) => {
                setPlaying(false);
                setCount(Number(event.target.value));
              }}
            />
            <p className="text-xs text-muted-foreground">
              {count} / {history.bars.length} chandeliers · Jusqu’au{" "}
              {new Date(frame.through).toISOString()} (UTC). Les chandeliers apparaissent à leur
              clôture ; il ne s’agit pas d’une simulation tick par tick.
            </p>
          </>
        )}
        <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
          <div>
            <p className="text-xs text-muted-foreground">MAE estimé · excursion défavorable</p>
            <p className="font-medium">
              {privacy
                ? "••••"
                : !complete
                  ? "Masqué pendant la relecture"
                  : history.estimate.mae === null
                    ? "Indisponible"
                    : fmtMoney(history.estimate.mae, trade.currency).replace(/^\+/, "")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">MFE estimé · excursion favorable</p>
            <p className="font-medium">
              {privacy
                ? "••••"
                : !complete
                  ? "Masqué pendant la relecture"
                  : history.estimate.mfe === null
                    ? "Indisponible"
                    : fmtMoney(history.estimate.mfe, trade.currency).replace(/^\+/, "")}
            </p>
          </div>
        </div>
        <details className="text-xs text-muted-foreground" open>
          <summary className="cursor-pointer">
            Couverture des données et limites des estimations
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {[...history.warnings, ...history.estimate.warnings].map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      </CardContent>
    </Card>
  );
}

function ReplayChart({
  history,
  nextFrame,
}: {
  history: TradeMarketResult;
  nextFrame: ReturnType<typeof replayFrame<ChartExecution>>;
}) {
  // Chart-local identity also works on HTTP LAN origins without crypto.randomUUID.
  const indicatorType = `replay-fills-${useId()}`;
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<Vela | null>(null);
  const frame = useRef(nextFrame);
  const latest = useRef(nextFrame);
  latest.current = nextFrame;
  const update = useRef<(() => void) | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    setError("");
    setReady(false);
    void (async () => {
      const { Vela, registerNativeIndicator, unregisterNativeIndicator } =
        await import("@luxalgo/vela");
      if (disposed || !host.current) return;
      const type = indicatorType;
      registerNativeIndicator({
        type,
        title: "Exécutions enregistrées",
        paneHint: "price",
        overlay: true,
        inputsSchema: () => [],
        defaultInputs: () => ({}),
        create: () => ({
          start(ctx) {
            ctx.emit({
              labels: frame.current.fills.map((fill, index) => ({
                id: `fill-${index}`,
                paneId: "price",
                xloc: "bar_time" as const,
                x: Date.parse(fill.executedAt),
                y: fill.price,
                yloc: "price" as const,
                text: `${fill.side.toUpperCase()} ${fill.quantity}`,
                style: "label_left" as const,
                color: fill.side === "buy" ? "#087f23" : "#bd2626",
                textColor: "#ffffff",
                size: "small" as const,
                textAlign: "center" as const,
                fontFamily: "default" as const,
                overlay: true,
              })),
            });
            ctx.setStatus("idle");
          },
          onBars() {},
          onViewport() {},
          setInputs() {},
          suspend() {},
          resume() {},
          stop() {},
        }),
      });
      const dark = () => document.documentElement.classList.contains("dark");
      const instance = new Vela(host.current, {
        symbol: history.symbol,
        timeframe: { "1m": "1", "5m": "5", "15m": "15", "1h": "60", "1d": "1D" }[
          history.resolution
        ],
        data: latest.current.bars,
        live: false,
        height: 420,
        theme: dark() ? "dark" : "light",
        priceStyle: "candles",
        volume: true,
        drawings: false,
      });
      chart.current = instance;
      frame.current = latest.current;
      instance.addNativeIndicator(type);
      let updating = false;
      // Coalesce rapid scrubbing/ticks instead of queuing expensive Vela reloads.
      const flush = async () => {
        if (updating || disposed) return;
        updating = true;
        try {
          do {
            frame.current = latest.current;
            await instance.setMarket({ data: frame.current.bars });
          } while (!disposed && frame.current !== latest.current);
        } catch {
          if (!disposed) setError("Impossible de mettre à jour le graphique de relecture.");
        } finally {
          updating = false;
        }
      };
      update.current = () => {
        void flush();
      };
      const observer = new MutationObserver(() => instance.setTheme(dark() ? "dark" : "light"));
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      cleanup = () => {
        update.current = null;
        observer.disconnect();
        instance.destroy();
        unregisterNativeIndicator(type);
        if (chart.current === instance) chart.current = null;
      };
      await instance.ready();
      if (!disposed) setReady(true);
    })().catch(() => {
      if (!disposed) setError("Impossible d’afficher le graphique historique.");
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [history, indicatorType]);
  useEffect(() => {
    update.current?.();
  }, [nextFrame, history]);
  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div
        className="relative h-[420px] overflow-hidden rounded-lg border"
        aria-busy={!ready && !error}
      >
        {!ready && !error && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-muted/20 text-sm text-muted-foreground"
            role="status"
          >
            Préparation de la relecture des chandeliers…
          </div>
        )}
        <div ref={host} className={`h-full ${ready ? "journal-replay-reveal" : "invisible"}`} />
      </div>
    </>
  );
}
