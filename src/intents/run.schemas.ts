// ============================================================
// Intent schemas for the /run command
// Soumission de JCL et exécution de programmes
// ============================================================

export type RunIntent =
    | SubmitDatasetIntent
    | SubmitInlineIntent
    | SubmitAndMonitorIntent
    | ResubmitIntent
    | SubmitLocalFileIntent
    | SubmitLocalFileAndMonitorIntent;

export interface SubmitDatasetIntent {
    type: 'SUBMIT_DATASET';
    dataset: string;        // ex: "HLQ.JCL.CNTL"
    member?: string;        // ex: "BATCH01" — si PDS
}

export interface SubmitInlineIntent {
    type: 'SUBMIT_INLINE';
    jcl: string;            // JCL brut fourni par l'utilisateur
}

export interface SubmitAndMonitorIntent {
    type: 'SUBMIT_AND_MONITOR';
    dataset: string;
    member?: string;
    autoDisplay?: boolean;  // afficher le spool automatiquement à la fin
}

export interface ResubmitIntent {
    type: 'RESUBMIT';
    jobId?: string;         // re-soumettre le JCL d'un job précédent
    jobName?: string;
}

export interface SubmitLocalFileIntent {
    type: 'SUBMIT_LOCAL_FILE';
    localPath: string;      // chemin local (absolu ou relatif au workspace)
}

export interface SubmitLocalFileAndMonitorIntent {
    type: 'SUBMIT_LOCAL_FILE_AND_MONITOR';
    localPath: string;
    autoDisplay?: boolean;  // afficher le spool automatiquement à la fin
}

// ============================================================
// Safety levels — toute soumission est au minimum "moderate"
// ============================================================

import { SafetyLevel } from './ds.schemas';

export const RUN_INTENT_SAFETY: Record<RunIntent['type'], SafetyLevel> = {
    SUBMIT_DATASET: 'moderate',
    SUBMIT_INLINE: 'moderate',
    SUBMIT_AND_MONITOR: 'moderate',
    RESUBMIT: 'moderate',
    SUBMIT_LOCAL_FILE: 'moderate',
    SUBMIT_LOCAL_FILE_AND_MONITOR: 'moderate',
};
