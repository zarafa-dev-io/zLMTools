import * as vscode from 'vscode';
import {
    GetJobs,
    MonitorJobs,
    CancelJobs,
    DeleteJobs,
    IJob,
    IJobFile,
} from '@zowe/zos-jobs-for-zowe-sdk';
import { ZoweSessionManager } from '../zowe/session';
import { TelemetryService } from '../utils/telemetry';
import { JobsIntentClassifier } from '../intents/jobs.classifier';
import {
    JobsIntent,
    JOBS_INTENT_SAFETY,
} from '../intents/jobs.schemas';
import { requestConfirmation, describeOperation } from '../zowe/safety';
import { ZosChatResult, ZosFollowup, createResult, followup } from '../types/chat-result';

// ============================================================
// Handler /jobs — Jobs z/OS
//
// Opérations :
//   LIST_JOBS      → Lister les jobs (par owner, prefix, statut)
//   GET_JOB_STATUS → Statut détaillé + RC par step
//   GET_JOB_OUTPUT → Lister les spool files d'un job
//   GET_SPOOL_FILE → Lire le contenu d'un spool file
//   CANCEL_JOB     → Annuler un job actif
//   PURGE_JOB      → Purger un job de la file JES
//   MONITOR_JOB    → Surveiller un job jusqu'à complétion
// ============================================================

export class JobsHandler {
    private classifier: JobsIntentClassifier;

    constructor(
        private sessionManager: ZoweSessionManager,
        private telemetry: TelemetryService
    ) {
        this.classifier = new JobsIntentClassifier();
    }

    async handle(
        request: vscode.ChatRequest,
        chatContext: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<ZosChatResult> {
        const prompt = request.prompt.trim();

        if (!prompt) {
            stream.markdown(
                `**Commande /jobs** — Gestion des jobs z/OS\n\n` +
                `Tapez votre requête en langage naturel après \`/jobs\`.`
            );
            return createResult('jobs', undefined, [
                followup('📋 Lister mes jobs', 'liste mes jobs', 'jobs'),
                followup('🔄 Jobs actifs', 'liste les jobs actifs', 'jobs'),
                followup('🔍 Statut d\'un job', 'statut de JOB12345', 'jobs'),
            ]);
        }

        // ── Step 1 : Classification ──
        stream.progress('Analyse de la requête...');
        const intent = await this.classifier.classify(prompt, token);

        if (!intent) {
            stream.markdown(
                `🤔 Je n'ai pas compris votre requête sur les jobs.`
            );
            return createResult('jobs', undefined, [
                followup('📋 Lister mes jobs', 'liste mes jobs', 'jobs'),
                followup('🔄 Jobs actifs', 'liste les jobs actifs', 'jobs'),
            ]);
            return [];
        }

        // ── Step 2 : Sécurité ──
        const safety = JOBS_INTENT_SAFETY[intent.type];
        if (safety !== 'safe') {
            const description = this.describeJobOperation(intent);
            const confirmed = await requestConfirmation(
                stream, description, safety, (intent as any).jobName ?? ''
            );
            if (!confirmed) {
                return createResult('jobs', intent.type, []);
            }
        }

        // ── Step 3 : Exécution ──
        stream.progress('Connexion à z/OS...');
        const { session, profileName } = await this.sessionManager.getSession();

        stream.progress(`Exécution ${intent.type}...`);

        let followups: ZosFollowup[];

        switch (intent.type) {
            case 'LIST_JOBS':
                followups = await this.listJobs(session, intent, stream);
                break;
            case 'GET_JOB_STATUS':
                followups = await this.getJobStatus(session, intent, stream);
                break;
            case 'GET_JOB_OUTPUT':
                followups = await this.getJobOutput(session, intent, stream);
                break;
            case 'GET_SPOOL_FILE':
                followups = await this.getSpoolFile(session, intent, stream);
                break;
            case 'CANCEL_JOB':
                followups = await this.cancelJob(session, intent, stream);
                break;
            case 'PURGE_JOB':
                followups = await this.purgeJob(session, intent, stream);
                break;
            case 'MONITOR_JOB':
                followups = await this.monitorJob(session, intent, stream, token);
                break;
            default:
                followups = [];
        }

        this.telemetry.trackSuccess('jobs', intent.type, profileName);
        return createResult('jobs', intent.type, followups);
    }

    // ================================================================
    // LIST_JOBS — Lister les jobs
    // ================================================================
    private async listJobs(
        session: any,
        intent: { owner?: string; prefix?: string; status?: string; maxJobs?: number },
        stream: vscode.ChatResponseStream
    ): Promise<ZosFollowup[]> {
        const params: any = {};

        if (intent.owner) {
            params.owner = intent.owner;
        }
        if (intent.prefix) {
            params.prefix = intent.prefix;
        }
        if (intent.status) {
            params.status = intent.status;
        }
        if (intent.maxJobs) {
            params.maxJobs = intent.maxJobs;
        }

        const jobs: IJob[] = await GetJobs.getJobsCommon(session, params);

        if (jobs.length === 0) {
            const filters = [];
            if (intent.owner) { filters.push(`owner=${intent.owner}`); }
            if (intent.prefix) { filters.push(`prefix=${intent.prefix}`); }
            if (intent.status) { filters.push(`status=${intent.status}`); }
            stream.markdown(
                `Aucun job trouvé` +
                (filters.length > 0 ? ` (filtres : ${filters.join(', ')})` : '') +
                `.`
            );
            return [];
        }

        const title = this.buildListTitle(intent);
        stream.markdown(`### 📋 ${title} (${jobs.length} résultats)\n\n`);

        stream.markdown(`| Job Name | Job ID | Owner | Statut | RC | Classe | Date |\n`);
        stream.markdown(`|----------|--------|-------|--------|-----|--------|------|\n`);

        for (const job of jobs) {
            const rc = this.formatReturnCode(job);
            const statusEmoji = this.getStatusEmoji(job.status, job.retcode);
            const date = job.subsystem ?? '-';

            stream.markdown(
                `| \`${job.jobname}\` | \`${job.jobid}\` ` +
                `| ${job.owner ?? '-'} ` +
                `| ${statusEmoji} ${job.status ?? '-'} ` +
                `| ${rc} ` +
                `| ${job.class ?? '-'} ` +
                `| ${date} |\n`
            );
        }

        stream.markdown(
            `\n💡 *Actions possibles :*\n` +
            `- \`/jobs statut de <JOBID>\` — détail d'un job\n` +
            `- \`/jobs montre la sortie de <JOBID>\` — voir le spool\n`
        );

        // Followups contextuels basés sur les résultats
        const suggestions: ZosFollowup[] = [];
        const topJobs = jobs.slice(0, 3);

        for (const job of topJobs) {
            const label = job.retcode
                ? `${this.getStatusEmoji(job.status, job.retcode)} ${job.jobname} (${job.jobid})`
                : `🔍 ${job.jobname} (${job.jobid})`;
            suggestions.push(
                followup(label, `statut de ${job.jobid}`, 'jobs')
            );
        }

        return suggestions;
    }

    // ================================================================
    // GET_JOB_STATUS — Statut détaillé d'un job
    // ================================================================
    private async getJobStatus(
        session: any,
        intent: { jobId?: string; jobName?: string },
        stream: vscode.ChatResponseStream
    ): Promise<ZosFollowup[]> {
        const job = await this.resolveJob(session, intent);

        if (!job) {
            stream.markdown(this.jobNotFoundMessage(intent));
            return [];
        }

        const statusEmoji = this.getStatusEmoji(job.status, job.retcode);
        const rc = this.formatReturnCode(job);

        stream.markdown(`### ${statusEmoji} Job \`${job.jobname}\` (\`${job.jobid}\`)\n\n`);

        stream.markdown(`| Propriété | Valeur |\n`);
        stream.markdown(`|-----------|--------|\n`);

        const props: [string, any][] = [
            ['Statut', `${statusEmoji} ${job.status}`],
            ['Return Code', rc],
            ['Owner', job.owner],
            ['Classe', job.class],
            ['Sous-système', job.subsystem],
            ['Type', job.type],
            ['Phase', (job as any).phaseName ?? (job as any).phase],
        ];

        for (const [label, value] of props) {
            if (value !== undefined && value !== null && value !== '') {
                stream.markdown(`| ${label} | \`${value}\` |\n`);
            }
        }

        // Récupérer les steps (via spool files)
        try {
            const spoolFiles = await GetJobs.getSpoolFilesForJob(session, job);
            if (spoolFiles.length > 0) {
                stream.markdown(`\n#### 📂 Spool Files (${spoolFiles.length})\n\n`);
                stream.markdown(`| DD Name | Step | Procstep | Classe | Taille |\n`);
                stream.markdown(`|---------|------|----------|--------|--------|\n`);

                for (const sf of spoolFiles) {
                    const size = sf.byteCount !== undefined
                        ? this.formatBytes(sf.byteCount)
                        : '-';
                    stream.markdown(
                        `| \`${sf.ddname}\` ` +
                        `| ${sf.stepname ?? '-'} ` +
                        `| ${sf.procstep ?? '-'} ` +
                        `| ${sf.class ?? '-'} ` +
                        `| ${size} |\n`
                    );
                }
            }
        } catch {
            // Spool non disponible (job en cours ?)
        }

        // Diagnostic automatique en cas d'erreur
        if (job.retcode && !job.retcode.startsWith('CC 0000')) {
            stream.markdown(
                `\n💡 Le job a terminé avec **${rc}**. ` +
                `Tapez \`/jobs montre le JESMSGLG de ${job.jobid}\` pour voir les messages système.`
            );
        }

        // Proposer des actions
        stream.markdown(
            `\n💡 \`/jobs montre la sortie de ${job.jobid}\` pour lire le spool.`
        );

        return [
            followup(`📜 Voir le spool de ${job.jobid}`, `montre la sortie de ${job.jobid}`, 'jobs'),
            followup(`📄 JESMSGLG de ${job.jobid}`, `affiche le JESMSGLG de ${job.jobid}`, 'jobs'),
            followup('📋 Retour à la liste', 'liste mes jobs', 'jobs'),
        ];
    }

    // ================================================================
    // GET_JOB_OUTPUT — Lister et/ou afficher les spool files
    // ================================================================
    private async getJobOutput(
        session: any,
        intent: { jobId?: string; jobName?: string; spoolFilter?: string; last?: boolean },
        stream: vscode.ChatResponseStream
    ): Promise<ZosFollowup[]> {
        const job = await this.resolveJob(session, intent);

        if (!job) {
            stream.markdown(this.jobNotFoundMessage(intent));
            return [];
        }

        const spoolFiles = await GetJobs.getSpoolFilesForJob(session, job);

        if (spoolFiles.length === 0) {
            stream.markdown(`Aucun spool file pour le job \`${job.jobname}\` (\`${job.jobid}\`).`);
            return [];
        }

        // Si un filtre DD est spécifié, afficher directement le contenu
        if (intent.spoolFilter) {
            const filtered = spoolFiles.filter(
                sf => sf.ddname.toUpperCase() === intent.spoolFilter!.toUpperCase()
            );

            if (filtered.length === 0) {
                stream.markdown(
                    `DD \`${intent.spoolFilter}\` non trouvé dans le spool de \`${job.jobid}\`.\n\n` +
                    `DD disponibles : ${spoolFiles.map(sf => `\`${sf.ddname}\``).join(', ')}`
                );
                return [];
            }

            for (const sf of filtered) {
                await this.displaySpoolContent(session, job, sf, stream);
            }
            return [];
        }

        // Sinon, lister les spool files avec un aperçu
        stream.markdown(
            `### 📜 Spool de \`${job.jobname}\` (\`${job.jobid}\`) — ` +
            `${this.formatReturnCode(job)}\n\n`
        );

        // Afficher automatiquement les fichiers importants
        const autoDisplay = ['JESMSGLG', 'JESJCL', 'JESYSMSG'];
        const displayedDDs = new Set<string>();

        for (const sf of spoolFiles) {
            if (autoDisplay.includes(sf.ddname) || spoolFiles.length <= 5) {
                await this.displaySpoolContent(session, job, sf, stream);
                displayedDDs.add(sf.ddname);
            }
        }

        // Lister les non-affichés
        const remaining = spoolFiles.filter(sf => !displayedDDs.has(sf.ddname));
        if (remaining.length > 0) {
            stream.markdown(`\n#### Autres spool files\n\n`);
            stream.markdown(`| DD Name | Step | Taille |\n`);
            stream.markdown(`|---------|------|--------|\n`);

            for (const sf of remaining) {
                const size = sf.byteCount !== undefined
                    ? this.formatBytes(sf.byteCount)
                    : '-';
                stream.markdown(
                    `| \`${sf.ddname}\` | ${sf.stepname ?? '-'} | ${size} |\n`
                );
            }

            stream.markdown(
                `\n💡 \`/jobs affiche le <DDNAME> de ${job.jobid}\` pour voir le contenu.`
            );
        }

        return [
            followup(`🔍 Statut de ${job.jobid}`, `statut de ${job.jobid}`, 'jobs'),
            followup('📋 Retour à la liste', 'liste mes jobs', 'jobs'),
        ];
    }

    // ================================================================
    // GET_SPOOL_FILE — Lire un fichier spool spécifique
    // ================================================================
    private async getSpoolFile(
        session: any,
        intent: { jobId: string; jobName: string; ddName: string; stepName?: string },
        stream: vscode.ChatResponseStream
    ): Promise<ZosFollowup[]> {
        const job = await this.resolveJob(session, { jobId: intent.jobId, jobName: intent.jobName });

        if (!job) {
            stream.markdown(this.jobNotFoundMessage(intent));
            return [];
        }

        const spoolFiles = await GetJobs.getSpoolFilesForJob(session, job);

        let target = spoolFiles.filter(
            sf => sf.ddname.toUpperCase() === intent.ddName.toUpperCase()
        );

        // Filtrer par stepName si spécifié
        if (intent.stepName && target.length > 1) {
            const byStep = target.filter(
                sf => sf.stepname?.toUpperCase() === intent.stepName!.toUpperCase()
            );
            if (byStep.length > 0) {
                target = byStep;
            }
        }

        if (target.length === 0) {
            stream.markdown(
                `DD \`${intent.ddName}\` non trouvé` +
                (intent.stepName ? ` dans le step \`${intent.stepName}\`` : '') +
                ` pour \`${job.jobid}\`.\n\n` +
                `DD disponibles : ${spoolFiles.map(sf => `\`${sf.ddname}\``).join(', ')}`
            );
            return [];
        }

        for (const sf of target) {
            await this.displaySpoolContent(session, job, sf, stream);
        }
    }

    // ================================================================
    // CANCEL_JOB — Annuler un job actif
    // ================================================================
    private async cancelJob(
        session: any,
        intent: { jobId: string; jobName: string },
        stream: vscode.ChatResponseStream
    ): Promise<ZosFollowup[]> {
        const job = await this.resolveJob(session, intent);

        if (!job) {
            stream.markdown(this.jobNotFoundMessage(intent));
            return [];
        }

        if (job.status !== 'ACTIVE' && job.status !== 'INPUT') {
            stream.markdown(
                `⚠️ Le job \`${job.jobname}\` (\`${job.jobid}\`) est en statut **${job.status}** ` +
                `et ne peut pas être annulé.`
            );
            return [];
        }

        await CancelJobs.cancelJob(session, job.jobid, job.jobname);

        stream.markdown(
            `✅ **Job annulé** — \`${job.jobname}\` (\`${job.jobid}\`)\n\n` +
            `Le job était en statut **${job.status}** au moment de l'annulation.`
        );

        return [
            followup(`🔍 Vérifier le statut`, `statut de ${job.jobid}`, 'jobs'),
            followup('📋 Lister mes jobs', 'liste mes jobs', 'jobs'),
        ];
    }

    // ================================================================
    // PURGE_JOB — Purger un job de la file JES
    // ================================================================
    private async purgeJob(
        session: any,
        intent: { jobId: string; jobName: string },
        stream: vscode.ChatResponseStream
    ): Promise<ZosFollowup[]> {
        const job = await this.resolveJob(session, intent);

        if (!job) {
            stream.markdown(this.jobNotFoundMessage(intent));
            return [];
        }

        await DeleteJobs.deleteJob(session, job.jobid, job.jobname);

        stream.markdown(
            `✅ **Job purgé** — \`${job.jobname}\` (\`${job.jobid}\`)\n\n` +
            `Le job et son spool ont été supprimés de la file JES.`
        );

        return [
            followup('📋 Lister mes jobs', 'liste mes jobs', 'jobs'),
        ];
    }

    // ================================================================
    // MONITOR_JOB — Surveiller un job jusqu'à complétion
    // ================================================================
    private async monitorJob(
        session: any,
        intent: { jobId: string; jobName: string },
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<ZosFollowup[]> {
        const job = await this.resolveJob(session, intent);

        if (!job) {
            stream.markdown(this.jobNotFoundMessage(intent));
            return [];
        }

        if (job.status === 'OUTPUT') {
            const rc = this.formatReturnCode(job);
            const emoji = this.getStatusEmoji(job.status, job.retcode);
            stream.markdown(
                `${emoji} Le job \`${job.jobname}\` (\`${job.jobid}\`) est déjà terminé — **${rc}**.\n\n` +
                `💡 \`/jobs montre la sortie de ${job.jobid}\` pour voir le spool.`
            );
            return [];
        }

        stream.markdown(
            `### ⏳ Surveillance de \`${job.jobname}\` (\`${job.jobid}\`)\n\n` +
            `Statut initial : **${job.status}**\n\n`
        );

        // Polling avec timeout
        const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutes max
        const POLL_INTERVAL_MS = 5000;       // toutes les 5 secondes
        const startTime = Date.now();
        let lastStatus = job.status;

        while (!token.isCancellationRequested) {
            const elapsed = Date.now() - startTime;

            if (elapsed > MAX_WAIT_MS) {
                stream.markdown(
                    `\n⏰ **Timeout** — Le job est toujours en cours après 5 minutes.\n` +
                    `Vérifiez manuellement avec \`/jobs statut de ${job.jobid}\``
                );
                return [];
            }

            // Attendre l'intervalle
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

            try {
                const currentJob = await GetJobs.getJob(session, job.jobid);

                if (currentJob.status !== lastStatus) {
                    stream.progress(
                        `${this.getStatusEmoji(currentJob.status, currentJob.retcode)} ` +
                        `${currentJob.status} (${Math.round(elapsed / 1000)}s)`
                    );
                    lastStatus = currentJob.status ?? lastStatus;
                }

                if (currentJob.status === 'OUTPUT') {
                    const rc = this.formatReturnCode(currentJob);
                    const emoji = this.getStatusEmoji(currentJob.status, currentJob.retcode);

                    stream.markdown(
                        `\n${emoji} **Job terminé** — \`${currentJob.jobname}\` (\`${currentJob.jobid}\`) ` +
                        `→ **${rc}** (en ${Math.round(elapsed / 1000)}s)\n`
                    );

                    // Afficher automatiquement le résumé s'il y a eu une erreur
                    if (currentJob.retcode && !currentJob.retcode.startsWith('CC 0000')) {
                        stream.markdown(
                            `\n⚠️ Le job a terminé en erreur. ` +
                            `\`/jobs montre le JESMSGLG de ${currentJob.jobid}\` pour diagnostiquer.`
                        );
                    } else {
                        stream.markdown(
                            `\n💡 \`/jobs montre la sortie de ${currentJob.jobid}\` pour voir le spool.`
                        );
                    }
                    return [
                        followup(`📜 Voir le spool`, `montre la sortie de ${currentJob.jobid}`, 'jobs'),
                        followup(`🔍 Statut détaillé`, `statut de ${currentJob.jobid}`, 'jobs'),
                    ];
                    return [];
                }
            } catch (error) {
                // Erreur transitoire, on continue le polling
                console.warn('[zos/jobs] Monitor poll error:', error);
            }
        }

        stream.markdown('\n❌ Surveillance annulée par l\'utilisateur.');
    }

    // ================================================================
    // Utilitaires internes
    // ================================================================

    /**
     * Résout un job par ID ou par nom (prend le plus récent)
     */
    private async resolveJob(
        session: any,
        intent: { jobId?: string; jobName?: string }
    ): Promise<IJob | null> {
        // Par Job ID — résolution directe
        if (intent.jobId) {
            try {
                return await GetJobs.getJob(session, intent.jobId);
            } catch {
                return null;
            }
        }

        // Par Job Name — prendre le plus récent
        if (intent.jobName) {
            const jobs = await GetJobs.getJobsCommon(session, {
                prefix: intent.jobName,
                maxJobs: 5,
            });

            if (jobs.length === 0) {
                return null;
            }

            // Trier par date décroissante (le premier est le plus récent)
            // GetJobs retourne normalement dans l'ordre JES
            return jobs[0];
        }

        return null;
    }

    /**
     * Affiche le contenu d'un spool file dans le stream
     */
    private async displaySpoolContent(
        session: any,
        job: IJob,
        spoolFile: IJobFile,
        stream: vscode.ChatResponseStream
    ): Promise<ZosFollowup[]> {
        try {
            const content = await GetJobs.getSpoolContentById(
                session,
                job.jobname,
                job.jobid,
                spoolFile.id
            );

            if (!content || content.trim().length === 0) {
                stream.markdown(`\n**${spoolFile.ddname}** (${spoolFile.stepname ?? '-'}) — *vide*\n`);
                return [];
            }

            const lines = content.split('\n');
            const truncated = lines.length > 200;
            const displayContent = truncated
                ? lines.slice(0, 200).join('\n') + `\n... (tronqué, ${lines.length} lignes au total)`
                : content;

            const stepInfo = spoolFile.stepname ? ` / ${spoolFile.stepname}` : '';
            const sizeInfo = spoolFile.byteCount
                ? ` — ${this.formatBytes(spoolFile.byteCount)}`
                : '';

            stream.markdown(
                `\n#### 📄 \`${spoolFile.ddname}\`${stepInfo}${sizeInfo}\n\n`
            );
            stream.markdown(`\`\`\`\n${displayContent}\n\`\`\`\n`);
        } catch (error) {
            stream.markdown(
                `\n**${spoolFile.ddname}** — ⚠️ Impossible de lire le contenu.\n`
            );
        }
    }

    /**
     * Formate le return code pour l'affichage
     */
    private formatReturnCode(job: IJob): string {
        if (!job.retcode) {
            return job.status === 'ACTIVE' ? '*(en cours)*' : '-';
        }

        // Formats courants : "CC 0000", "CC 0004", "ABEND S0C7", "JCL ERROR"
        return `\`${job.retcode}\``;
    }

    /**
     * Emoji selon le statut et le RC
     */
    private getStatusEmoji(status?: string, retcode?: string | null): string {
        if (status === 'ACTIVE') { return '🔄'; }
        if (status === 'INPUT') { return '⏳'; }

        if (!retcode) { return '⚪'; }

        if (retcode === 'CC 0000') { return '✅'; }
        if (retcode.startsWith('CC 0004')) { return '🟡'; }
        if (retcode.startsWith('CC 00')) { return '🟠'; } // CC 0008, CC 0012...
        if (retcode.includes('ABEND')) { return '🔴'; }
        if (retcode.includes('JCL ERROR')) { return '🔴'; }
        if (retcode.includes('CANCEL')) { return '❌'; }

        return '🟠';
    }

    /**
     * Construit le titre de la liste selon les filtres
     */
    private buildListTitle(intent: {
        owner?: string;
        prefix?: string;
        status?: string;
    }): string {
        const parts = ['Jobs'];
        if (intent.prefix) { parts.push(`\`${intent.prefix}\``); }
        if (intent.owner) { parts.push(`(owner: ${intent.owner})`); }
        if (intent.status) { parts.push(`— ${intent.status}`); }
        return parts.join(' ');
    }

    /**
     * Message quand un job n'est pas trouvé
     */
    private jobNotFoundMessage(intent: { jobId?: string; jobName?: string }): string {
        if (intent.jobId) {
            return `Job \`${intent.jobId}\` non trouvé. Vérifiez l'ID ou utilisez \`/jobs liste\` pour chercher.`;
        }
        if (intent.jobName) {
            return `Aucun job récent trouvé avec le nom \`${intent.jobName}\`. Essayez \`/jobs liste les jobs ${intent.jobName}\`.`;
        }
        return `Job non trouvé. Précisez un Job ID ou un Job Name.`;
    }

    /**
     * Formate les bytes en taille lisible
     */
    private formatBytes(bytes: number): string {
        if (bytes < 1024) { return `${bytes} B`; }
        if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    /**
     * Description pour les confirmations de sécurité
     */
    private describeJobOperation(intent: JobsIntent): string {
        switch (intent.type) {
            case 'CANCEL_JOB':
                return `Annulation du job ${intent.jobName} (${intent.jobId})`;
            case 'PURGE_JOB':
                return `Purge du job ${intent.jobName} (${intent.jobId}) — spool supprimé définitivement`;
            default:
                return `Opération ${intent.type}`;
        }
    }
}
