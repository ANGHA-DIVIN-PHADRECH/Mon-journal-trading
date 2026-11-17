"use client";

import { useState } from "react";
import { useApi, postJson } from "@/lib/use-api";
import type { MarketConnection } from "@/lib/market-data";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { OptionSelect } from "./ui/option-select";
import { providerInfo } from "@/lib/market-providers";
import { MarketCsvSettings } from "./market-csv-settings";

export function MarketDataSettings() {
  const { data, error, refresh } = useApi<{ connections: MarketConnection[] }>(
    "/api/market-data/connections",
  );
  return (
    <Card id="market-data" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>Données de marché</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Connectez les cours historiques pour estimer le MAE/MFE et revoir les chandeliers des
          trades clôturés. Vela affiche les graphiques. Aucune source de données n’est activée ou
          sélectionnée par défaut. Choisissez une connexion ou importez vos propres chandeliers. Les
          connexions de données de marché sont distinctes de la synchronisation du courtier et de
          l’IA.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!data && !error && (
          <p className="text-sm text-muted-foreground">Chargement des connexions…</p>
        )}
        {data?.connections
          .filter((connection) => connection.id !== "market-csv")
          .map((connection) => (
            <Connection key={connection.id} connection={connection} refresh={refresh} />
          ))}
        <MarketCsvSettings onChange={refresh} />
      </CardContent>
    </Card>
  );
}

function Connection({
  connection,
  refresh,
}: {
  connection: MarketConnection;
  refresh: () => void;
}) {
  const info = providerInfo(connection.id)!;
  const defaults = () =>
    Object.fromEntries(info.fields.map((field) => [field.key, field.defaultValue ?? ""]));
  const [fields, setFields] = useState<Record<string, string>>(defaults);
  const publicSource = info.mode === "public";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const managed = connection.source === "environment";
  const act = async (action: "save" | "remove" | "test" | "enable") => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await postJson("/api/market-data/connections", {
        provider: connection.id,
        action,
        ...(action === "save" ? { credentials: fields } : {}),
      });
      setFields(defaults());
      setMessage(
        action === "test"
          ? publicSource
            ? "Le point de terminaison public est accessible. Aucune clé API ni offre de données payante n’est requise. La disponibilité des chandeliers dépend de la paire, de la période et des limites de l’API publique."
            : "Connexion vérifiée. Les instruments disponibles dépendent de votre accès auprès du fournisseur."
          : action === "save"
            ? "Identifiants enregistrés. Testez la connexion pour vérifier l’accès."
            : action === "enable"
              ? "Données de marché publiques activées."
              : "Connexion supprimée.",
      );
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Échec de la mise à jour de la connexion.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{connection.name}</h3>
        <span className="text-xs text-muted-foreground">
          {managed
            ? "Géré par l’environnement du serveur"
            : connection.configured
              ? publicSource
                ? "Activé · aucune clé requise"
                : "Identifiants enregistrés"
              : "Non connecté"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{info.description}</p>
      {!publicSource && (
        <p className="text-xs text-muted-foreground">
          Les identifiants sont chiffrés localement et utilisés uniquement par le serveur pour les
          données de marché. Les secrets enregistrés ne sont jamais renvoyés au navigateur ni inclus
          dans les exports du journal.
        </p>
      )}
      {managed && !connection.configured && (
        <p className="text-xs text-destructive">
          Renseignez tous les champs obligatoires dans l’environnement du serveur.
        </p>
      )}
      {!managed &&
        !publicSource &&
        info.fields.map((field) => (
          <div key={field.key} className="space-y-1">
            <Label htmlFor={`key-${connection.id}-${field.key}`}>{field.label}</Label>
            {field.options ? (
              <OptionSelect
                id={`key-${connection.id}-${field.key}`}
                value={fields[field.key] ?? ""}
                disabled={busy}
                onValueChange={(value) =>
                  setFields((current) => ({ ...current, [field.key]: value }))
                }
              >
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </OptionSelect>
            ) : (
              <Input
                id={`key-${connection.id}-${field.key}`}
                type="password"
                value={fields[field.key] ?? ""}
                onChange={(event) =>
                  setFields((current) => ({ ...current, [field.key]: event.target.value }))
                }
                placeholder={
                  connection.configured
                    ? `Saisissez le nouvel élément : ${field.label.toLowerCase()}`
                    : `Saisissez : ${field.label.toLowerCase()}`
                }
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
              />
            )}
          </div>
        ))}
      <div className="flex flex-wrap gap-2">
        {!managed && !publicSource && (
          <Button
            disabled={busy || info.fields.some((field) => !fields[field.key]?.trim())}
            onClick={() => void act("save")}
          >
            Enregistrer les identifiants
          </Button>
        )}
        {publicSource && !connection.configured && (
          <Button disabled={busy} onClick={() => void act("enable")}>
            Activer la source
          </Button>
        )}
        {connection.configured && (
          <Button variant="outline" disabled={busy} onClick={() => void act("test")}>
            Tester la connexion
          </Button>
        )}
        {connection.configured && !managed && (
          <Button variant="outline" disabled={busy} onClick={() => void act("remove")}>
            {publicSource ? "Désactiver la source" : "Supprimer les identifiants"}
          </Button>
        )}
      </div>
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
