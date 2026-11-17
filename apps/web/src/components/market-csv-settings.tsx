"use client";
import { useState } from "react";
import { MAX_CSV_BYTES, type MarketCsvDataset } from "@/lib/market-csv";
import { RESOLUTIONS, type MarketBar, type Resolution } from "@/lib/market-data";
import { postJson, useApi } from "@/lib/use-api";
import { decodeImportFile } from "@/lib/decode-import";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { OptionSelect } from "./ui/option-select";
import { MonetaryValue } from "./privacy";
interface Preview {
  count: number;
  from: string;
  to: string;
  sample: MarketBar[];
}
export function MarketCsvSettings({ onChange }: { onChange: () => void }) {
  const {
    data,
    refresh,
    error: listError,
  } = useApi<{ datasets: MarketCsvDataset[] }>("/api/market-data/csv");
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [symbol, setSymbol] = useState("");
  const [resolution, setResolution] = useState<Resolution | "">("");
  const [currency, setCurrency] = useState("");
  const [priceBasis, setPriceBasis] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const change = () => {
    setPreview(null);
    setMessage("");
    setError("");
  };
  const act = async (action: "preview" | "import" | "remove", id?: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = await postJson<Preview>("/api/market-data/csv", {
        action,
        id,
        ...file,
        symbol,
        resolution,
        currency,
        priceBasis,
      });
      if (action === "preview") setPreview(body);
      else {
        setPreview(null);
        setMessage(
          action === "import"
            ? "Chandeliers de marché importés. Choisissez « CSV de données de marché » dans un trade ou dans les rapports."
            : "Jeu de données et estimations enregistrées supprimés.",
        );
        refresh();
        onChange();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Échec de la requête CSV.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-lg border p-3" id="market-csv">
      <h3 className="text-sm font-medium">CSV de données de marché</h3>
      <p className="text-xs text-muted-foreground">
        Importez un instrument et une granularité de chandeliers par fichier (5 Mo / 50 000 lignes
        maximum). Colonnes obligatoires : time, open, high, low, close. Le volume est facultatif.
        L’heure correspond à l’ouverture de la bougie : ISO-8601 avec fuseau horaire, ou horodatage
        Unix en secondes ou millisecondes. Les bougies journalières doivent commencer à 00:00 UTC.
        Il s’agit de chandeliers de marché, distincts des imports d’exécutions de trades.
      </p>
      <a className="text-xs underline" href="/market-data-template.csv" download>
        Télécharger le modèle d’en-tête CSV générique
      </a>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="candle-file">Fichier CSV de chandeliers</Label>
          <Input
            id="candle-file"
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            disabled={busy}
            onChange={async (event) => {
              const selected = event.target.files?.[0];
              change();
              setFile(null);
              if (!selected) return;
              if (selected.size > MAX_CSV_BYTES) {
                setError("Le fichier CSV doit faire moins de 5 Mo.");
                return;
              }
              setBusy(true);
              try {
                setFile({
                  name: selected.name,
                  content: decodeImportFile(await selected.arrayBuffer()),
                });
              } catch {
                setError("Impossible de lire ce fichier.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="candle-symbol">Symbole de l’instrument</Label>
          <Input
            id="candle-symbol"
            value={symbol}
            disabled={busy}
            placeholder="Symbole exact utilisé dans votre fichier"
            onChange={(event) => {
              change();
              setSymbol(event.target.value.trim());
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="candle-resolution">Granularité des chandeliers</Label>
          <OptionSelect
            id="candle-resolution"
            value={resolution}
            disabled={busy}
            onValueChange={(value) => {
              change();
              setResolution(value as Resolution);
            }}
          >
            <option value="" disabled>
              Choisissez la granularité du fichier
            </option>
            {Object.keys(RESOLUTIONS).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </OptionSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="candle-currency">Devise de cotation</Label>
          <Input
            id="candle-currency"
            value={currency}
            disabled={busy}
            maxLength={12}
            onChange={(event) => {
              change();
              setCurrency(event.target.value.toUpperCase());
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="candle-basis">Base de prix</Label>
          <OptionSelect
            id="candle-basis"
            value={priceBasis}
            disabled={busy}
            onValueChange={(value) => {
              change();
              setPriceBasis(value);
            }}
          >
            <option value="" disabled>
              Choisissez la base de prix du fichier
            </option>
            <option value="raw">Brut / non ajusté</option>
            <option value="split">Ajusté des divisions d’actions</option>
            <option value="adjusted">Autre ajustement</option>
            <option value="midpoint">Cours moyen</option>
            <option value="bid">À l’achat</option>
            <option value="ask">À la vente</option>
          </OptionSelect>
        </div>
      </div>
      <Button
        variant="outline"
        disabled={busy || !file || !symbol || !currency || !resolution || !priceBasis}
        onClick={() => void act("preview")}
      >
        Valider et prévisualiser les chandeliers
      </Button>
      {preview && (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-xs">
            {preview.count.toLocaleString()} candles · {preview.from} to {preview.to}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="text-left">Premiers chandeliers (UTC)</caption>
              <thead>
                <tr>
                  {["Heure", "Ouverture", "Plus haut", "Plus bas", "Clôture"].map((label) => (
                    <th key={label} className="p-2">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((bar) => (
                  <tr key={bar.time}>
                    <td className="p-2">{new Date(bar.time).toISOString()}</td>
                    {[bar.open, bar.high, bar.low, bar.close].map((value, index) => (
                      <td key={index} className="p-2">
                        <MonetaryValue>{value}</MonetaryValue>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button disabled={busy} onClick={() => void act("import")}>
            Importer les chandeliers de marché
          </Button>
        </div>
      )}
      {(error || listError) && (
        <p role="alert" className="text-xs text-destructive">
          {error || listError}
        </p>
      )}
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
      {data?.datasets.map((dataset) => (
        <div
          key={dataset.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
        >
          <div className="min-w-0 text-xs">
            <p className="break-all font-medium">
              {dataset.name} · {dataset.symbol} · {dataset.resolution}
            </p>
            <p className="text-muted-foreground">
              {dataset.count.toLocaleString()} candles · {dataset.currency} · {dataset.priceBasis} ·{" "}
              {dataset.from.slice(0, 10)} – {dataset.to.slice(0, 10)}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void act("remove", dataset.id)}
          >
            Supprimer le jeu de données
          </Button>
        </div>
      ))}
    </div>
  );
}
