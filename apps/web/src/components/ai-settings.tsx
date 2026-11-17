"use client";

import { useEffect, useState } from "react";
import {
  AI_DEFAULT_MODELS,
  AI_KEY_VARIABLES,
  AI_PROVIDER_NAMES,
  AI_PROVIDERS,
  type AiProvider,
  type AiSettingsPayload,
} from "@/lib/ai-settings";
import { postJson, useApi } from "@/lib/use-api";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { OptionSelect } from "./ui/option-select";

export function AiSettings() {
  const { data, error, loading, refresh } = useApi<AiSettingsPayload>("/api/settings");
  const [provider, setProvider] = useState<AiProvider>("anthropic");
  const [model, setModel] = useState(AI_DEFAULT_MODELS.anthropic);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    if (!data) return;
    setProvider(data.aiProvider);
    setModel(data.aiModel);
    setBaseUrl(data.aiConnections.compatible.baseUrl ?? "");
  }, [data]);

  const connection = data?.aiConnections[provider];
  const environment = connection?.source === "environment";
  const compatible = provider === "compatible";
  const name = AI_PROVIDER_NAMES[provider];
  const disabled = busy || loading || !data;
  const keyHint = environment
    ? `La variable ${AI_KEY_VARIABLES[provider]} de l’environnement du serveur est utilisée. Modifiez ou supprimez-la sur le serveur pour changer la clé.`
    : compatible
      ? connection?.source === "saved"
        ? "Laissez ce champ vide pour conserver la clé enregistrée. L’enregistrement d’une autre adresse de serveur supprimera la clé actuelle."
        : "À renseigner uniquement si votre serveur l’exige."
      : connection?.configured
        ? "Laissez ce champ vide pour conserver la clé enregistrée ou saisissez-en une nouvelle."
        : "Ajoutez votre clé API, puis enregistrez pour utiliser ce fournisseur.";

  const save = async (remove = false) => {
    setBusy(true);
    setFailure("");
    setSaved("");
    try {
      await postJson(
        "/api/settings",
        remove
          ? {
              [`${provider}Key`]: null,
            }
          : {
              aiProvider: provider,
              aiModel: model.trim(),
              ...(compatible ? { compatibleBaseUrl: baseUrl.trim() } : {}),
              ...(apiKey.trim() ? { [`${provider}Key`]: apiKey.trim() } : {}),
            },
        "PATCH",
      );
      setApiKey("");
      setSaved(remove ? `Clé ${name} supprimée.` : `Paramètres ${name} enregistrés.`);
      refresh();
    } catch (cause) {
      setFailure(
        cause instanceof Error ? cause.message : "Impossible d’enregistrer les paramètres de l’IA.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="ai-settings" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>IA (utilisez votre propre clé)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Utilisez Anthropic, OpenAI ou un serveur compatible avec OpenAI, comme Ollama, LM Studio
          ou OpenRouter, pour générer des bilans, analyser vos trades et interroger votre journal.
          Votre clé est chiffrée au repos. Les requêtes d’IA sont envoyées directement depuis votre
          serveur au fournisseur choisi.
        </p>
        {data && (
          <p className="text-xs text-muted-foreground">
            Fournisseur actif : {AI_PROVIDER_NAMES[data.aiProvider]} ·{" "}
            {data.aiConfigured
              ? data.aiProvider === "compatible"
                ? "Serveur configuré"
                : "Clé configurée"
              : "Non configuré"}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="ai-provider">Fournisseur</Label>
            <OptionSelect
              id="ai-provider"
              value={provider}
              disabled={disabled}
              onValueChange={(value) => {
                const next = value as AiProvider;
                setProvider(next);
                setModel(data?.aiConnections[next].model ?? AI_DEFAULT_MODELS[next]);
                setApiKey("");
                setSaved("");
                setFailure("");
              }}
            >
              {AI_PROVIDERS.map((id) => (
                <option key={id} value={id}>
                  {AI_PROVIDER_NAMES[id]}
                </option>
              ))}
            </OptionSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ai-model">Identifiant du modèle</Label>
            <Input
              id="ai-model"
              value={model}
              disabled={disabled}
              placeholder={compatible ? "e.g. llama3.1:8b" : AI_DEFAULT_MODELS[provider]}
              onChange={(event) => {
                setModel(event.target.value);
                setSaved("");
              }}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Utilisez un modèle de texte disponible auprès de votre fournisseur ou serveur. Chaque
          fournisseur conserve son propre modèle et sa propre clé.
        </p>
        {compatible && (
          <div className="space-y-1">
            <Label htmlFor="ai-base-url">Adresse du serveur</Label>
            <Input
              id="ai-base-url"
              type="url"
              value={baseUrl}
              disabled={disabled}
              placeholder="http://localhost:11434/v1"
              onChange={(event) => {
                setBaseUrl(event.target.value);
                setSaved("");
              }}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              L’adresse racine de l’API indiquée par votre serveur, se terminant généralement par
              /v1, par exemple http://localhost:11434/v1 pour Ollama ou
              https://openrouter.ai/api/v1. Elle doit être accessible depuis la machine qui exécute
              le journal.
            </p>
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="ai-api-key">
            {compatible ? "Clé API (facultative)" : `Clé API ${name}`}
          </Label>
          <Input
            id="ai-api-key"
            type="password"
            value={apiKey}
            disabled={disabled || environment}
            onChange={(event) => {
              setApiKey(event.target.value);
              setSaved("");
            }}
            placeholder={
              connection?.source
                ? "Clé configurée"
                : compatible
                  ? "Facultative"
                  : provider === "anthropic"
                    ? "sk-ant-…"
                    : "sk-…"
            }
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">{keyHint}</p>
        </div>
        {(error || failure) && (
          <p role="alert" className="text-xs text-destructive">
            {failure || error}
          </p>
        )}
        {saved && (
          <p role="status" className="text-xs text-profit">
            {saved}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={
              disabled ||
              !model.trim() ||
              (compatible ? !baseUrl.trim() : !apiKey.trim() && !connection?.configured)
            }
            onClick={() => save()}
          >
            {busy ? "Enregistrement…" : "Enregistrer les paramètres de l’IA"}
          </Button>
          {connection?.source === "saved" && (
            <Button variant="outline" disabled={disabled} onClick={() => save(true)}>
              Supprimer la clé {name}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
