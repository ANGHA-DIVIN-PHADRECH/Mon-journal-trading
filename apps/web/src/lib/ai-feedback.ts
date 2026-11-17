export interface AiFeedback {
  title: string;
  description: string;
  tone: "info" | "error";
  action?: { label: string; href: string };
  retry?: boolean;
}

/** Friendly, bounded copy: never echo provider payloads or credentials into the UI. */
export function aiFeedback(message: string): AiFeedback {
  if (/^No (?:closed )?trades match/.test(message))
    return {
      title: "Aucune opération correspondante",
      description:
        "Aucune opération à analyser dans cette sélection. Modifiez les comptes, les dates ou les autres filtres du journal.",
      tone: "info",
    };
  if (
    /^A selected account no longer exists|^Invalid .* filter|^Invalid .* (?:date|time|number|range)|^Unknown journal filter|^filters is required|^From date must/.test(
      message,
    )
  )
    return {
      title: "Vérifiez les filtres du journal",
      description:
        "La sélection n’est plus valide. Modifiez les comptes et les filtres avant de réessayer.",
      tone: "info",
    };
  if (/^Journal timezone changed/.test(message))
    return {
      title: "Actualisez votre journal",
      description:
        "Le fuseau horaire du journal a changé. Actualisez cette page pour harmoniser les dates affichées et l’analyse de l’IA.",
      tone: "info",
    };
  if (/AI is not configured/i.test(message))
    return {
      title: "Configurez l’IA pour continuer",
      description:
        "Connectez Anthropic, OpenAI ou un serveur compatible avec OpenAI dans les paramètres pour poser des questions, générer des bilans et analyser vos opérations.",
      tone: "info",
      action: { label: "Configurer l’IA", href: "/settings#ai-settings" },
    };
  if (
    /invalid.*(?:api.?key|x-api-key)|incorrect api key|authentication_error|invalid_api_key/i.test(
      message,
    )
  )
    return {
      title: "Vérifiez votre connexion à l’IA",
      description:
        "Votre fournisseur d’IA n’a pas pu vérifier votre clé ou vos autorisations. Vérifiez-les dans les paramètres, puis réessayez.",
      tone: "error",
      action: { label: "Vérifier les paramètres de l’IA", href: "/settings#ai-settings" },
    };
  if (
    /credit balance|billing|insufficient.*(?:credit|quota)|exceeded your current quota/i.test(
      message,
    )
  )
    return {
      title: "Votre compte d’IA nécessite une vérification",
      description:
        "Vérifiez la facturation, le solde de crédits ou le quota de votre compte auprès du fournisseur d’IA, puis réessayez.",
      tone: "info",
    };
  if (/model unavailable|model_not_found/i.test(message))
    return {
      title: "Vérifiez votre modèle d’IA",
      description:
        "Vérifiez l’identifiant du modèle et les droits d’accès de votre compte dans les paramètres.",
      tone: "error",
      action: { label: "Vérifier les paramètres de l’IA", href: "/settings#ai-settings" },
    };
  if (/AI server unreachable/i.test(message))
    return {
      title: "Serveur d’IA inaccessible",
      description:
        "Vérifiez l’adresse du serveur dans les paramètres, ainsi que son démarrage et son accessibilité depuis le journal.",
      tone: "error",
      action: { label: "Vérifier les paramètres de l’IA", href: "/settings#ai-settings" },
      retry: true,
    };
  if (/rate.limit|too many requests|overloaded/i.test(message))
    return {
      title: "L’IA est momentanément occupée",
      description:
        "Patientez un instant avant de réessayer. Les données de votre journal n’ont pas été modifiées.",
      tone: "info",
      retry: true,
    };
  if (/journal is empty/i.test(message))
    return {
      title: "Ajoutez des opérations pour commencer",
      description:
        "Les analyses de l’IA s’appuient sur l’historique de votre journal. Importez vos opérations, puis posez à nouveau votre question.",
      tone: "info",
      action: { label: "Importer des opérations", href: "/import" },
    };
  if (/No closed trades on this day/i.test(message))
    return {
      title: "Aucune opération à résumer pour le moment",
      description:
        "Un bilan nécessite au moins une opération clôturée ce jour-là. Vous pouvez toutefois rédiger votre propre note quotidienne.",
      tone: "info",
    };
  if (/Unauthorized/i.test(message))
    return {
      title: "Reconnectez-vous",
      description:
        "Votre session a peut-être expiré. Connectez-vous pour continuer à utiliser votre journal.",
      tone: "info",
      action: { label: "Se connecter", href: "/login" },
    };
  if (/failed to fetch|network|timeout|timed out|connection/i.test(message))
    return {
      title: "Connexion à l’IA impossible",
      description:
        "Vérifiez votre connexion et réessayez. Les données de votre journal n’ont pas été modifiées.",
      tone: "error",
      retry: true,
    };
  return {
    title: "La demande à l’IA n’a pas abouti",
    description:
      "Réessayez dans un instant. Si le problème persiste, vérifiez les paramètres de l’IA.",
    tone: "error",
    retry: true,
  };
}
