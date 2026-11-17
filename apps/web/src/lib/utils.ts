import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const currencyFormatters = new Map<string, Intl.NumberFormat>();

/** Signed money — the sign is ALWAYS in the text; color never carries P&L alone. */
export const fmtMoney = (value: number, currency = "USD"): string => {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      signDisplay: "exceptZero",
    });
    currencyFormatters.set(currency, formatter);
  }
  return formatter.format(value);
};

const numberFormatters = new Map<number, Intl.NumberFormat>();
export const fmtNumber = (value: number, digits = 2): string => {
  let formatter = numberFormatters.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits });
    numberFormatters.set(digits, formatter);
  }
  return formatter.format(value);
};

const percentFormatters = new Map<number, Intl.NumberFormat>();
export const fmtPercent = (value: number | null, digits = 1): string => {
  if (value === null) return "–";
  let formatter = percentFormatters.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("fr-FR", {
      style: "percent",
      maximumFractionDigits: digits,
    });
    percentFormatters.set(digits, formatter);
  }
  return formatter.format(value);
};

export const fmtDuration = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined) return "–";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min`;
  const days = Math.floor(hours / 24);
  return `${days} j ${hours % 24} h`;
};

export const pnlClass = (value: number): string =>
  value > 0 ? "text-profit" : value < 0 ? "text-loss" : "text-muted-foreground";
