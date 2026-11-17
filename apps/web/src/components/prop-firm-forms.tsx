"use client";
import { useState, type ReactNode } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { OptionSelect } from "./ui/option-select";
import { DatePicker } from "./ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Field, fieldClass } from "./filter-fields";
import { Attachments } from "./attachments";
import { useApi, postJson } from "@/lib/use-api";
import { decodeImportFile } from "@/lib/decode-import";
import {
  fromMinor,
  label,
  PROP_PROGRAMS,
  PROP_STATES,
  PAYOUT_STATES,
  EXPENSE_CATEGORIES,
  type PropAccount,
  type PropEntry,
  type PropData,
  type PropAudit,
} from "@/lib/prop-firms";
export type PropModal =
  | { kind: "account"; account?: PropAccount; parent?: PropAccount }
  | {
      kind: "entry";
      entry?: PropEntry;
      type: PropEntry["kind"];
      accountId?: string;
      category?: string;
      expense?: PropEntry;
    }
  | { kind: "receipt"; payout: PropEntry }
  | { kind: "detail"; type: "account" | "entry"; id: string }
  | {
      kind: "change";
      action: string;
      id: string;
      revision: number;
      payoutId?: string;
      value: boolean;
      name: string;
    }
  | { kind: "import" };
type Props = { modal: PropModal; data: PropData; close: () => void; refresh: () => void };
export function PropFirmModal(props: Props) {
  const { modal, close } = props;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-w-2xl">
        {modal.kind === "account" ? (
          <AccountForm {...props} modal={modal} />
        ) : modal.kind === "entry" ? (
          <EntryForm {...props} modal={modal} />
        ) : modal.kind === "receipt" ? (
          <ReceiptForm {...props} modal={modal} />
        ) : modal.kind === "change" ? (
          <ChangeForm {...props} modal={modal} />
        ) : modal.kind === "import" ? (
          <ImportForm {...props} />
        ) : (
          <Detail {...props} modal={modal} />
        )}
      </DialogContent>
    </Dialog>
  );
}
function useSave(close: () => void, refresh: () => void) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const save = async (body: unknown) => {
    setBusy(true);
    setError("");
    try {
      await postJson("/api/prop-firms", body);
      refresh();
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, save };
}
function Form({
  title,
  description,
  busy,
  error,
  children,
  submit,
}: {
  title: string;
  description: string;
  busy: boolean;
  error: string;
  children: ReactNode;
  submit: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) submit();
        }}
      >
        <fieldset disabled={busy} className="space-y-4">
          {children}
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </form>
    </>
  );
}
const blankAccount = (today: string, parent?: PropAccount) => ({
  firm: parent?.firm ?? "",
  name: "",
  program: "evaluation",
  status: "active",
  currency: parent?.currency ?? "",
  size: parent?.sizeMinor == null ? "" : fromMinor(parent.sizeMinor, parent.currency),
  parentId: parent?.id ?? "",
  journalAccountId: "",
  openedOn: today,
  closedOn: "",
  renewalOn: "",
  renewalAmount: "",
  notes: "",
  reason: "",
});
function AccountForm({
  modal,
  data,
  close,
  refresh,
}: Props & { modal: Extract<PropModal, { kind: "account" }> }) {
  const old = modal.account;
  const [id] = useState(() => old?.id ?? crypto.randomUUID());
  const [values, set] = useState(() =>
    old
      ? {
          firm: old.firm,
          name: old.name,
          program: old.program,
          status: old.status,
          currency: old.currency,
          size: old.sizeMinor == null ? "" : fromMinor(old.sizeMinor, old.currency),
          parentId: old.parentId ?? "",
          journalAccountId: old.journalAccountId ?? "",
          openedOn: old.openedOn,
          closedOn: old.closedOn ?? "",
          renewalOn: old.renewalOn ?? "",
          renewalAmount: old.renewalMinor == null ? "" : fromMinor(old.renewalMinor, old.currency),
          notes: old.notes,
          reason: "",
        }
      : blankAccount(data.today, modal.parent),
  );
  const { data: journal } = useApi<{ accounts: { id: string; name: string }[] }>(
    "/api/accounts?summary=1",
  );
  const { busy, error, save } = useSave(close, refresh);
  const input = (key: keyof typeof values, title: string, required = false) => (
    <Field label={title}>
      <Input
        value={values[key]}
        required={required}
        onChange={(e) =>
          set({
            ...values,
            [key]: key === "currency" ? e.target.value.toUpperCase() : e.target.value,
          })
        }
      />
    </Field>
  );
  return (
    <Form
      title={
        old
          ? "Modifier le compte de trading propriétaire"
          : modal.parent
            ? "Suivre la tentative ou la phase suivante"
            : "Suivre un compte de trading propriétaire"
      }
      description="Enregistrez séparément chaque évaluation, tentative après réinitialisation et phase financée. La taille du compte est un capital nominal, pas une somme dépensée."
      busy={busy}
      error={error}
      submit={() =>
        void save({ action: "account.save", id, revision: old?.revision ?? 0, ...values })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {input("firm", "Nom de la société", true)}
        {input("name", "Nom du compte / de la tentative", true)}
        <Field label="Programme">
          <OptionSelect
            value={values.program}
            onValueChange={(program) => set({ ...values, program })}
          >
            {PROP_PROGRAMS.map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </OptionSelect>
        </Field>
        <Field label="Statut">
          <OptionSelect
            value={values.status}
            onValueChange={(status) =>
              set({
                ...values,
                status,
                closedOn: status === "active" ? "" : values.closedOn || data.today,
                renewalOn: status === "active" ? values.renewalOn : "",
              })
            }
          >
            {PROP_STATES.map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </OptionSelect>
        </Field>
        {input("currency", "Code de devise", true)}
        {input("size", "Taille nominale du compte (facultatif)")}
        <Field label="Date d’ouverture">
          <DatePicker
            label="Date d’ouverture du compte propriétaire"
            value={values.openedOn}
            max={data.today}
            onValueChange={(openedOn) => set({ ...values, openedOn })}
          />
        </Field>
        {values.status !== "active" && (
          <Field label="Date de clôture">
            <DatePicker
              label="Date de clôture du compte propriétaire"
              value={values.closedOn}
              max={data.today}
              onValueChange={(closedOn) => set({ ...values, closedOn })}
            />
          </Field>
        )}
        <Field label="Tentative / phase précédente">
          <OptionSelect
            value={values.parentId}
            onValueChange={(parentId) => set({ ...values, parentId })}
          >
            <option value="">Aucune</option>
            {data.accounts
              .filter(
                (a) =>
                  a.id !== id &&
                  a.firm.toLowerCase() === values.firm.trim().toLowerCase() &&
                  a.currency === values.currency,
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </OptionSelect>
        </Field>
        <Field label="Lier un compte du journal (facultatif)">
          <OptionSelect
            value={values.journalAccountId}
            onValueChange={(journalAccountId) => set({ ...values, journalAccountId })}
          >
            <option value="">Aucun lien vers le journal</option>
            {journal?.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </OptionSelect>
        </Field>
      </div>
      <details>
        <summary className="cursor-pointer text-sm">Rappel de renouvellement</summary>
        <p className="my-2 text-xs text-muted-foreground">
          Il s’agit d’un simple rappel. Enregistrez une dépense lorsqu’elle est débitée ; aucun
          montant ne sera prélevé ni ajouté automatiquement.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prochain renouvellement">
            <DatePicker
              label="Date du prochain renouvellement"
              value={values.renewalOn}
              onValueChange={(renewalOn) => set({ ...values, renewalOn })}
            />
          </Field>
          {input("renewalAmount", "Montant prévu du renouvellement")}
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => set({ ...values, renewalOn: "", renewalAmount: "" })}
        >
          Effacer le rappel
        </Button>
      </details>
      <Field label="Notes / règles / motif de violation">
        <textarea
          className={`${fieldClass} h-24 py-2`}
          value={values.notes}
          onChange={(e) => set({ ...values, notes: e.target.value })}
        />
      </Field>
      {old && input("reason", "Motif de la modification", true)}
    </Form>
  );
}
function EntryForm({
  modal,
  data,
  close,
  refresh,
}: Props & { modal: Extract<PropModal, { kind: "entry" }> }) {
  const old = modal.entry,
    expense = modal.expense;
  const [id] = useState(() => old?.id ?? crypto.randomUUID());
  const initialAccount = data.accounts.find(
    (a) => a.id === (old?.accountId ?? expense?.accountId ?? modal.accountId),
  );
  const [values, set] = useState({
    accountId: old?.accountId ?? expense?.accountId ?? initialAccount?.id ?? "",
    firm: old?.firm ?? expense?.firm ?? initialAccount?.firm ?? "",
    currency: old?.currency ?? expense?.currency ?? initialAccount?.currency ?? "",
    category: old?.category ?? modal.category ?? "evaluation",
    amount: old ? fromMinor(old.amountMinor, old.currency) : "",
    splitPercent: old ? (old.splitBps / 100).toFixed(2) : "",
    fee: old ? fromMinor(old.feeMinor, old.currency) : "0",
    occurredOn: old?.occurredOn ?? data.today,
    dueOn: old?.dueOn ?? "",
    status: old?.status ?? "requested",
    parentId: old?.parentId ?? expense?.id ?? "",
    reference: old?.reference ?? "",
    notes: old?.notes ?? "",
    reason: "",
  });
  const kind = old?.kind ?? modal.type,
    payout = kind === "payout",
    refund = kind === "refund";
  const { busy, error, save } = useSave(close, refresh);
  const input = (key: keyof typeof values, title: string, required = false, disabled = false) => (
    <Field label={title}>
      <Input
        required={required}
        disabled={disabled}
        value={values[key]}
        onChange={(e) =>
          set({
            ...values,
            [key]: key === "currency" ? e.target.value.toUpperCase() : e.target.value,
          })
        }
      />
    </Field>
  );
  return (
    <Form
      title={
        old
          ? `Modifier : ${label(kind)}`
          : payout
            ? "Enregistrer une demande de versement"
            : refund
              ? "Enregistrer un remboursement de dépense"
              : "Enregistrer une dépense de trading propriétaire"
      }
      description={
        payout
          ? "Une demande n’est pas un revenu. Enregistrez séparément les sommes réellement reçues, y compris les paiements partiels. Cette action ne demande pas de versement à votre société."
          : "Enregistrez les sommes réellement échangées. Incluez les taxes et frais dans le montant payé. Ne comptabilisez pas deux fois les commissions de trading déjà incluses ailleurs."
      }
      busy={busy}
      error={error}
      submit={() =>
        void save({ action: "entry.save", id, revision: old?.revision ?? 0, kind, ...values })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Compte de trading propriétaire">
          <OptionSelect
            disabled={Boolean(old || refund)}
            value={values.accountId}
            onValueChange={(accountId) => {
              const a = data.accounts.find((a) => a.id === accountId);
              set({ ...values, accountId, firm: a?.firm ?? "", currency: a?.currency ?? "" });
            }}
          >
            <option value="">
              {payout ? "Choisissez un compte financé" : "Dépense partagée de la société"}
            </option>
            {data.accounts
              .filter((a) => !payout || ["funded", "instant_funded", "live"].includes(a.program))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.firm} · {a.name}
                  {a.archived ? " (archived)" : ""}
                </option>
              ))}
          </OptionSelect>
        </Field>
        {input("firm", "Société", true, Boolean(values.accountId || old || refund))}
        {input("currency", "Devise", true, Boolean(values.accountId || old || refund))}
        {!payout && !refund && (
          <Field label="Catégorie de dépense">
            <OptionSelect
              value={values.category}
              onValueChange={(category) => set({ ...values, category })}
            >
              {EXPENSE_CATEGORIES.map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </OptionSelect>
          </Field>
        )}
        {input("amount", payout ? "Montant brut demandé (avant partage)" : "Montant réel", true)}
        {payout && (
          <>
            {input("splitPercent", "Votre part (%)", true)}
            {input("fee", "Frais retenus sur votre part", true)}
            <p className="col-span-full text-xs text-muted-foreground">
              Si votre montant tient déjà compte du partage de la société, saisissez 100 % et
              indiquez uniquement les frais restant à déduire. Ne déduisez jamais deux fois votre
              part.
            </p>
          </>
        )}
        <Field label={payout ? "Date de la demande" : "Date de l’opération"}>
          <DatePicker
            label={payout ? "Date de la demande de versement" : "Date de la transaction"}
            value={values.occurredOn}
            max={data.today}
            onValueChange={(occurredOn) => set({ ...values, occurredOn })}
          />
        </Field>
        {payout && (
          <>
            <Field label="Date de paiement prévue (facultatif)">
              <DatePicker
                label="Date de versement prévue"
                value={values.dueOn}
                onValueChange={(dueOn) => set({ ...values, dueOn })}
              />
            </Field>
            <Field label="Statut du versement">
              <OptionSelect
                value={values.status}
                onValueChange={(status) =>
                  set({ ...values, status: status as PropEntry["status"] })
                }
              >
                {PAYOUT_STATES.filter((s) => old || s !== "completed").map((v) => (
                  <option key={v} value={v}>
                    {label(v)}
                  </option>
                ))}
              </OptionSelect>
            </Field>
          </>
        )}
        {input("reference", "Référence de facture / paiement")}
      </div>
      <Field label="Notes">
        <textarea
          className={`${fieldClass} h-20 py-2`}
          value={values.notes}
          onChange={(e) => set({ ...values, notes: e.target.value })}
        />
      </Field>
      {refund && (
        <p className="text-xs text-muted-foreground">
          Dépense liée : {values.parentId}. Les remboursements réduisent les coûts et sont indiqués
          séparément des versements reçus.
        </p>
      )}
      {old && input("reason", "Motif de la modification", true)}
    </Form>
  );
}
function ReceiptForm({
  modal,
  data,
  close,
  refresh,
}: Props & { modal: Extract<PropModal, { kind: "receipt" }> }) {
  const { payout } = modal;
  const [id] = useState(() => crypto.randomUUID());
  const [values, set] = useState({
    kind: "receipt",
    amount: "",
    occurredOn: data.today,
    reference: "",
    notes: "",
  });
  const { busy, error, save } = useSave(close, refresh);
  return (
    <Form
      title="Enregistrer un mouvement de trésorerie lié à un versement"
      description={`Enregistrez le montant net réellement crédité ou retourné en ${payout.currency}. Si votre banque a converti les devises, utilisez le montant d’origine indiqué sur le relevé ; cet outil ne calcule pas de taux de change.`}
      busy={busy}
      error={error}
      submit={() =>
        void save({
          action: "receipt.add",
          id,
          payoutId: payout.id,
          revision: payout.revision,
          ...values,
        })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Mouvement">
          <OptionSelect value={values.kind} onValueChange={(kind) => set({ ...values, kind })}>
            <option value="receipt">Somme reçue</option>
            <option value="reversal">Somme retournée / annulée</option>
          </OptionSelect>
        </Field>
        <Field label={`Montant réel (${payout.currency})`}>
          <Input
            required
            value={values.amount}
            onChange={(e) => set({ ...values, amount: e.target.value })}
          />
        </Field>
        <Field label="Date de règlement">
          <DatePicker
            label="Date de règlement"
            value={values.occurredOn}
            max={data.today}
            onValueChange={(occurredOn) => set({ ...values, occurredOn })}
          />
        </Field>
        <Field label="Référence bancaire">
          <Input
            value={values.reference}
            onChange={(e) => set({ ...values, reference: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Notes">
        <textarea
          className={`${fieldClass} h-20 py-2`}
          value={values.notes}
          onChange={(e) => set({ ...values, notes: e.target.value })}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        Laissez la demande ouverte en cas de paiements partiels. À réception du dernier paiement,
        modifiez le statut du versement pour le marquer comme terminé ; tout écart par rapport au
        montant prévu restera visible.
      </p>
    </Form>
  );
}
function ChangeForm({
  modal,
  close,
  refresh,
}: Props & { modal: Extract<PropModal, { kind: "change" }> }) {
  const [reason, setReason] = useState("");
  const { busy, error, save } = useSave(close, refresh);
  return (
    <Form
      title={modal.name}
      description={
        modal.action === "account.archive"
          ? "L’archivage masque le compte de la liste active. Son historique de trésorerie reste inclus dans les rendements. Vous pourrez le restaurer plus tard."
          : "Les enregistrements annulés restent dans l’historique d’audit, mais sont exclus des totaux de trésorerie. Vous pouvez les restaurer. L’annulation d’un versement exclut également les sommes reçues."
      }
      busy={busy}
      error={error}
      submit={() =>
        void save({
          action: modal.action,
          id: modal.id,
          revision: modal.revision,
          payoutId: modal.payoutId,
          [modal.action === "account.archive" ? "archived" : "voided"]: modal.value,
          reason,
        })
      }
    >
      <Field label="Motif">
        <Input required value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Form>
  );
}
function Detail({ modal, data }: Props & { modal: Extract<PropModal, { kind: "detail" }> }) {
  const account = modal.type === "account" ? data.accounts.find((a) => a.id === modal.id) : null;
  const entry = modal.type === "entry" ? data.entries.find((e) => e.id === modal.id) : null;
  const { data: history } = useApi<{ history: PropAudit[] }>(
    `/api/prop-firms?type=${modal.type}&history=${encodeURIComponent(modal.id)}`,
  );
  return (
    <>
      <DialogHeader>
        <DialogTitle>{account?.name ?? `Détails : ${label(entry?.kind ?? "Entry")}`}</DialogTitle>
        <DialogDescription>
          {account?.firm ?? entry?.firm} · {modal.id}
        </DialogDescription>
      </DialogHeader>
      <p className="whitespace-pre-wrap text-sm">
        {account?.notes || entry?.notes || "Aucune note ajoutée."}
      </p>
      {account && (
        <>
          <p className="break-all text-xs text-muted-foreground">
            ID du compte pour les imports CSV : {account.id}
          </p>
          {account.parentId && (
            <p className="text-sm">
              Tentative / phase précédente :{" "}
              {data.accounts.find((a) => a.id === account.parentId)?.name ?? account.parentId}
            </p>
          )}
          {account.journalAccountId && (
            <a
              className="text-sm underline"
              href={`/trades?accounts=${encodeURIComponent(account.journalAccountId)}`}
            >
              Ouvrir les trades liés du journal
            </a>
          )}
        </>
      )}
      <Attachments type={modal.type === "account" ? "prop-account" : "prop-entry"} id={modal.id} />
      <details>
        <summary className="cursor-pointer text-sm">
          Historique des modifications · 100 dernières
        </summary>
        <div className="mt-3 space-y-3">
          {history?.history.map((item) => (
            <details key={item.id} className="rounded-md border p-2 text-xs">
              <summary className="cursor-pointer">
                {item.createdAt} ·{" "}
                {item.reason.startsWith("CSV import") ? "Import CSV" : item.reason}
              </summary>
              <p className="my-2 font-medium">Avant</p>
              <pre className="whitespace-pre-wrap break-all">
                {item.beforeJson
                  ? JSON.stringify(JSON.parse(item.beforeJson), null, 2)
                  : "Nouvel enregistrement"}
              </pre>
              <p className="my-2 font-medium">Après</p>
              <pre className="whitespace-pre-wrap break-all">
                {JSON.stringify(JSON.parse(item.afterJson), null, 2)}
              </pre>
            </details>
          ))}
        </div>
      </details>
    </>
  );
}
function ImportForm({ close, refresh }: Props) {
  const [content, setContent] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<{
      imported: number;
      skipped: number;
      sample: Record<string, string>[];
    } | null>(null);
  const act = async (action: "preview" | "import") => {
    setBusy(true);
    setError("");
    try {
      const data = await postJson<typeof result>("/api/prop-firms/csv", { action, content });
      if (action === "preview") setResult(data);
      else {
        refresh();
        close();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>Importer des flux de trésorerie CSV</DialogTitle>
        <DialogDescription>
          Importez les dépenses réglées, les remboursements et les versements nets. L’aperçu valide
          chaque ligne ; l’importation est effectuée en totalité ou pas du tout, et les identifiants
          stables déjà présents sont ignorés.
        </DialogDescription>
      </DialogHeader>
      <a className="text-sm underline" href="/prop-cash-template.csv" download>
        Télécharger le modèle d’en-tête CSV générique pour la trésorerie
      </a>
      <p className="text-xs text-muted-foreground">
        Utilisez le type expense, refund ou payout ; une date au format AAAA-MM-JJ ; un montant
        positif exprimé dans la devise. Le montant d’un versement correspond à la somme déjà reçue
        après partage et frais. Les versements nécessitent l’account_id indiqué dans les détails du
        compte. L’expense_id d’un remboursement doit référencer l’identifiant CSV de la dépense
        d’origine. Placez les dépenses avant leurs remboursements. Cet outil n’importe pas les
        relevés des courtiers.
      </p>
      <Input
        type="file"
        aria-label="Fichier CSV de trésorerie prop"
        accept=".csv,text/csv"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          setContent("");
          setResult(null);
          setError("");
          if (!file) return;
          if (file.size > 2 * 1024 * 1024) {
            setError("Le fichier CSV ne doit pas dépasser 2 Mo / 1 000 lignes.");
            return;
          }
          try {
            setContent(decodeImportFile(await file.arrayBuffer()));
          } catch {
            setError("Impossible de lire le fichier CSV.");
          }
        }}
      />
      <Button variant="outline" disabled={!content || busy} onClick={() => void act("preview")}>
        {busy ? "Validation…" : "Valider et prévisualiser"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {result && (
        <>
          <p className="text-sm">
            {result.imported} nouveaux enregistrements · {result.skipped} déjà importés.
          </p>
          <div className="space-y-2">
            {result.sample.map((row) => (
              <p key={row.id} className="rounded border p-2 text-xs">
                {row.date} · {row.firm} · {row.kind} · {row.amount} {row.currency}
              </p>
            ))}
          </div>
          <Button disabled={busy || result.imported === 0} onClick={() => void act("import")}>
            Importer {result.imported} enregistrements
          </Button>
        </>
      )}
    </>
  );
}
