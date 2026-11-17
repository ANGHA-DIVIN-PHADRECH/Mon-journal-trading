import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { CurrencyScope } from "@/lib/currencies";
import { Button } from "@/components/ui/button";

export function CurrencyNotice({ scope }: { scope: CurrencyScope }) {
  if (scope.converted)
    return (
      <p className="px-4 py-2 text-xs text-muted-foreground">
        Résultat de trading en {scope.currency} · taux de conversion de référence enregistrés.{" "}
        <Link className="underline" href="/settings#currency-conversion">
          Modifier les taux
        </Link>
      </p>
    );
  if (scope.monetary && !scope.missingCurrencies.length) return null;
  return (
    <div
      role="status"
      className="mx-4 my-3 flex flex-col gap-4 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30 lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="flex items-start gap-3">
        <TriangleAlert
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
        />
        <div className="space-y-1">
          <p className="font-semibold text-amber-950 dark:text-amber-100">
            Configurez la conversion pour afficher le tableau de bord consolidé
          </p>
          <p className="text-sm text-amber-900 dark:text-amber-200">
            {scope.missingCurrencies.length
              ? `Enregistrez les taux de conversion pour ${scope.missingCurrencies.join(", ")} afin d’utiliser la devise de référence. Les montants ci-dessous restent dans leur devise d’origine.`
              : `Ces comptes utilisent les devises ${scope.sourceCurrencies.join(", ")}. Définissez vos taux de conversion pour regrouper leurs résultats.`}
          </p>
        </div>
      </div>
      <Button asChild className="shrink-0 self-start lg:self-auto">
        <Link href="/settings#currency-conversion">Configurer la conversion des devises</Link>
      </Button>
    </div>
  );
}
