import type { Resolution } from "./market-data";

export interface CredentialField {
  key: string;
  label: string;
  environmentKey: string;
  options?: { value: string; label: string }[];
  defaultValue?: string;
}
export interface ProviderInfo {
  id: string;
  name: string;
  mode: "credentials" | "public" | "csv";
  description: string;
  symbolHint: string;
  fields: CredentialField[];
  datasets?: { value: string; label: string }[];
  resolutions?: Resolution[];
}
export const MARKET_PROVIDERS: ProviderInfo[] = [
  {
    id: "london-strategic-edge",
    name: "London Strategic Edge",
    mode: "credentials",
    description:
      "Chandeliers historiques. Les cours des actions et ETF sont ajustés des divisions ; la couverture dépend de votre offre.",
    symbolHint:
      "Utilisez exactement le symbole du fournisseur, y compris le contrat à terme ou la paire de devises.",
    fields: [{ key: "apiKey", label: "Clé API", environmentKey: "LSE_API_KEY" }],
  },
  {
    id: "alpaca",
    name: "Alpaca",
    mode: "credentials",
    description:
      "Actions américaines et cryptomonnaies. Choisissez un flux d’actions ou de cryptomonnaies ; le flux SIP nécessite un accès aux données approprié. Les cours des actions ne sont pas ajustés.",
    symbolHint: "Actions : AAPL. Crypto : BTC/USD ; choisissez le jeu de données Crypto.",
    fields: [
      { key: "apiKey", label: "Identifiant de clé", environmentKey: "ALPACA_API_KEY" },
      { key: "secretKey", label: "Clé secrète", environmentKey: "ALPACA_SECRET_KEY" },
    ],
    datasets: [
      { value: "", label: "Choisissez un flux de données" },
      { value: "iex", label: "Actions IEX" },
      { value: "sip", label: "Actions SIP" },
      { value: "crypto", label: "Crypto (États-Unis)" },
    ],
  },
  {
    id: "binance",
    name: "Binance",
    mode: "public",
    description:
      "Chandeliers spot publics de Binance. Aucune clé API requise. La disponibilité dépend de votre région et de la paire cotée.",
    symbolHint:
      "Les paires spot utilisent BTCUSDT ou ETHUSDT. USDT n’est pas USD ; la devise du compte et la devise de cotation doivent correspondre pour les estimations.",
    fields: [],
  },
  {
    id: "coinbase",
    name: "Coinbase",
    mode: "public",
    description:
      "Chandeliers spot publics de Coinbase Exchange. Aucune clé API requise ; les intervalles sans transaction peuvent ne contenir aucun chandelier.",
    symbolHint: "Utilisez un produit Coinbase Exchange tel que BTC-USD ou ETH-USD.",
    fields: [],
  },
  {
    id: "oanda",
    name: "OANDA",
    mode: "credentials",
    description:
      "Chandeliers Forex et CFD de votre compte v20. Cours moyens, bougies alignées sur UTC et volume en nombre de ticks ; le spread et la conversion de devises ne sont pas inclus.",
    symbolHint:
      "Utilisez un instrument OANDA tel que EUR_USD. Réglez le multiplicateur de contrat dans les paramètres pour qu’il corresponde aux unités de vos exécutions.",
    fields: [
      { key: "apiKey", label: "Jeton d’accès", environmentKey: "OANDA_API_TOKEN" },
      { key: "accountId", label: "Identifiant du compte v20", environmentKey: "OANDA_ACCOUNT_ID" },
      {
        key: "environment",
        label: "Environnement",
        environmentKey: "OANDA_ENVIRONMENT",
        defaultValue: "practice",
        options: [
          { value: "practice", label: "Démo" },
          { value: "live", label: "Réel" },
        ],
      },
    ],
  },
  {
    id: "market-csv",
    name: "CSV de données de marché",
    mode: "csv",
    description:
      "Fichiers locaux de chandeliers OHLCV. Importez les cours du marché séparément des exécutions de vos trades.",
    symbolHint:
      "Utilisez exactement le symbole et la granularité indiqués dans le fichier importé. Sélectionnez un jeu de données lorsque les fichiers se chevauchent.",
    fields: [],
  },
];
export const providerInfo = (id: string) => MARKET_PROVIDERS.find((item) => item.id === id);
