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

    constructor(
        private sessionManager: ZoweSessionManager,
        private telemetry: TelemetryService
    ) {
        this.classifier = new RunIntentClassifier();
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
                `**Commande /run** — Soumission de JCL\n\n` +
                `Tapez votre requête en langage naturel après \`/run\`.`
            );
            return createResult('run', undefined, [
                followup('🚀 Soumettre du JCL', 'soumets HLQ.JCL(BATCH01)', 'run'),
                followup('🚀 Soumettre et surveiller', 'soumets et surveille HLQ.JCL(NIGHTLY)', 'run'),
                followup('🔄 Relancer un job', 'relance le job JOB12345', 'run'),
            ]);
        }

        // ── Step 1 : Classification ──
        stream.progress('Analyse de la requête...');
        const intent = await this.classifier.classify(prompt, token);

        if (!intent) {
            stream.markdown(
                `🤔 Je n'ai pas compris votre requête de soumission.`
            );
            return createResult('run', undefined, [
                followup('🚀 Soumettre du JCL', 'soumets HLQ.JCL(BATCH01)', 'run'),
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
        stream.progress('Connexion à z/OS...');
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

        stream.progress(`Soumission de ${fullName}...`);

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
                `⚠️ Le JCL fourni semble incomplet. Un JCL valide doit contenir ` +
                `au minimum une carte JOB (\`//jobname JOB ...\`).\n\n` +
                `Exemple minimal :\n` +
                `\`\`\`jcl\n` +
                `//MYJOB   JOB (ACCT),'DESC',CLASS=A,MSGCLASS=X\n` +
                `//STEP01  EXEC PGM=IEFBR14\n` +
                `\`\`\`\n`
            );
            return [];
        }

        stream.progress('Soumission du JCL inline...');

        const job: IJob = await SubmitJobs.submitJcl(session, jcl);

        // Afficher le JCL soumis (tronqué)
        const lines = jcl.split('\n');
        const preview = lines.slice(0, 10).join('\n');
        const truncated = lines.length > 10;

        stream.markdown(`### JCL soumis\n\n`);
        stream.markdown(
            `\`\`\`jcl\n${preview}${truncated ? '\n... (' + lines.length + ' lignes)' : ''}\n\`\`\`\n\n`
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
            `🚀 **Job soumis** — \`${job.jobname}\` (\`${job.jobid}\`)\n\n` +
            `Source : \`${fullName}\`\n\n`
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
        stream.markdown(`---\n\n### ⏳ Surveillance en cours...\n\n`);

        const MAX_WAIT_MS = 10 * 60 * 1000;
        const POLL_INTERVAL_MS = 5000;
        const startTime = Date.now();
        let lastStatus = job.status;
        let completedJob: IJob | null = null;

        while (!token.isCancellationRequested) {
            const elapsed = Date.now() - startTime;

            if (elapsed > MAX_WAIT_MS) {
                stream.markdown(
                    `\n⏰ **Timeout** — Le job est toujours en cours après 10 minutes.\n` +
                    `Vérifiez avec \`/jobs statut de ${job.jobid}\``
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
            stream.markdown('\n❌ Surveillance annulée.');
            return [];
        }

        if (!completedJob) { return []; }

        const elapsed_s = Math.round((Date.now() - startTime) / 1000);
        const rc = this.formatReturnCode(completedJob);
        const emoji = this.getStatusEmoji(completedJob.status, completedJob.retcode);
        const isError = completedJob.retcode != null && !completedJob.retcode.startsWith('CC 0000');

        stream.markdown(
            `\n${emoji} **Job terminé** — \`${completedJob.jobname}\` (\`${completedJob.jobid}\`) ` +
            `→ **${rc}** en ${elapsed_s}s\n\n`
        );

        if (autoDisplay) {
            await this.displayJobSpool(session, completedJob, isError, stream);
        } else if (isError) {
            stream.markdown(
                `⚠️ Le job a terminé en erreur. ` +
                `\`/jobs montre le JESMSGLG de ${completedJob.jobid}\` pour diagnostiquer.\n`
            );
        }

        return [
            followup(`🔍 Statut de ${completedJob.jobid}`, `statut de ${completedJob.jobid}`, 'jobs'),
            followup(`📜 Spool de ${completedJob.jobid}`, `montre la sortie de ${completedJob.jobid}`, 'jobs'),
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
                stream.markdown(`Job \`${intent.jobId}\` non trouvé.`);
            } else {
                stream.markdown(`Aucun job récent trouvé pour \`${intent.jobName}\`.`);
            }
            return [];
        }

        // Récupérer le JCL original depuis le spool (JESJCL)
        stream.progress(`Récupération du JCL de ${originalJob.jobid}...`);

        const spoolFiles = await GetJobs.getSpoolFilesForJob(session, originalJob);
        const jesjcl = spoolFiles.find(sf => sf.ddname === 'JESJCL');

        if (!jesjcl) {
            stream.markdown(
                `⚠️ Impossible de trouver le JESJCL du job \`${originalJob.jobid}\`.\n` +
                `Le spool a peut-être été purgé.`
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
            stream.markdown(`⚠️ Le JESJCL de \`${originalJob.jobid}\` est vide.`);
            return [];
        }

        // Nettoyer le JCL (le JESJCL contient parfois des headers JES)
        const cleanedJcl = this.cleanJesJcl(jclContent);

        // Afficher un aperçu
        const previewLines = cleanedJcl.split('\n').slice(0, 8);
        stream.markdown(
            `### Re-soumission de \`${originalJob.jobname}\` (\`${originalJob.jobid}\`)\n\n` +
            `JCL original (aperçu) :\n` +
            `\`\`\`jcl\n${previewLines.join('\n')}\n...\n\`\`\`\n\n`
        );

        // Soumettre
        stream.progress('Soumission...');
        const newJob: IJob = await SubmitJobs.submitJcl(session, cleanedJcl);

        stream.markdown(
            `🚀 **Nouveau job soumis** — \`${newJob.jobname}\` (\`${newJob.jobid}\`)\n\n` +
            `Re-soumission du JCL de \`${originalJob.jobid}\`\n\n` +
            `| | Job original | Nouveau job |\n` +
            `|---|---|---|\n` +
            `| Job ID | \`${originalJob.jobid}\` | \`${newJob.jobid}\` |\n` +
            `| Job Name | \`${originalJob.jobname}\` | \`${newJob.jobname}\` |\n` +
            `| RC original | ${this.formatReturnCode(originalJob)} | *(en cours)* |\n\n` +
            `💡 \`/jobs surveille ${newJob.jobid} ${newJob.jobname}\` pour suivre l'exécution.\n`
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
                stream.markdown(`*Aucun spool file disponible.*`);
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
                stream.markdown(`\n**Autres spool files :** `);
                stream.markdown(
                    remaining.map(sf => `\`${sf.ddname}\``).join(', ') + `\n\n`
                );
                stream.markdown(
                    `💡 \`/jobs affiche le <DDNAME> de ${job.jobid}\` pour voir le contenu.\n`
                );
            }
        } catch (error) {
            stream.markdown(`\n⚠️ Impossible de récupérer le spool : ${(error as any)?.message}`);
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

            stream.markdown(`\n#### 📄 \`${spoolFile.ddname}\`${stepInfo} — ${lineCount} lignes\n\n`);

            // Troncature intelligente
            if (lineCount <= 100) {
                stream.markdown(`\`\`\`\n${content}\n\`\`\`\n`);
            } else if (spoolFile.ddname === 'JESMSGLG' || spoolFile.ddname === 'JESYSMSG') {
                // Pour les messages système : garder les dernières lignes (erreurs en fin)
                const tail = lines.slice(-80).join('\n');
                stream.markdown(
                    `\`\`\`\n... (${lineCount - 80} lignes masquées)\n\n${tail}\n\`\`\`\n`
                );
            } else {
                // Pour les autres : début + fin
                const head = lines.slice(0, 40).join('\n');
                const tail = lines.slice(-40).join('\n');
                stream.markdown(
                    `\`\`\`\n${head}\n\n... (${lineCount - 80} lignes masquées)\n\n${tail}\n\`\`\`\n`
                );
            }
        } catch {
            stream.markdown(`\n**${spoolFile.ddname}** — ⚠️ Lecture impossible.\n`);
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
            `🚀 **Job soumis** — \`${job.jobname}\` (\`${job.jobid}\`)\n\n` +
            `| Propriété | Valeur |\n` +
            `|-----------|--------|\n` +
            `| Source | \`${source}\` |\n` +
            `| Job Name | \`${job.jobname}\` |\n` +
            `| Job ID | \`${job.jobid}\` |\n` +
            `| Owner | \`${job.owner ?? '-'}\` |\n` +
            `| Classe | \`${job.class ?? '-'}\` |\n` +
            `| Statut | ${this.getStatusEmoji(job.status, null)} ${job.status ?? 'INPUT'} |\n`
        );

        return [
            followup(`⏳ Surveiller ${job.jobid}`, `surveille ${job.jobid} ${job.jobname}`, 'jobs'),
            followup(`🔍 Statut de ${job.jobid}`, `statut de ${job.jobid}`, 'jobs'),
            followup(`📜 Spool de ${job.jobid}`, `montre la sortie de ${job.jobid}`, 'jobs'),
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
        stream.progress(`Submitting ${fileName}...`);
        const job: IJob = await SubmitJobs.submitJcl(session, jcl);

        const lines = jcl.split('\n');
        const preview = lines.slice(0, 10).join('\n');
        stream.markdown(
            `### Submitted JCL — \`${fileName}\`\n\n` +
            `\`\`\`jcl\n${preview}${lines.length > 10 ? `\n... (${lines.length} lines total)` : ''}\n\`\`\`\n\n`
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
        stream.progress(`Submitting ${fileName}...`);
        const job: IJob = await SubmitJobs.submitJcl(session, jcl);

        stream.markdown(
            `🚀 **Job submitted** — \`${job.jobname}\` (\`${job.jobid}\`)\n\n` +
            `Source: \`${fileName}\`\n\n`
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
            stream.markdown(`❌ File not found: \`${filePath}\``);
            return null;
        }

        const jcl = fs.readFileSync(filePath, 'utf-8');

        if (!jcl.includes('//') || !jcl.includes(' JOB ')) {
            stream.markdown(
                `⚠️ \`${path.basename(filePath)}\` does not appear to contain valid JCL.\n\n` +
                `A valid JCL must include at least a JOB card (\`//jobname JOB ...\`).`
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
                const fullName = intent.member
                    ? `${intent.dataset}(${intent.member})`
                    : intent.dataset;
                return `Soumission du JCL \`${fullName}\``;
            }
            case 'SUBMIT_INLINE':
                return `Soumission de JCL inline`;
            case 'SUBMIT_AND_MONITOR': {
                const fullName = intent.member
                    ? `${intent.dataset}(${intent.member})`
                    : intent.dataset;
                return `Soumission et surveillance de \`${fullName}\``;
            }
            case 'RESUBMIT':
                return `Re-soumission du JCL de ${intent.jobId ?? intent.jobName ?? '?'}`;
            case 'SUBMIT_LOCAL_FILE':
                return `Submit local JCL file \`${intent.localPath}\``;
            case 'SUBMIT_LOCAL_FILE_AND_MONITOR':
                return `Submit and monitor local JCL file \`${intent.localPath}\``;
        }
    }

    private formatReturnCode(job: IJob): string {
        if (!job.retcode) {
            return job.status === 'ACTIVE' ? '*(en cours)*' : '-';
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
