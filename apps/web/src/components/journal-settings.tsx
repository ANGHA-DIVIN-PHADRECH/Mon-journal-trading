"use client";

import { useEffect, useState } from "react";
import { postJson, useApi } from "@/lib/use-api";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { TimeZonePicker } from "./timezone-picker";

interface SettingsPayload {
  timeZone: string;
  importTimeZone: string;
  multipliers: Record<string, number>;
}

export function TimeZoneSettings() {
  const { data, error, refresh } = useApi<SettingsPayload>("/api/settings");
  const [timeZone, setTimeZone] = useState("");
  const [importTimeZone, setImportTimeZone] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    if (data) {
      setTimeZone(data.timeZone);
      setImportTimeZone(data.importTimeZone);
    }
  }, [data]);

  const save = async () => {
    setBusy(true);
    setSaved(false);
    setFailure("");
    try {
      await postJson("/api/settings", { timeZone, importTimeZone }, "PATCH");
      setSaved(true);
      refresh();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "Échec de l’enregistrement");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fuseaux horaires</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset disabled={busy || !data} className="space-y-4">
          <div>
            <Label htmlFor="display-timezone" className="mb-1 block text-xs text-muted-foreground">
              Fuseau horaire d’affichage (IANA)
            </Label>
            <TimeZonePicker
              id="display-timezone"
              label="Fuseau horaire d’affichage"
              value={timeZone}
              onValueChange={(value) => {
                setTimeZone(value);
                setSaved(false);
              }}
              disabled={busy || !data}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Les heures des trades, les calendriers, les journées du journal et les analyses
              utilisent ce fuseau horaire.
            </p>
            <button
              className="mt-1 text-xs text-muted-foreground underline"
              onClick={() => {
                setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
                setSaved(false);
              }}
            >
              Utiliser le fuseau horaire de cet appareil (
              {Intl.DateTimeFormat().resolvedOptions().timeZone})
            </button>
          </div>
          <div>
            <Label htmlFor="import-timezone" className="mb-1 block text-xs text-muted-foreground">
              Fuseau horaire d’importation par défaut (IANA)
            </Label>
            <TimeZonePicker
              id="import-timezone"
              label="Fuseau horaire d’importation par défaut"
              value={importTimeZone}
              onValueChange={(value) => {
                setImportTimeZone(value);
                setSaved(false);
              }}
              disabled={busy || !data}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Utilisé pour les horodatages sans décalage lors de l’import de fichiers et de la
              synchronisation du courtier IBKR. Vous pouvez le remplacer pour chaque fichier. Les
              trades existants ne sont pas modifiés ; pour corriger le fuseau horaire d’un compte
              IBKR, restaurez les données dans un compte distinct.
            </p>
          </div>
          <Button onClick={save}>
            {busy ? "Enregistrement…" : "Enregistrer les fuseaux horaires"}
          </Button>
        </fieldset>
        {(failure || error) && (
          <p role="alert" className="text-sm text-destructive">
            {failure || error}
          </p>
        )}
        {saved && (
          <p role="status" className="text-sm text-muted-foreground">
            Fuseaux horaires enregistrés.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function ContractMultiplierSettings() {
  const { data, error, refresh } = useApi<SettingsPayload>("/api/settings");
  const [multipliers, setMultipliers] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    if (data)
      setMultipliers(
        Object.entries(data.multipliers)
          .map(([symbol, multiplier]) => `${symbol}=${multiplier}`)
          .join("\n"),
      );
  }, [data]);

  const save = async () => {
    setSaved(false);
    setFailure("");
    const parsed: Record<string, number> = {};
    for (const [index, line] of multipliers.split("\n").entries()) {
      if (!line.trim()) continue;
      const [symbol, value, extra] = line.split("=").map((part) => part.trim());
      if (
        !symbol ||
        !value ||
        extra !== undefined ||
        !Number.isFinite(Number(value)) ||
        Number(value) <= 0 ||
        Object.hasOwn(parsed, symbol.toUpperCase())
      ) {
        setFailure(
          `Vérifiez la ligne ${index + 1} : saisissez un symbole unique et un multiplicateur positif, par exemple ESU6=50.`,
        );
        return;
      }
      parsed[symbol.toUpperCase()] = Number(value);
    }
    setBusy(true);
    try {
      await postJson("/api/settings", { multipliers: parsed }, "PATCH");
      setSaved(true);
      refresh();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "Échec de l’enregistrement");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="contract-multipliers" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Multiplicateurs de contrat</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset disabled={busy || !data} className="space-y-4">
          <div>
            <Label
              htmlFor="contract-multiplier-values"
              className="mb-1 block text-xs text-muted-foreground"
            >
              Contrats à terme/options — un par ligne, SYMBOLE=multiplicateur
            </Label>
            <textarea
              id="contract-multiplier-values"
              value={multipliers}
              onChange={(event) => {
                setMultipliers(event.target.value);
                setSaved(false);
              }}
              placeholder={"ESU6=50\nNQU6=20\nMESU6=5"}
              className="flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Utilisez exactement le symbole affiché dans vos trades importés, y compris le mois du
              contrat s’il est indiqué.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            L’enregistrement des multiplicateurs recalcule le résultat des trades existants à partir
            des exécutions et conserve leurs annotations.
          </p>
          <Button onClick={save}>
            {busy ? "Enregistrement…" : "Enregistrer les multiplicateurs"}
          </Button>
        </fieldset>
        {(failure || error) && (
          <p role="alert" className="text-sm text-destructive">
            {failure || error}
          </p>
        )}
        {saved && (
          <p role="status" className="text-sm text-muted-foreground">
            Multiplicateurs de contrat enregistrés.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
