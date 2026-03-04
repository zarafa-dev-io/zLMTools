import * as vscode from 'vscode';
import { SafetyLevel } from '../intents/ds.schemas';

// ============================================================
// Module de sécurité — confirmations et filtres
// Empêche les opérations dangereuses sans validation explicite
// ============================================================

/** Patterns de datasets protégés (production) */
const PROTECTED_PATTERNS = [
    /^.*\.PROD\..*/i,
    /^.*\.PRD\..*/i,
    /^.*\.PRODUCTION\..*/i,
    /^SYS[0-9]\..*/i,
];

/**
 * Vérifie si un dataset est dans une zone protégée
 */
export function isProtectedDataset(datasetName: string): boolean {
    return PROTECTED_PATTERNS.some(pattern => pattern.test(datasetName));
}

/**
 * Détermine le niveau de sécurité effectif
 * en tenant compte de la zone (prod vs dev)
 */
export function getEffectiveSafetyLevel(
    baseSafety: SafetyLevel,
    datasetName: string
): SafetyLevel {
    if (isProtectedDataset(datasetName)) {
        // En zone protégée, tout ce qui est "moderate" devient "dangerous"
        if (baseSafety === 'moderate') {
            return 'dangerous';
        }
    }
    return baseSafety;
}

/**
 * Demande confirmation à l'utilisateur pour une opération sensible
 * Utilise stream.button() pour intégrer nativement dans le chat
 */
export async function requestConfirmation(
    stream: vscode.ChatResponseStream,
    operationDescription: string,
    safetyLevel: SafetyLevel,
    datasetName: string
): Promise<boolean> {
    const isProtected = isProtectedDataset(datasetName);

    if (safetyLevel === 'safe') {
        return true;
    }

    if (safetyLevel === 'dangerous') {
        const warningEmoji = isProtected ? '🔴' : '🟠';
        const zoneWarning = isProtected
            ? `\n\n> **⚠️ ZONE PROTÉGÉE** — Le dataset \`${datasetName}\` semble être en production.`
            : '';

        stream.markdown(
            `${warningEmoji} **Confirmation requise**\n\n` +
            `Opération : ${operationDescription}${zoneWarning}\n\n`
        );

        // Utiliser vscode.window pour une confirmation modale
        const choice = await vscode.window.showWarningMessage(
            `${isProtected ? '[PROD] ' : ''}${operationDescription}`,
            { modal: true },
            'Confirmer',
            'Annuler'
        );

        if (choice !== 'Confirmer') {
            stream.markdown('❌ Opération annulée par l\'utilisateur.\n');
            return false;
        }

        stream.markdown('✅ Opération confirmée.\n\n');
        return true;
    }

    // moderate — notification simple
    stream.markdown(
        `🟡 **Note** : ${operationDescription}\n\n`
    );
    return true;
}

/**
 * Formate une description lisible de l'opération pour la confirmation
 */
export function describeOperation(intentType: string, params: Record<string, any>): string {
    switch (intentType) {
        case 'DELETE_MEMBER':
            return `Suppression du membre ${params.member} dans ${params.dataset}`;
        case 'DELETE_DATASET':
            return `Suppression du dataset ${params.dataset} (IRRÉVERSIBLE)`;
        case 'WRITE_MEMBER':
            return `Écriture dans ${params.dataset}(${params.member})`;
        case 'CREATE_DATASET':
            return `Création du dataset ${params.name} (${params.dsorg})`;
        case 'CREATE_MEMBER':
            return `Création du membre ${params.member} dans ${params.dataset}`;
        default:
            return `Opération ${intentType} sur ${params.dataset ?? params.name ?? '?'}`;
    }
}
