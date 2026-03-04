import * as vscode from 'vscode';

// ============================================================
// ZosChatResult — Résultat retourné par chaque handler
//
// Contient les followups contextuels qui seront affichés
// comme des boutons cliquables sous la réponse.
// L'utilisateur clique → le prompt est injecté dans le champ
// de saisie de Copilot Chat, prêt à être envoyé.
// ============================================================

export interface ZosChatResult extends vscode.ChatResult {
    metadata: {
        command: string;
        intentType?: string;
        followups: ZosFollowup[];
    };
}

export interface ZosFollowup {
    /** Le prompt qui sera injecté dans le champ de saisie */
    prompt: string;
    /** Le label affiché sur le bouton */
    label: string;
    /** La commande slash à utiliser (ex: 'ds', 'jobs', 'run') */
    command?: string;
}

/**
 * Helper pour créer un résultat avec followups
 */
export function createResult(
    command: string,
    intentType: string | undefined,
    followups: ZosFollowup[]
): ZosChatResult {
    return {
        metadata: {
            command,
            intentType,
            followups,
        },
    };
}

/**
 * Helper rapide pour créer un followup
 */
export function followup(
    label: string,
    prompt: string,
    command?: string
): ZosFollowup {
    return { label, prompt, command };
}
