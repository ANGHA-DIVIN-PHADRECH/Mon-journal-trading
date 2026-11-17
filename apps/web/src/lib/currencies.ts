/** Offline currency catalogue; existing account codes remain selectable. */
const names = new Intl.DisplayNames("fr-FR", { type: "currency" });
export const currencyCodes = Intl.supportedValuesOf("currency");
export const currencyName = (code: string): string => `${code} — ${names.of(code) ?? code}`;
export const isCurrencyCode = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Z]{3}$/.test(value);

export interface CurrencyConversion {
  enabled: boolean;
  reportingCurrency: string;
  /** Reporting-currency units per ONE unit of the source currency. */
  rates: Record<string, number>;
}

export const DEFAULT_CONVERSION: CurrencyConversion = {
  enabled: false,
  reportingCurrency: "USD",
  rates: {},
};

export function parseCurrencyConversion(value: unknown): CurrencyConversion {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Saisissez des paramètres de conversion de devises valides.");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => !["enabled", "reportingCurrency", "rates"].includes(key)) ||
    typeof input.enabled !== "boolean" ||
    !isCurrencyCode(input.reportingCurrency) ||
    !input.rates ||
    typeof input.rates !== "object" ||
    Array.isArray(input.rates)
  )
    throw new Error(
      "Choisissez une devise de référence et saisissez des taux de conversion valides.",
    );
  const rates: Record<string, number> = {};
  for (const [currency, rate] of Object.entries(input.rates)) {
    if (
      !isCurrencyCode(currency) ||
      typeof rate !== "number" ||
      !Number.isFinite(rate) ||
      rate <= 0
    )
      throw new Error("Les taux de conversion doivent être des nombres finis et positifs.");
    if (currency === input.reportingCurrency && rate !== 1)
      throw new Error("Le taux de la devise de référence doit toujours être égal à 1.");
    rates[currency] = rate;
  }
  return { enabled: input.enabled, reportingCurrency: input.reportingCurrency, rates };
}

export interface CurrencyScope {
  currency: string | null;
  sourceCurrencies: string[];
  converted: boolean;
  monetary: boolean;
  missingCurrencies: string[];
}
