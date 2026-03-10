// ============================================================
// i18n — Détection de langue et traduction inline
//
// Principe : chaque handler détecte la langue du prompt
// utilisateur une seule fois, puis utilise tr(fr, en) pour
// toutes les chaînes de sortie.
// ============================================================

export type Lang = 'fr' | 'en';

/**
 * Détecte la langue d'un prompt utilisateur.
 *
 * Stratégie :
 *  - Les accents français sont un signal fort (×2)
 *  - Les mots clés français courants (+1 chacun)
 *  - Les mots clés anglais courants (+1 chacun)
 *  - Par défaut → français (langue principale de l'outil)
 */
export function detectLanguage(prompt: string): Lang {
    const frScore =
        ((prompt.match(/[àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/g) ?? []).length) * 2 +
        ((prompt.match(
            /\b(les|des|une|dans|pour|avec|sur|par|vers|depuis|tous|toutes|mes|mon|ma|ses|leur|leurs|quel|quels|quelles|est|sont|liste|affiche|montre|cherche|supprime|crée|copie|télécharge|envoie|pousse|relance|surveille|soumets|upload|download|aucun|voici|merci|bonjour|svp|stp)\b/gi
        ) ?? []).length);

    const enScore =
        ((prompt.match(
            /\b(the|show|display|list|search|find|download|upload|create|delete|copy|read|get|from|all|my|your|members|datasets|how|what|which|where|submit|monitor|cancel|purge|resubmit|please|hello)\b/gi
        ) ?? []).length);

    return enScore > frScore ? 'en' : 'fr';
}

/**
 * Retourne la chaîne correspondant à la langue.
 *
 * Usage : tr('Aucun résultat', 'No results', lang)
 */
export function tr(fr: string, en: string, lang: Lang): string {
    return lang === 'fr' ? fr : en;
}
