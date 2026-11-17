"use client";
import { OptionSelect } from "@/components/ui/option-select";
import { Checkbox } from "@/components/ui/checkbox";

import { Suspense, useState } from "react";
import { FilterBar } from "@/components/filter-bar";
import { Field, fieldClass } from "@/components/filter-fields";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichEditor, Markdown } from "@/components/rich-editor";
import { Attachments } from "@/components/attachments";
import { ReviewExport } from "@/components/review-export";
import { MonetaryValue, MonetaryField } from "@/components/privacy";
import { useApi, postJson } from "@/lib/use-api";
interface Missed {
  id: string;
  symbol: string;
  direction: string;
  observedAt: string;
  entry: number | null;
  stop: number | null;
  target: number | null;
  playbookId: string | null;
  notes: string;
  archivedAt: string | null;
}
const blank = () => ({
  symbol: "",
  direction: "long",
  observedAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16),
  entry: "",
  stop: "",
  target: "",
  playbookId: "",
  notes: "",
});
export default function MissedPage() {
  return (
    <Suspense>
      <Missed />
    </Suspense>
  );
}
function Missed() {
  const { data, error, refresh } = useApi<{ trades: Missed[] }>("/api/workspace/missed"),
    { data: books } = useApi<{ playbooks: { id: string; name: string }[] }>("/api/playbooks");
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState(blank),
    [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false);
  function edit(t?: Missed) {
    setEditing(t?.id ?? null);
    setDraft(
      t
        ? {
            symbol: t.symbol,
            direction: t.direction,
            observedAt: new Date(
              Date.parse(t.observedAt) - new Date(t.observedAt).getTimezoneOffset() * 60000,
            )
              .toISOString()
              .slice(0, 16),
            entry: t.entry?.toString() ?? "",
            stop: t.stop?.toString() ?? "",
            target: t.target?.toString() ?? "",
            playbookId: t.playbookId ?? "",
            notes: t.notes,
          }
        : blank(),
    );
    setFailure("");
    setOpen(true);
  }
  const rows =
    data?.trades.filter(
      (t) =>
        Boolean(t.archivedAt) === archived &&
        `${t.symbol} ${t.notes}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  const formField = (
    key: "symbol" | "observedAt" | "entry" | "stop" | "target",
    label: string,
    type = "text",
  ) => (
    <Field label={label}>
      <MonetaryField sensitive={type === "number"}>
        <input
          className={fieldClass}
          type={type}
          step={type === "number" ? "any" : undefined}
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      </MonetaryField>
    </Field>
  );
  return (
    <div>
      <FilterBar
        title="Occasions manquées"
        actions={
          <Button size="sm" onClick={() => edit()}>
            Consigner une occasion
          </Button>
        }
      />
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          Notez les configurations que vous avez observées sans les prendre. Ces observations ne
          sont jamais incluses dans le nombre de trades, le résultat ni le taux de réussite.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <input
            aria-label="Rechercher parmi les occasions manquées"
            className={`${fieldClass} max-w-sm`}
            placeholder="Rechercher un symbole ou dans les notes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={archived}
              onCheckedChange={(checked) => setArchived(checked === true)}
            />
            Afficher les éléments archivés
          </label>
        </div>
        {(error || failure) && (
          <p role="alert" className="text-sm text-destructive">
            {error || failure}
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((t) => (
            <Card key={t.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>
                    {t.symbol} · {t.direction}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => edit(t)}>
                      Modifier
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await postJson(
                            "/api/workspace/missed",
                            { id: t.id, restore: !!t.archivedAt },
                            "DELETE",
                          );
                          refresh();
                        } catch (e) {
                          setFailure(String(e));
                        }
                      }}
                    >
                      {t.archivedAt ? "Restaurer" : "Archiver"}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(t.observedAt).toLocaleString()} ·{" "}
                  {books?.playbooks.find((b) => b.id === t.playbookId)?.name ?? "Aucune stratégie"}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-5 text-sm">
                  {[
                    ["Entrée", t.entry],
                    ["Stop", t.stop],
                    ["Objectif", t.target],
                  ].map(([label, value]) => (
                    <span key={label}>
                      <span className="text-muted-foreground">{label}: </span>
                      <MonetaryValue>{value ?? "-"}</MonetaryValue>
                    </span>
                  ))}
                </div>
                <Markdown>{t.notes || "Aucune analyse pour le moment."}</Markdown>
                <ReviewExport
                  containsFinancialData
                  document={{
                    title: `Occasion manquée · ${t.symbol}`,
                    subtitle: `${t.direction} · ${t.observedAt}`,
                    lines: [
                      "Observation uniquement : aucun trade exécuté ni résultat réel.",
                      `Entrée prévue : ${t.entry ?? "-"} | Stop : ${t.stop ?? "-"} | Objectif : ${t.target ?? "-"}`,
                      "",
                      t.notes,
                    ],
                  }}
                />
                <Attachments type="missed" id={t.id} />
              </CardContent>
            </Card>
          ))}
        </div>
        {data && !rows.length && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Aucune occasion {archived ? "archivée " : ""}pour le moment.
          </p>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Modifier l’occasion" : "Consigner une occasion manquée"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {formField("symbol", "Symbole")}
              <Field label="Direction">
                <OptionSelect
                  className={fieldClass}
                  value={draft.direction}
                  onValueChange={(next) => setDraft({ ...draft, direction: next })}
                >
                  <option value="long">Achat</option>
                  <option value="short">Vente</option>
                </OptionSelect>
              </Field>
              {formField("observedAt", "Observée le (heure de l’appareil)", "datetime-local")}
              <Field label="Stratégie">
                <OptionSelect
                  className={fieldClass}
                  value={draft.playbookId}
                  onValueChange={(next) => setDraft({ ...draft, playbookId: next })}
                >
                  <option value="">Aucune stratégie</option>
                  {books?.playbooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </OptionSelect>
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {formField("entry", "Entrée prévue", "number")}
              {formField("stop", "Stop prévu", "number")}
              {formField("target", "Objectif prévu", "number")}
            </div>
            <RichEditor
              defaultMode="edit"
              value={draft.notes}
              onChange={(notes) => setDraft({ ...draft, notes })}
              placeholder="Pourquoi avez-vous manqué cette occasion ? Que ferez-vous différemment ?"
            />
            {failure && (
              <p role="alert" className="text-xs text-destructive">
                {failure}
              </p>
            )}
            <Button
              disabled={busy || !draft.symbol.trim() || !draft.observedAt}
              onClick={async () => {
                setBusy(true);
                try {
                  await postJson("/api/workspace/missed", {
                    ...draft,
                    id: editing,
                    observedAt: new Date(draft.observedAt).toISOString(),
                    entry: draft.entry === "" ? null : Number(draft.entry),
                    stop: draft.stop === "" ? null : Number(draft.stop),
                    target: draft.target === "" ? null : Number(draft.target),
                  });
                  setOpen(false);
                  refresh();
                  setFailure("");
                } catch (e) {
                  setFailure(e instanceof Error ? e.message : "Impossible d’enregistrer.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Enregistrer l’occasion
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
