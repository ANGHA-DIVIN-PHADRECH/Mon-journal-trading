import type { AiProvider } from "./ai-settings";

export const AI_IMPORT_MAX_BYTES = 8 * 1024 * 1024;
export const AI_IMPORT_MAX_TEXT = 150_000;
export const AI_IMPORT_MAX_EXECUTIONS = 200;
export const AI_IMPORT_HELP =
  "Si vous rencontrez des difficultés pour importer un fichier, l’analyse par l’IA peut vous aider. Le journal prend en charge de nombreux exports de courtiers, mais les noms de colonnes et la mise en page des relevés peuvent varier. OpenAI ou Anthropic peut interpréter les formats inconnus et extraire les trades à vérifier. Contrôlez les quantités, prix, frais et dates avec votre relevé avant l’importation. Votre fichier est envoyé au fournisseur choisi avec votre clé API ; des frais d’utilisation peuvent s’appliquer.";

/** Statement parsing needs PDF input and strict structured output, so it stays on hosted providers. */
export type AiImportProvider = Exclude<AiProvider, "compatible">;
export const isAiImportProvider = (value: unknown): value is AiImportProvider =>
  value === "openai" || value === "anthropic";

export interface AiImportOptions {
  provider: AiImportProvider;
  model: string;
  apiKey?: string;
}
