export type PlanDirection = "long" | "short";

export interface TradePlanInput {
  direction: PlanDirection;
  entry: number;
  stop: number;
  /** Optional profit target price. */
  target?: number | null;
  /** Account balance in the account currency. */
  balance: number;
  /** Percentage of the balance risked on this trade (e.g. 1 for 1 %). */
  riskPercent: number;
  /** Units per 1.00 lot (forex 100000, XAUUSD 100, crypto CFD 1, ...). */
  contractSize: number;
}

export interface TradePlanResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stopDistance: number;
  targetDistance: number | null;
  rewardRisk: number | null;
  /** Amount you intend to risk (balance x risk %). */
  riskAmount: number;
  /** Lot size rounded DOWN to the lot step, so the real risk never exceeds the plan. */
  lots: number;
  units: number;
  /** Real risk with the rounded lot size. */
  actualRiskAmount: number;
  actualRiskPercent: number;
  potentialReward: number | null;
}

/** Hard cap: the calculator refuses any plan that risks more than this share of the balance. */
export const MAX_RISK_PERCENT = 2;
/** Plans below this reward:risk ratio get a warning. */
export const MIN_REWARD_RISK = 1.5;
/** Risk above this share of the balance gets a warning (but is still allowed up to the cap). */
export const COMFORT_RISK_PERCENT = 1;
export const LOT_STEP = 0.01;

const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const EMPTY: TradePlanResult = {
  ok: false,
  errors: [],
  warnings: [],
  stopDistance: 0,
  targetDistance: null,
  rewardRisk: null,
  riskAmount: 0,
  lots: 0,
  units: 0,
  actualRiskAmount: 0,
  actualRiskPercent: 0,
  potentialReward: null,
};

/**
 * Risk gate for a trade plan. A plan is only valid with a stop on the correct side of the
 * entry and a risk share within the hard cap. Lot size is always rounded DOWN, so the real
 * risk can never exceed what was planned.
 *
 * Amounts assume the instrument is quoted in the account currency (EURUSD, XAUUSD, BTCUSD on
 * a USD account). For other quote currencies the result is an approximation: check the pip
 * value in your trading platform before sending the order.
 */
export function computeTradePlan(input: TradePlanInput): TradePlanResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { direction, entry, stop, target, balance, riskPercent, contractSize } = input;

  if (direction !== "long" && direction !== "short")
    errors.push("La direction doit être achat ou vente.");
  if (!positive(entry)) errors.push("Le prix d'entrée est invalide.");
  if (!(typeof stop === "number" && Number.isFinite(stop) && stop > 0))
    errors.push("Le stop-loss est obligatoire : aucun plan sans stop.");
  if (!positive(balance)) errors.push("Le solde du compte est invalide.");
  if (!positive(riskPercent)) errors.push("Le risque en % doit être supérieur à 0.");
  if (!positive(contractSize)) errors.push("La taille du contrat est invalide.");
  if (errors.length > 0) return { ...EMPTY, errors };

  if (riskPercent > MAX_RISK_PERCENT)
    errors.push(
      `Risque refusé : ${riskPercent} % dépasse le maximum de ${MAX_RISK_PERCENT} % par trade.`,
    );

  const long = direction === "long";
  if (stop === entry) errors.push("Le stop ne peut pas être égal au prix d'entrée.");
  else if (long ? stop > entry : stop < entry)
    errors.push(
      long
        ? "Pour un achat, le stop doit être sous le prix d'entrée."
        : "Pour une vente, le stop doit être au-dessus du prix d'entrée.",
    );
  const hasTarget = target !== null && target !== undefined;
  if (hasTarget) {
    if (!positive(target)) errors.push("L'objectif est invalide.");
    else if (long ? target <= entry : target >= entry)
      errors.push(
        long
          ? "Pour un achat, l'objectif doit être au-dessus du prix d'entrée."
          : "Pour une vente, l'objectif doit être sous le prix d'entrée.",
      );
  }
  if (errors.length > 0) return { ...EMPTY, errors };

  const stopDistance = Math.abs(entry - stop);
  const targetDistance = hasTarget ? Math.abs((target as number) - entry) : null;
  const rewardRisk = targetDistance === null ? null : targetDistance / stopDistance;
  const riskAmount = (balance * riskPercent) / 100;

  const rawLots = riskAmount / stopDistance / contractSize;
  const steps = Math.floor(rawLots / LOT_STEP + 1e-9);
  const lots = Number((steps * LOT_STEP).toFixed(2));
  if (lots < LOT_STEP)
    return {
      ...EMPTY,
      stopDistance,
      targetDistance,
      rewardRisk,
      riskAmount,
      errors: [
        `Solde trop petit pour ce stop : même le lot minimum (${LOT_STEP}) risquerait plus que ${riskPercent} % (${riskAmount.toFixed(2)}). Rapprochez le stop ou réduisez le trade.`,
      ],
    };

  const units = lots * contractSize;
  const actualRiskAmount = units * stopDistance;
  const actualRiskPercent = (actualRiskAmount / balance) * 100;
  const potentialReward = targetDistance === null ? null : units * targetDistance;

  if (rewardRisk !== null && rewardRisk < MIN_REWARD_RISK)
    warnings.push(
      `Rapport gain/risque de ${rewardRisk.toFixed(2)} : sous ${MIN_REWARD_RISK}, il faut gagner très souvent pour être rentable.`,
    );
  if (rewardRisk === null)
    warnings.push("Pas d'objectif : le rapport gain/risque ne peut pas être évalué.");
  if (riskPercent > COMFORT_RISK_PERCENT)
    warnings.push(
      `Risque de ${riskPercent} % : au-dessus du seuil de confort de ${COMFORT_RISK_PERCENT} %.`,
    );

  return {
    ok: true,
    errors,
    warnings,
    stopDistance,
    targetDistance,
    rewardRisk,
    riskAmount,
    lots,
    units,
    actualRiskAmount,
    actualRiskPercent,
    potentialReward,
  };
}
