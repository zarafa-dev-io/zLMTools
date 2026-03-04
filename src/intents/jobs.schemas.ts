// ============================================================
// Intent schemas for the /jobs command
// Each intent maps to a specific Zowe SDK operation
// ============================================================

export type JobsIntent =
    | ListJobsIntent
    | GetJobStatusIntent
    | GetJobOutputIntent
    | GetSpoolFileIntent
    | CancelJobIntent
    | PurgeJobIntent
    | MonitorJobIntent;

export interface ListJobsIntent {
    type: 'LIST_JOBS';
    owner?: string;       // ex: "USERID" — défaut: profil courant
    prefix?: string;      // ex: "PAYROLL*"
    status?: 'ACTIVE' | 'OUTPUT' | 'INPUT'; // filtre par statut
    maxJobs?: number;     // limite (défaut: 20)
}

export interface GetJobStatusIntent {
    type: 'GET_JOB_STATUS';
    jobId?: string;       // ex: "JOB12345"
    jobName?: string;     // ex: "PAYROLL" — prend le plus récent
}

export interface GetJobOutputIntent {
    type: 'GET_JOB_OUTPUT';
    jobId?: string;
    jobName?: string;
    spoolFilter?: string; // ex: "SYSOUT", "SYSPRINT", "JESMSGLG"
    last?: boolean;       // prendre le job le plus récent
}

export interface GetSpoolFileIntent {
    type: 'GET_SPOOL_FILE';
    jobId: string;
    jobName: string;
    ddName: string;       // ex: "SYSPRINT"
    stepName?: string;    // ex: "STEP01"
}

export interface CancelJobIntent {
    type: 'CANCEL_JOB';
    jobId: string;
    jobName: string;
}

export interface PurgeJobIntent {
    type: 'PURGE_JOB';
    jobId: string;
    jobName: string;
}

export interface MonitorJobIntent {
    type: 'MONITOR_JOB';
    jobId: string;
    jobName: string;
}

// ============================================================
// Safety levels
// ============================================================

import { SafetyLevel } from './ds.schemas';

export const JOBS_INTENT_SAFETY: Record<JobsIntent['type'], SafetyLevel> = {
    LIST_JOBS: 'safe',
    GET_JOB_STATUS: 'safe',
    GET_JOB_OUTPUT: 'safe',
    GET_SPOOL_FILE: 'safe',
    MONITOR_JOB: 'safe',
    CANCEL_JOB: 'dangerous',
    PURGE_JOB: 'dangerous',
};
