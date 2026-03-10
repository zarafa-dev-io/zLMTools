import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    SubmitJobs,
    GetJobs,
    MonitorJobs,
    IJob,
    IJobFile,
} from '@zowe/zos-jobs-for-zowe-sdk';
import { Download } from '@zowe/zos-files-for-zowe-sdk';
import { ZoweSessionManager } from '../zowe/session';
import { TelemetryService } from '../utils/telemetry';
import { RunIntentClassifier } from '../intents/run.classifier';
import {
    RunIntent,
    RUN_INTENT_SAFETY,
} from '../intents/run.schemas';
import {
    requestConfirmation,
    getEffectiveSafetyLevel,
    isProtectedDataset,
} from '../zowe/safety';
import { ZosChatResult, ZosFollowup, createResult, followup } from '../types/chat-result';
import { detectLanguage, Lang } from '../utils/i18n';

// ============================================================
// Handler /run — Soumission de JCL
//
// Opérations :
//   SUBMIT_DATASET      → Soumettre depuis un dataset/membre
//   SUBMIT_INLINE       → Soumettre du JCL brut
//   SUBMIT_AND_MONITOR  → Soumettre + surveiller + afficher résultat
//   RESUBMIT            → Re-soumettre le JCL d'un job précédent
// ============================================================

export class RunHandler {
    private classifier: RunIntentClassifier;
    private lang: Lang = 'fr';

    constructor(
        private sessionManager: ZoweSessionManager,
        private telemetry: TelemetryService
    ) {
        this.classifier = new RunIntentClassifier();
    }

    /** Retourne la chaîne correspondant à la langue du prompt courant. */
    private t(fr: string, en: string): string { return this.lang === 'fr' ? fr : en; }

    async handle(
        request: vscode.ChatRequest,
        chatContext: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<ZosChatResult> {
        const prompt = request.prompt.trim();
        this.lang = detectLanguage(prompt);

        if (!prompt) {
            stream.markdown(
                this.t(
                    `**Commande /run** — Soumission de JCL\n\nTapez votre requête en langage naturel après \`/run\`.`,
                    `**Command /run** — JCL Submission\n\nType your request in natural language after \`/run\`.`
                )
            );
            return createResult('run', undefined, [
                followup(this.t('🚀 Soumettre du JCL', '🚀 Submit JCL'), this.t('soumets HLQ.JCL(BATCH01)', 'submit HLQ.JCL(BATCH01)'), 'run'),
                followup(this.t('🚀 Soumettre et surveiller', '🚀 Submit and monitor'), this.t('soumets et surveille HLQ.JCL(NIGHTLY)', 'submit and monitor HLQ.JCL(NIGHTLY)'), 'run'),
                followup(this.t('🔄 Relancer un job', '🔄 Resubmit a job'), this.t('relance le job JOB12345', 'resubmit job JOB12345'), 'run'),
            ]);
        }

        // ── Step 1 : Classification ──
        stream.progress(this.t('Analyse de la requête...', 'Analyzing request...'));
        const intent = await this.classifier.classify(prompt, token, request.model);

        if (!intent) {
            stream.markdown(
                this.t(`🤔 Je n'ai pas compris votre requête de soumission.`, `🤔 I could not understand your submission request.`)
            );
            return createResult('run', undefined, [
                followup(this.t('🚀 Soumettre du JCL', '🚀 Submit JCL'), this.t('soumets HLQ.JCL(BATCH01)', 'submit HLQ.JCL(BATCH01)'), 'run'),
            ]);
        }

        // ── Step 2 : Sécurité ──
        const datasetName = this.extractDatasetName(intent);
        const baseSafety = RUN_INTENT_SAFETY[intent.type];
        const effectiveSafety = getEffectiveSafetyLevel(baseSafety, datasetName);

        const description = this.describeRunOperation(intent);
        const confirmed = await requestConfirmation(
            stream, description, effectiveSafety, datasetName
        );
        if (!confirmed) {
            return createResult('run', intent.type, []);
        }

        // ── Step 3 : Exécution ──
        stream.progress(this.t('Connexion à z/OS...', 'Connecting to z/OS...'));
        const { session, profileName } = await this.sessionManager.getSession();

        let followups: ZosFollowup[];

        switch (intent.type) {
            case 'SUBMIT_DATASET':
                followups = await this.submitDataset(session, intent.dataset, intent.member, stream);
                break;
            case 'SUBMIT_INLINE':
                followups = await this.submitInline(session, intent.jcl, stream);
                break;
            case 'SUBMIT_AND_MONITOR':
                followups = await this.submitAndMonitor(
                    session, intent.dataset, intent.member,
                    intent.autoDisplay ?? true, stream, token
                );
                break;
            case 'RESUBMIT':
                followups = await this.resubmit(session, intent, stream, token);
                break;
            case 'SUBMIT_LOCAL_FILE':
                followups = await this.submitLocalFile(session, intent.localPath, stream);
                break;
            case 'SUBMIT_LOCAL_FILE_AND_MONITOR':
                followups = await this.submitLocalFileAndMonitor(
                    session, intent.localPath, intent.autoDisplay ?? true, stream, token
                );
                break;
            default:
                followups = [];
        }

        this.telemetry.trackSuccess('run', intent.type, profileName);
        return createResult('run', intent.type, followups);
    }

    // ================================================================
    // SUBMIT_DATASET — Soumettre depuis un dataset/membre
    // ================================================================
    private async submitDataset(
        session: any,
        dataset: string,
        member: string | undefined,
        stream: vscode.ChatResponseStream
    ): Promise<ZosChatResult> {
        const fullName = member ? `${dataset}(${member})` : dataset;

        stream.progress(this.t(`Soumission de ${fullName}...`, `Submitting ${fullName}...`));

        const job: IJob = await SubmitJobs.submitJob(session, fullName);

        return this.displaySubmitResult(job, fullName, stream);
    }

    // ================================================================
    // SUBMIT_INLINE — Soumettre du JCL brut
    // ================================================================
    private async submitInline(
        session: any,
        jcl: string,
        stream: vscode.ChatResponseStream
    ): Promise<ZosChatResult> {
        // Valider le JCL minimal
        if (!jcl.includes('//') || !jcl.includes(' JOB ')) {
            stream.markdown(
                this.t(
                    `⚠️ Le JCL fourni semble incomplet. Un JCL valide doit contenir au minimum une carte JOB (\`//jobname JOB ...\`).\n\nExemple minimal :\n\`\`\`jcl\n//MYJOB   JOB (ACCT),'DESC',CLASS=A,MSGCLASS=X\n//STEP01  EXEC PGM=IEFBR14\n\`\`\`\n`,
                    `⚠️ The provided JCL seems incomplete. A valid JCL must include at least a JOB card (\`//jobname JOB ...\`).\n\nMinimal example:\n\`\`\`jcl\n//MYJOB   JOB (ACCT),'DESC',CLASS=A,MSGCLASS=X\n//STEP01  EXEC PGM=IEFBR14\n\`\`\`\n`
                )
            );
            return [];
        }

        stream.progress(this.t('Soumission du JCL inline...', 'Submitting inline JCL...'));

        const job: IJob = await SubmitJobs.submitJcl(session, jcl);

        // Afficher le JCL soumis (tronqué)
        const lines = jcl.split('\n');
        const preview = lines.slice(0, 10).join('\n');
        const truncated = lines.length > 10;

        stream.markdown(`### ${this.t('JCL soumis', 'Submitted JCL')}\n\n`);
        stream.markdown(
            `\`\`\`jcl\n${preview}${truncated ? `\n... (${lines.length} ${this.t('lignes', 'lines')})` : ''}\n\`\`\`\n\n`
        );

        return this.displaySubmitResult(job, 'JCL inline', stream);
    }

    // ================================================================
    // SUBMIT_AND_MONITOR — Soumettre + surveiller + afficher
    // ================================================================
    private async submitAndMonitor(
        session: any,
        dataset: string,
        member: string | undefined,
        autoDisplay: boolean,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<ZosChatResult> {
        const fullName = member ? `${dataset}(${member})` : dataset;

        // Phase 1 : Soumission
        stream.progress(`Soumission de ${fullName}...`);
        const job: IJob = await SubmitJobs.submitJob(session, fullName);

        stream.markdown(
            `🚀 **${this.t('Job soumis', 'Job submitted')}** — \`${job.jobname}\` (\`${job.jobid}\`)\n\n` +
            `${this.t('Source', 'Source')} : \`${fullName}\`\n\n`
        );

        return this.monitorSubmittedJob(session, job, autoDisplay, stream, token);
    }

    // ================================================================
    // Boucle de monitoring partagée (submitAndMonitor + submitLocalFileAndMonitor)
    // ================================================================
    private async monitorSubmittedJob(
        session: any,
        job: IJob,
        autoDisplay: boolean,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<ZosFollowup[]> {
        stream.markdown(`---\n\n### ⏳ ${this.t('Surveillance en cours...', 'Monitoring...')}\n\n`);

        const MAX_WAIT_MS = 10 * 60 * 1000;
        const POLL_INTERVAL_MS = 5000;
        const startTime = Date.now();
        let lastStatus = job.status;
        let completedJob: IJob | null = null;

        while (!token.isCancellationRequested) {
            const elapsed = Date.now() - startTime;

            if (elapsed > MAX_WAIT_MS) {
                stream.markdown(
                    this.t(
                        `\n⏰ **Timeout** — Le job est toujours en cours après 10 minutes.\nVérifiez avec \`/jobs statut de ${job.jobid}\``,
                        `\n⏰ **Timeout** — The job is still running after 10 minutes.\nCheck with \`/jobs status of ${job.jobid}\``
                    )
                );
                return [];
            }

            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

            try {
                const currentJob = await GetJobs.getJob(session, job.jobid);

                if (currentJob.status !== lastStatus) {
                    const elapsed_s = Math.round(elapsed / 1000);
                    stream.progress(
                        `${this.getStatusEmoji(currentJob.status, currentJob.retcode)} ` +
                        `${currentJob.status} (${elapsed_s}s)`
                    );
                    lastStatus = currentJob.status ?? lastStatus;
                }

                if (currentJob.status === 'OUTPUT') {
                    completedJob = currentJob;
                    break;
                }
            } catch (error) {
                console.warn('[zos/run] Monitor poll error:', error);
            }
        }

        if (token.isCancellationRequested) {
            stream.markdown(this.t('\n❌ Surveillance annulée.', '\n❌ Monitoring cancelled.'));
            return [];
        }

        if (!completedJob) { return []; }

        const elapsed_s = Math.round((Date.now() - startTime) / 1000);
        const rc = this.formatReturnCode(completedJob);
        const emoji = this.getStatusEmoji(completedJob.status, completedJob.retcode);
        const isError = completedJob.retcode != null && !completedJob.retcode.startsWith('CC 0000');

        stream.markdown(
            `\n${emoji} **${this.t('Job terminé', 'Job completed')}** — \`${completedJob.jobname}\` (\`${completedJob.jobid}\`) ` +
            `→ **${rc}** ${this.t('en', 'in')} ${elapsed_s}s\n\n`
        );

        if (autoDisplay) {
            await this.displayJobSpool(session, completedJob, isError, stream);
        } else if (isError) {
            stream.markdown(
                this.t(
                    `⚠️ Le job a terminé en erreur. \`/jobs montre le JESMSGLG de ${completedJob.jobid}\` pour diagnostiquer.\n`,
                    `⚠️ The job ended with an error. \`/jobs show JESMSGLG of ${completedJob.jobid}\` to diagnose.\n`
                )
            );
        }

        return [
            followup(this.t(`🔍 Statut de ${completedJob.jobid}`, `🔍 Status of ${completedJob.jobid}`), this.t(`statut de ${completedJob.jobid}`, `status of ${completedJob.jobid}`), 'jobs'),
            followup(this.t(`📜 Spool de ${completedJob.jobid}`, `📜 Spool of ${completedJob.jobid}`), this.t(`montre la sortie de ${completedJob.jobid}`, `show output of ${completedJob.jobid}`), 'jobs'),
        ];
    }

    // ================================================================
    // RESUBMIT — Re-soumettre le JCL d'un job précédent
    // ================================================================
    private async resubmit(
        session: any,
        intent: { jobId?: string; jobName?: string },
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<ZosChatResult> {
        // Résoudre le job original
        const originalJob = await this.resolveJob(session, intent);

        if (!originalJob) {
            if (intent.jobId) {
                stream.markdown(this.t(`Job \`${intent.jobId}\` non trouvé.`, `Job \`${intent.jobId}\` not found.`));
            } else {
                stream.markdown(this.t(`Aucun job récent trouvé pour \`${intent.jobName}\`.`, `No recent job found for \`${intent.jobName}\`.`));
            }
            return [];
        }

        // Récupérer le JCL original depuis le spool (JESJCL)
        stream.progress(this.t(`Récupération du JCL de ${originalJob.jobid}...`, `Fetching JCL of ${originalJob.jobid}...`));

        const spoolFiles = await GetJobs.getSpoolFilesForJob(session, originalJob);
        const jesjcl = spoolFiles.find(sf => sf.ddname === 'JESJCL');

        if (!jesjcl) {
            stream.markdown(
                this.t(
                    `⚠️ Impossible de trouver le JESJCL du job \`${originalJob.jobid}\`.\nLe spool a peut-être été purgé.`,
                    `⚠️ Unable to find JESJCL for job \`${originalJob.jobid}\`.\nThe spool may have been purged.`
                )
            );
            return [];
        }

        const jclContent = await GetJobs.getSpoolContentById(
            session,
            originalJob.jobname,
            originalJob.jobid,
            jesjcl.id
        );

        if (!jclContent || jclContent.trim().length === 0) {
            stream.markdown(this.t(`⚠️ Le JESJCL de \`${originalJob.jobid}\` est vide.`, `⚠️ The JESJCL of \`${originalJob.jobid}\` is empty.`));
            return [];
        }

        // Nettoyer le JCL (le JESJCL contient parfois des headers JES)
        const cleanedJcl = this.cleanJesJcl(jclContent);

        // Afficher un aperçu
        const previewLines = cleanedJcl.split('\n').slice(0, 8);
        stream.markdown(
            `### ${this.t(`Re-soumission de \`${originalJob.jobname}\` (\`${originalJob.jobid}\`)`, `Resubmission of \`${originalJob.jobname}\` (\`${originalJob.jobid}\`)`)}\n\n` +
            `${this.t('JCL original (aperçu) :', 'Original JCL (preview):')}\n` +
            `\`\`\`jcl\n${previewLines.join('\n')}\n...\n\`\`\`\n\n`
        );

        stream.progress(this.t('Soumission...', 'Submitting...'));
        const newJob: IJob = await SubmitJobs.submitJcl(session, cleanedJcl);

        stream.markdown(
            `🚀 **${this.t('Nouveau job soumis', 'New job submitted')}** — \`${newJob.jobname}\` (\`${newJob.jobid}\`)\n\n` +
            this.t(`Re-soumission du JCL de \`${originalJob.jobid}\``, `Resubmission of JCL from \`${originalJob.jobid}\``) + `\n\n` +
            `| | ${this.t('Job original', 'Original job')} | ${this.t('Nouveau job', 'New job')} |\n` +
            `|---|---|---|\n` +
            `| Job ID | \`${originalJob.jobid}\` | \`${newJob.jobid}\` |\n` +
            `| Job Name | \`${originalJob.jobname}\` | \`${newJob.jobname}\` |\n` +
            `| ${this.t('RC original', 'Original RC')} | ${this.formatReturnCode(originalJob)} | *(${this.t('en cours', 'in progress')})* |\n\n` +
            this.t(`💡 \`/jobs surveille ${newJob.jobid} ${newJob.jobname}\` pour suivre l'exécution.\n`, `💡 \`/jobs monitor ${newJob.jobid} ${newJob.jobname}\` to track execution.\n`)
        );
    }

    // ================================================================
    // Affichage intelligent du spool après exécution
    // ================================================================
    private async displayJobSpool(
        session: any,
        job: IJob,
        isError: boolean,
        stream: vscode.ChatResponseStream
    ): Promise<ZosChatResult> {
        try {
            const spoolFiles = await GetJobs.getSpoolFilesForJob(session, job);

            if (spoolFiles.length === 0) {
                stream.markdown(`*${this.t('Aucun spool file disponible.', 'No spool file available.')}*`);
                return [];
            }

            stream.markdown(`---\n\n### 📜 Spool\n\n`);

            // Stratégie d'affichage selon le contexte
            // En erreur : JESMSGLG prioritaire pour le diagnostic
            // En succès : SYSPRINT / SYSOUT pour les résultats
            const priorityDDs = isError
                ? ['JESMSGLG', 'JESYSMSG', 'SYSPRINT', 'SYSOUT', 'SYSTSPRT']
                : ['SYSPRINT', 'SYSOUT', 'SYSTSPRT', 'JESMSGLG'];

            const displayed = new Set<number>();
            let displayCount = 0;
            const MAX_DISPLAY = 4; // limiter l'affichage automatique

            // Afficher les DD prioritaires
            for (const ddName of priorityDDs) {
                if (displayCount >= MAX_DISPLAY) { break; }

                const matching = spoolFiles.filter(
                    sf => sf.ddname === ddName && !displayed.has(sf.id)
                );

                for (const sf of matching) {
                    if (displayCount >= MAX_DISPLAY) { break; }
                    await this.displaySpoolContent(session, job, sf, stream);
                    displayed.add(sf.id);
                    displayCount++;
                }
            }

            // Lister les non-affichés
            const remaining = spoolFiles.filter(sf => !displayed.has(sf.id));
            if (remaining.length > 0) {
                stream.markdown(`\n**${this.t('Autres spool files', 'Other spool files')} :** `);
                stream.markdown(
                    remaining.map(sf => `\`${sf.ddname}\``).join(', ') + `\n\n`
                );
                stream.markdown(
                    this.t(`💡 \`/jobs affiche le <DDNAME> de ${job.jobid}\` pour voir le contenu.\n`, `💡 \`/jobs show <DDNAME> of ${job.jobid}\` to view content.\n`)
                );
            }
        } catch (error) {
            stream.markdown(`\n⚠️ ${this.t('Impossible de récupérer le spool', 'Unable to retrieve spool')} : ${(error as any)?.message}`);
        }
    }

    /**
     * Affiche le contenu d'un spool file avec troncature intelligente
     */
    private async displaySpoolContent(
        session: any,
        job: IJob,
        spoolFile: IJobFile,
        stream: vscode.ChatResponseStream
    ): Promise<ZosChatResult> {
        try {
            const content = await GetJobs.getSpoolContentById(
                session,
                job.jobname,
                job.jobid,
                spoolFile.id
            );

            if (!content || content.trim().length === 0) {
                return; // skip empty
            }

            const lines = content.split('\n');
            const stepInfo = spoolFile.stepname ? ` / ${spoolFile.stepname}` : '';
            const lineCount = lines.length;

            stream.markdown(`\n#### 📄 \`${spoolFile.ddname}\`${stepInfo} — ${lineCount} ${this.t('lignes', 'lines')}\n\n`);

            // Troncature intelligente
            if (lineCount <= 100) {
                stream.markdown(`\`\`\`\n${content}\n\`\`\`\n`);
            } else if (spoolFile.ddname === 'JESMSGLG' || spoolFile.ddname === 'JESYSMSG') {
                const tail = lines.slice(-80).join('\n');
                stream.markdown(
                    `\`\`\`\n... (${lineCount - 80} ${this.t('lignes masquées', 'hidden lines')})\n\n${tail}\n\`\`\`\n`
                );
            } else {
                const head = lines.slice(0, 40).join('\n');
                const tail = lines.slice(-40).join('\n');
                stream.markdown(
                    `\`\`\`\n${head}\n\n... (${lineCount - 80} ${this.t('lignes masquées', 'hidden lines')})\n\n${tail}\n\`\`\`\n`
                );
            }
        } catch {
            stream.markdown(`\n**${spoolFile.ddname}** — ⚠️ ${this.t('Lecture impossible.', 'Unable to read.')}\n`);
        }
    }

    // ================================================================
    // Utilitaires
    // ================================================================

    /**
     * Affiche le résultat d'une soumission simple
     */
    private displaySubmitResult(
        job: IJob,
        source: string,
        stream: vscode.ChatResponseStream
    ): ZosFollowup[] {
        stream.markdown(
            `🚀 **${this.t('Job soumis', 'Job submitted')}** — \`${job.jobname}\` (\`${job.jobid}\`)\n\n` +
            `| ${this.t('Propriété', 'Property')} | ${this.t('Valeur', 'Value')} |\n` +
            `|-----------|--------|\n` +
            `| ${this.t('Source', 'Source')} | \`${source}\` |\n` +
            `| Job Name | \`${job.jobname}\` |\n` +
            `| Job ID | \`${job.jobid}\` |\n` +
            `| Owner | \`${job.owner ?? '-'}\` |\n` +
            `| ${this.t('Classe', 'Class')} | \`${job.class ?? '-'}\` |\n` +
            `| ${this.t('Statut', 'Status')} | ${this.getStatusEmoji(job.status, null)} ${job.status ?? 'INPUT'} |\n`
        );

        return [
            followup(this.t(`⏳ Surveiller ${job.jobid}`, `⏳ Monitor ${job.jobid}`), this.t(`surveille ${job.jobid} ${job.jobname}`, `monitor ${job.jobid} ${job.jobname}`), 'jobs'),
            followup(this.t(`🔍 Statut de ${job.jobid}`, `🔍 Status of ${job.jobid}`), this.t(`statut de ${job.jobid}`, `status of ${job.jobid}`), 'jobs'),
            followup(this.t(`📜 Spool de ${job.jobid}`, `📜 Spool of ${job.jobid}`), this.t(`montre la sortie de ${job.jobid}`, `show output of ${job.jobid}`), 'jobs'),
        ];
    }

    /**
     * Résout un job par ID ou par nom
     */
    private async resolveJob(
        session: any,
        intent: { jobId?: string; jobName?: string }
    ): Promise<IJob | null> {
        if (intent.jobId) {
            try {
                return await GetJobs.getJob(session, intent.jobId);
            } catch {
                return null;
            }
        }

        if (intent.jobName) {
            const jobs = await GetJobs.getJobsCommon(session, {
                prefix: intent.jobName,
                maxJobs: 5,
            });
            return jobs.length > 0 ? jobs[0] : null;
        }

        return null;
    }

    /**
     * Nettoie le JESJCL pour re-soumission
     * Le JESJCL contient des headers JES et des numéros de ligne
     * qu'il faut supprimer avant de re-soumettre
     */
    private cleanJesJcl(rawJcl: string): string {
        const lines = rawJcl.split('\n');
        const cleanedLines: string[] = [];

        for (const line of lines) {
            // Ignorer les lignes de header JES (commencent par des espaces + numéros)
            // Les lignes JCL valides commencent par // ou /*
            // ou sont des données (entre DD * et /*)

            // Supprimer les numéros de séquence en fin de ligne (col 73-80)
            let cleanLine = line;

            // Le JESJCL ajoute parfois un préfixe avec numéros
            // Pattern typique : "        1 //MYJOB JOB ..."
            const jesLinePattern = /^\s+\d+\s+(\/\/.*)$/;
            const match = cleanLine.match(jesLinePattern);
            if (match) {
                cleanLine = match[1];
            }

            // Garder les lignes JCL et les données
            if (cleanLine.startsWith('//') ||
                cleanLine.startsWith('/*') ||
                cleanLine.startsWith(' ') ||  // continuation ou données
                cleanLine.trim().length === 0) {
                cleanedLines.push(cleanLine);
            }
        }

        // Supprimer les lignes vides en début et fin
        const result = cleanedLines.join('\n').trim();

        return result;
    }

    // ================================================================
    // SUBMIT_LOCAL_FILE — Soumettre un fichier JCL local
    // ================================================================
    private async submitLocalFile(
        session: any,
        localPath: string,
        stream: vscode.ChatResponseStream
    ): Promise<ZosFollowup[]> {
        const jcl = this.readLocalJcl(localPath, stream);
        if (!jcl) { return []; }

        const fileName = path.basename(localPath);
        stream.progress(this.t(`Soumission de ${fileName}...`, `Submitting ${fileName}...`));
        const job: IJob = await SubmitJobs.submitJcl(session, jcl);

        const lines = jcl.split('\n');
        const preview = lines.slice(0, 10).join('\n');
        stream.markdown(
            `### ${this.t(`JCL soumis — \`${fileName}\``, `Submitted JCL — \`${fileName}\``)}\n\n` +
            `\`\`\`jcl\n${preview}${lines.length > 10 ? `\n... (${lines.length} ${this.t('lignes au total', 'lines total')})` : ''}\n\`\`\`\n\n`
        );

        return this.displaySubmitResult(job, fileName, stream);
    }

    // ================================================================
    // SUBMIT_LOCAL_FILE_AND_MONITOR — Soumettre + surveiller
    // ================================================================
    private async submitLocalFileAndMonitor(
        session: any,
        localPath: string,
        autoDisplay: boolean,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<ZosFollowup[]> {
        const jcl = this.readLocalJcl(localPath, stream);
        if (!jcl) { return []; }

        const fileName = path.basename(localPath);
        stream.progress(this.t(`Soumission de ${fileName}...`, `Submitting ${fileName}...`));
        const job: IJob = await SubmitJobs.submitJcl(session, jcl);

        stream.markdown(
            `🚀 **${this.t('Job soumis', 'Job submitted')}** — \`${job.jobname}\` (\`${job.jobid}\`)\n\n` +
            `${this.t('Source', 'Source')}: \`${fileName}\`\n\n`
        );

        return this.monitorSubmittedJob(session, job, autoDisplay, stream, token);
    }

    /**
     * Lit un fichier JCL local et valide sa structure minimale.
     * Retourne le contenu ou null si erreur (avec message dans stream).
     */
    private readLocalJcl(localPath: string, stream: vscode.ChatResponseStream): string | null {
        const filePath = this.resolveLocalPath(localPath);

        if (!fs.existsSync(filePath)) {
            stream.markdown(this.t(`❌ Fichier introuvable : \`${filePath}\``, `❌ File not found: \`${filePath}\``));
            return null;
        }

        const jcl = fs.readFileSync(filePath, 'utf-8');

        if (!jcl.includes('//') || !jcl.includes(' JOB ')) {
            stream.markdown(
                this.t(
                    `⚠️ \`${path.basename(filePath)}\` ne semble pas contenir de JCL valide.\n\nUn JCL valide doit contenir au minimum une carte JOB (\`//jobname JOB ...\`).`,
                    `⚠️ \`${path.basename(filePath)}\` does not appear to contain valid JCL.\n\nA valid JCL must include at least a JOB card (\`//jobname JOB ...\`).`
                )
            );
            return null;
        }

        return jcl;
    }

    private resolveLocalPath(localPath: string): string {
        if (path.isAbsolute(localPath)) { return localPath; }
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        return workspaceRoot ? path.join(workspaceRoot, localPath) : localPath;
    }

    /**
     * Extrait le nom du dataset pour le safety check
     */
    private extractDatasetName(intent: RunIntent): string {
        switch (intent.type) {
            case 'SUBMIT_DATASET':
            case 'SUBMIT_AND_MONITOR':
                return intent.dataset;
            case 'SUBMIT_INLINE':
                return ''; // pas de dataset à protéger
            case 'RESUBMIT':
                return ''; // on vérifie à l'exécution
            case 'SUBMIT_LOCAL_FILE':
            case 'SUBMIT_LOCAL_FILE_AND_MONITOR':
                return ''; // fichier local, pas de dataset z/OS
        }
    }

    /**
     * Description pour les confirmations
     */
    private describeRunOperation(intent: RunIntent): string {
        switch (intent.type) {
            case 'SUBMIT_DATASET': {
                const fullName = intent.member ? `${intent.dataset}(${intent.member})` : intent.dataset;
                return this.t(`Soumission du JCL \`${fullName}\``, `Submit JCL \`${fullName}\``);
            }
            case 'SUBMIT_INLINE':
                return this.t('Soumission de JCL inline', 'Submit inline JCL');
            case 'SUBMIT_AND_MONITOR': {
                const fullName = intent.member ? `${intent.dataset}(${intent.member})` : intent.dataset;
                return this.t(`Soumission et surveillance de \`${fullName}\``, `Submit and monitor \`${fullName}\``);
            }
            case 'RESUBMIT':
                return this.t(`Re-soumission du JCL de ${intent.jobId ?? intent.jobName ?? '?'}`, `Resubmit JCL of ${intent.jobId ?? intent.jobName ?? '?'}`);
            case 'SUBMIT_LOCAL_FILE':
                return this.t(`Soumission du fichier JCL local \`${intent.localPath}\``, `Submit local JCL file \`${intent.localPath}\``);
            case 'SUBMIT_LOCAL_FILE_AND_MONITOR':
                return this.t(`Soumission et surveillance du fichier JCL local \`${intent.localPath}\``, `Submit and monitor local JCL file \`${intent.localPath}\``);
        }
    }

    private formatReturnCode(job: IJob): string {
        if (!job.retcode) {
            return job.status === 'ACTIVE' ? `*(${this.t('en cours', 'in progress')})*` : '-';
        }
        return `\`${job.retcode}\``;
    }

    private getStatusEmoji(status?: string, retcode?: string | null): string {
        if (status === 'ACTIVE') { return '🔄'; }
        if (status === 'INPUT') { return '⏳'; }
        if (!retcode) { return '🚀'; }
        if (retcode === 'CC 0000') { return '✅'; }
        if (retcode.startsWith('CC 0004')) { return '🟡'; }
        if (retcode.startsWith('CC 00')) { return '🟠'; }
        if (retcode.includes('ABEND')) { return '🔴'; }
        if (retcode.includes('JCL ERROR')) { return '🔴'; }
        if (retcode.includes('CANCEL')) { return '❌'; }
        return '🟠';
    }
}
