import { RESOLUTIONS, type ExcursionEstimate, type MarketHistory } from "./market-data";

interface Fill {
  side: "buy" | "sell";
  quantity: number;
  price: number;
  executedAt: string;
}
interface Trade {
  direction: string;
  openedAt: string;
  closedAt?: string | null;
  assetClass?: string | null;
  contractMultiplier?: number | null;
}

/** Gross position-equity excursions: realized cash flows + value of the remaining position.
 * Uses complete candles only while the position is constant; never invents an intrabar path.
 * Fees and FX conversion are excluded. Fill facts are not modified or persisted.
 */
export function estimateExcursions(
  trade: Trade,
  fills: Fill[],
  history: MarketHistory,
  basisConfirmed: boolean,
): ExcursionEstimate {
  const warnings: string[] = [];
  const empty = (reason: string): ExcursionEstimate => ({
    mae: null,
    mfe: null,
    sampledBars: 0,
    excludedBars: 0,
    warnings: [reason],
  });
  const candleDuration = RESOLUTIONS[history.resolution];
  // A coarse sanity check, not proof that currencies, contracts or adjustments match.
  // Reject a conspicuous mismatch even if the user checked the confirmation box.
  for (const fill of fills) {
    const time = Date.parse(fill.executedAt);
    let lo = 0,
      hi = history.bars.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (history.bars[mid]!.time <= time) lo = mid + 1;
      else hi = mid;
    }
    const candidate = history.bars[lo - 1];
    const bar = candidate && candidate.time + candleDuration > time ? candidate : undefined;
    if (!bar || !Number.isFinite(fill.price)) continue;
    const distance = Math.max(bar.low - fill.price, fill.price - bar.high, 0);
    if (distance > 0.2 * Math.max(Math.abs(bar.close), Math.abs(fill.price), 1e-9)) {
      return {
        ...empty(
          "Les prix des exécutions enregistrées diffèrent de plus de 20 % des chandeliers de marché correspondants. Vérifiez les trades de démonstration, l’instrument, la devise de cotation ou la base d’ajustement des prix. Les estimations MAE/MFE et les libellés des exécutions sont indisponibles tant que les prix ne sont pas rapprochés.",
        ),
        priceBasisMismatch: true,
      };
    }
  }
  if (!basisConfirmed)
    return empty(
      "Confirmez que l’instrument du fournisseur, la base de prix et la devise de cotation correspondent à vos exécutions et à la devise du compte pour calculer les estimations.",
    );
  if (!trade.closedAt)
    return empty("Les estimations sont disponibles uniquement pour les trades clôturés.");
  if (history.truncated)
    return empty(
      "L’historique est tronqué. Chargez une granularité plus large pour obtenir des estimations.",
    );
  const multiplier =
    trade.contractMultiplier ?? (["equity", "crypto"].includes(trade.assetClass ?? "") ? 1 : null);
  if (multiplier === null || !Number.isFinite(multiplier) || multiplier <= 0)
    return empty(
      "Définissez le multiplicateur de contrat de ce symbole dans les paramètres avant de calculer les estimations monétaires.",
    );
  const open = Date.parse(trade.openedAt),
    close = Date.parse(trade.closedAt);
  const step = RESOLUTIONS[history.resolution];
  const sorted = fills
    .map((fill) => ({ ...fill, time: Date.parse(fill.executedAt) }))
    .sort((a, b) => a.time - b.time);
  if (
    !Number.isFinite(open) ||
    !Number.isFinite(close) ||
    close <= open ||
    sorted.length < 2 ||
    sorted.some(
      (f) =>
        !Number.isFinite(f.time) ||
        !Number.isFinite(f.price) ||
        !Number.isFinite(f.quantity) ||
        f.quantity <= 0 ||
        f.time < open ||
        f.time > close,
    ) ||
    sorted[0]!.time !== open ||
    sorted.at(-1)!.time !== close
  )
    return empty(
      "Les horodatages ou quantités des exécutions ne décrivent pas un cycle de position complet.",
    );
  const bars = history.bars.filter((bar) => bar.time < close && bar.time + step > open);
  if (!bars.length || bars[0]!.time > open || bars.at(-1)!.time + step < close)
    return empty(
      "L’historique de marché ne couvre ni l’entrée ni la sortie. Les estimations sont indisponibles.",
    );
  if (bars.some((bar, index) => index > 0 && bar.time - bars[index - 1]!.time > step))
    warnings.push(
      "L’historique comporte des lacunes, qui peuvent correspondre à des séances fermées ou à des données manquantes. Les estimations utilisent uniquement les chandeliers disponibles.",
    );
  let position = 0,
    cash = 0,
    minimum = 0,
    maximum = 0,
    index = 0,
    sampledBars = 0,
    excludedBars = 0;
  const direction = trade.direction === "long" ? 1 : -1;
  const epsilon = sorted.reduce((largest, fill) => Math.max(largest, fill.quantity), 1) * 1e-8;
  const mark = (price: number) => {
    const value = (cash + position * price) * multiplier;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  };
  const apply = (fill: (typeof sorted)[number]) => {
    mark(fill.price);
    const quantity = fill.side === "buy" ? fill.quantity : -fill.quantity;
    cash -= quantity * fill.price;
    position += quantity;
    mark(fill.price);
    return position * direction >= -epsilon;
  };
  for (const bar of bars) {
    while (index < sorted.length && sorted[index]!.time <= bar.time) {
      if (!apply(sorted[index++]!))
        return empty(
          "Une exécution qui inverse la position couvre plusieurs trades. Les estimations d’excursion sont indisponibles pour ce cycle.",
        );
    }
    const nextFill = sorted[index]?.time ?? Infinity;
    if (
      bar.time < open ||
      bar.time + step > close ||
      nextFill < bar.time + step ||
      Math.abs(position) <= epsilon
    ) {
      excludedBars++;
      continue;
    }
    mark(bar.high);
    mark(bar.low);
    sampledBars++;
  }
  while (index < sorted.length)
    if (!apply(sorted[index++]!))
      return empty(
        "Une exécution qui inverse la position couvre plusieurs trades. Les estimations d’excursion sont indisponibles pour ce cycle.",
      );
  if (Math.abs(position) > epsilon)
    return empty(
      "Les exécutions enregistrées ne clôturent pas cette position. Les estimations sont indisponibles.",
    );
  if (!sampledBars)
    return empty(
      "Aucun chandelier complet ne se trouve entre les exécutions. Choisissez une granularité plus fine ; les prix d’exécution seuls ne permettent pas d’estimer les excursions.",
    );
  if (excludedBars)
    warnings.push(
      `${excludedBars} chandeliers chevauchent une exécution ou une limite du trade et ont été exclus ; les excursions peuvent être sous-estimées.`,
    );
  warnings.push(
    "Estimation brute du résultat de la position, incluant les sorties partielles réalisées et l’exposition restante. Les frais et la conversion de devises sont exclus ; l’ordre des plus hauts et plus bas au sein d’un chandelier est inconnu.",
  );
  if (![minimum, maximum].every(Number.isFinite))
    return empty("Les valeurs de la position dépassent la plage numérique prise en charge.");
  return { mae: Math.abs(minimum), mfe: maximum, sampledBars, excludedBars, warnings };
}
