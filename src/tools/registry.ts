import * as vscode from 'vscode';
import { List, Download } from '@zowe/zos-files-for-zowe-sdk';
import { GetJobs, SubmitJobs } from '@zowe/zos-jobs-for-zowe-sdk';
import { ZoweSessionManager } from '../zowe/session';
import { isProtectedDataset } from '../zowe/safety';
import { TelemetryService } from '../utils/telemetry';

// ============================================================
// Tool Registry — vscode.lm.registerTool
//
// Ces tools apparaissent dans le menu # de Copilot Chat
// et peuvent être invoqués automatiquement par le LLM
// en mode agentic (function calling).
//
// Complémentaire aux slash commands du Chat Participant :
//   /ds, /jobs, /run  → l'utilisateur choisit la commande
//   #zos_*            → le LLM décide quand appeler
// ============================================================

export function registerTools(
    context: vscode.ExtensionContext,
    sessionManager: ZoweSessionManager,
    telemetry: TelemetryService
) {
    // ── DATASETS ─────────────────────────────────────────────

    // LIST DATASETS
    context.subscriptions.push(
        vscode.lm.registerTool('zos_listDatasets', {
            async invoke(
                options: vscode.LanguageModelToolInvocationOptions<{
                    pattern: string;
                }>,
                token: vscode.CancellationToken
            ) {
                const { session } = await sessionManager.getSession();
                const response = await List.dataSet(
                    session, options.input.pattern, { attributes: true }
                );
                const items = response.apiResponse?.items ?? [];

                telemetry.trackSuccess('tool', 'zos_listDatasets');

                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        JSON.stringify(items.map((ds: any) => ({
                            dsname: ds.dsname,
                            dsorg: ds.dsorg,
                            recfm: ds.recfm,
                            lrecl: ds.lrecl,
                            vol: ds.vol,
                        })), null, 2)
                    )
                ]);
            }
        })
    );

    // LIST MEMBERS
    context.subscriptions.push(
        vscode.lm.registerTool('zos_listMembers', {
            async invoke(
                options: vscode.LanguageModelToolInvocationOptions<{
                    dataset: string;
                    pattern?: string;
                }>,
                token: vscode.CancellationToken
            ) {
                const { session } = await sessionManager.getSession();
                const response = await List.allMembers(
                    session, options.input.dataset,
                    { attributes: true, pattern: options.input.pattern }
                );
                const items = response.apiResponse?.items ?? [];

                telemetry.trackSuccess('tool', 'zos_listMembers');

                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        JSON.stringify(items.map((m: any) => ({
                            member: m.member,
                            changed: m.changed ?? m.m4date,
                            user: m.user,
                            init: m.init,
                        })), null, 2)
                    )
                ]);
            }
        })
    );

    // READ MEMBER
    context.subscriptions.push(
        vscode.lm.registerTool('zos_readMember', {
            async invoke(
                options: vscode.LanguageModelToolInvocationOptions<{
                    dataset: string;
                    member: string;
                }>,
                token: vscode.CancellationToken
            ) {
                const { session } = await sessionManager.getSession();
                const fullName = `${options.input.dataset}(${options.input.member})`;
                const content = await Download.dataSet(session, fullName, {
                    returnEtag: false,
                    stream: undefined as any,
                });

                const text = typeof content.apiResponse === 'string'
                    ? content.apiResponse
                    : Buffer.from(content.apiResponse).toString('utf-8');

                // Tronquer si trop long pour le contexte LLM
                const lines = text.split('\n');
                const truncated = lines.length > 1000;
                const output = truncated
                    ? lines.slice(0, 1000).join('\n') + `\n... (truncated, ${lines.length} total lines)`
                    : text;

                telemetry.trackSuccess('tool', 'zos_readMember');

                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(output)
                ]);
            }
        })
    );

    // DATASET INFO
    context.subscriptions.push(
        vscode.lm.registerTool('zos_datasetInfo', {
            async invoke(
                options: vscode.LanguageModelToolInvocationOptions<{
                    dataset: string;
                }>,
                token: vscode.CancellationToken
            ) {
                const { session } = await sessionManager.getSession();
                const response = await List.dataSet(
                    session, options.input.dataset, { attributes: true }
                );
                const ds = response.apiResponse?.items?.[0];

                telemetry.trackSuccess('tool', 'zos_datasetInfo');

                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        ds ? JSON.stringify(ds, null, 2) : 'Dataset not found'
                    )
                ]);
            }
        })
    );

    // SEARCH CONTENT
    context.subscriptions.push(
        vscode.lm.registerTool('zos_searchContent', {
            async invoke(
                options: vscode.LanguageModelToolInvocationOptions<{
                    dataset: string;
                    searchTerm: string;
                    memberPattern?: string;
                }>,
                token: vscode.CancellationToken
            ) {
                const { session } = await sessionManager.getSession();
                const { dataset, searchTerm, memberPattern } = options.input;

                const membersResp = await List.allMembers(
                    session, dataset, { pattern: memberPattern }
                );
                const members = membersResp.apiResponse?.items ?? [];
                const results: any[] = [];
                const max = Math.min(members.length, 30);

                for (let i = 0; i < max; i++) {
                    if (token.isCancellationRequested) { break; }

                    try {
                        const content = await Download.dataSet(
                            session, `${dataset}(${members[i].member})`,
                            { returnEtag: false, stream: undefined as any }
                        );
                        const text = typeof content.apiResponse === 'string'
                            ? content.apiResponse
                            : Buffer.from(content.apiResponse).toString('utf-8');

                        const lines = text.split('\n');
                        const matches = lines
                            .map((line, idx) => ({ line: idx + 1, text: line.trimEnd() }))
                            .filter(l => l.text.toUpperCase().includes(searchTerm.toUpperCase()));

                        if (matches.length > 0) {
                            results.push({
                                member: members[i].member,
                                hitCount: matches.length,
                                hits: matches.slice(0, 5),
                            });
                        }
                    } catch { /* skip unreadable members */ }
                }

                telemetry.trackSuccess('tool', 'zos_searchContent');

                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        JSON.stringify({
                            dataset,
                            searchTerm,
                            scannedMembers: max,
                            totalMembers: members.length,
                            matchingMembers: results.length,
                            results,
                        }, null, 2)
                    )
                ]);
            }
        })
    );

    // ── JOBS ─────────────────────────────────────────────────

    // LIST JOBS
    context.subscriptions.push(
        vscode.lm.registerTool('zos_listJobs', {
            async invoke(
                options: vscode.LanguageModelToolInvocationOptions<{
                    owner?: string;
                    prefix?: string;
                    status?: string;
                }>,
                token: vscode.CancellationToken
            ) {
                const { session } = await sessionManager.getSession();
                const jobs = await GetJobs.getJobsCommon(session, {
                    owner: options.input.owner,
                    prefix: options.input.prefix,
                    status: options.input.status,
                    maxJobs: 20,
                });

                telemetry.trackSuccess('tool', 'zos_listJobs');

                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        JSON.stringify(jobs.map(j => ({
                            jobname: j.jobname,
                            jobid: j.jobid,
                            owner: j.owner,
                            status: j.status,
                            retcode: j.retcode,
                            class: j.class,
                        })), null, 2)
                    )
                ]);
            }
        })
    );

    // GET JOB STATUS
    context.subscriptions.push(
        vscode.lm.registerTool('zos_getJobStatus', {
            async invoke(
                options: vscode.LanguageModelToolInvocationOptions<{
                    jobId?: string;
                    jobName?: string;
                }>,
                token: vscode.CancellationToken
            ) {
                const { session } = await sessionManager.getSession();
                let job;

                if (options.input.jobId) {
                    job = await GetJobs.getJob(session, options.input.jobId);
                } else if (options.input.jobName) {
                    const jobs = await GetJobs.getJobsCommon(session, {
                        prefix: options.input.jobName, maxJobs: 1,
                    });
                    job = jobs[0];
                }

                if (!job) {
                    return new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart('Job not found')
                    ]);
                }

                // Enrichir avec la liste des spool files
                let spoolFiles: any[] = [];
                try {
                    const sf = await GetJobs.getSpoolFilesForJob(session, job);
                    spoolFiles = sf.map(s => ({
                        ddname: s.ddname,
                        stepname: s.stepname,
                        procstep: s.procstep,
                        byteCount: s.byteCount,
                        id: s.id,
                    }));
                } catch { /* spool not available */ }

                telemetry.trackSuccess('tool', 'zos_getJobStatus');

                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(JSON.stringify({
                        jobname: job.jobname,
                        jobid: job.jobid,
                        owner: job.owner,
                        status: job.status,
                        retcode: job.retcode,
                        type: job.type,
                        class: job.class,
                        subsystem: job.subsystem,
                        spoolFiles,
                    }, null, 2))
                ]);
            }
        })
    );

    // GET JOB OUTPUT
    context.subscriptions.push(
        vscode.lm.registerTool('zos_getJobOutput', {
            async invoke(
                options: vscode.LanguageModelToolInvocationOptions<{
                    jobId?: string;
                    jobName?: string;
                    ddName?: string;
                }>,
                token: vscode.CancellationToken
            ) {
                const { session } = await sessionManager.getSession();
                let job;

                if (options.input.jobId) {
                    job = await GetJobs.getJob(session, options.input.jobId);
                } else if (options.input.jobName) {
                    const jobs = await GetJobs.getJobsCommon(session, {
                        prefix: options.input.jobName, maxJobs: 1,
                    });
                    job = jobs[0];
                }

                if (!job) {
                    return new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart('Job not found')
                    ]);
                }

                const spoolFiles = await GetJobs.getSpoolFilesForJob(session, job);

                // Filtrer par DD ou prendre les plus importants
                const target = options.input.ddName
                    ? spoolFiles.filter(
                        sf => sf.ddname.toUpperCase() === options.input.ddName!.toUpperCase()
                    )
                    : spoolFiles.filter(
                        sf => ['JESMSGLG', 'JESJCL', 'SYSPRINT', 'SYSOUT'].includes(sf.ddname)
                    ).slice(0, 4);

                const output: Record<string, string> = {};

                for (const sf of target) {
                    if (token.isCancellationRequested) { break; }

                    try {
                        const content = await GetJobs.getSpoolContentById(
                            session, job.jobname, job.jobid, sf.id
                        );

                        // Tronquer pour le contexte LLM
                        const lines = (content ?? '').split('\n');
                        const key = sf.stepname
                            ? `${sf.ddname}(${sf.stepname})`
                            : sf.ddname;

                        output[key] = lines.length > 500
                            ? lines.slice(0, 500).join('\n') + `\n... (truncated, ${lines.length} total lines)`
                            : content ?? '';
                    } catch { /* skip unreadable */ }
                }

                telemetry.trackSuccess('tool', 'zos_getJobOutput');

                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(JSON.stringify(output, null, 2))
                ]);
            }
        })
    );

    // ── SUBMIT JCL (avec confirmation) ──────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('zos_submitJcl', {

            // prepareInvocation — affiché AVANT l'exécution
            // Le tag "confirmation" dans package.json déclenche
            // l'affichage du bouton Confirm/Cancel dans le chat
            async prepareInvocation(
                options: vscode.LanguageModelToolInvocationPrepareOptions<{
                    dataset: string;
                    member?: string;
                }>,
                _token: vscode.CancellationToken
            ) {
                const fullName = options.input.member
                    ? `${options.input.dataset}(${options.input.member})`
                    : options.input.dataset;

                const isProd = isProtectedDataset(options.input.dataset);

                return {
                    invocationMessage: `Submitting JCL from ${fullName}`,
                    confirmationMessages: {
                        title: isProd
                            ? `⚠️ PRODUCTION — Submit JCL`
                            : `Submit JCL`,
                        message: new vscode.MarkdownString(
                            isProd
                                ? `**⚠️ PRODUCTION DATASET**\n\nSubmit JCL from \`${fullName}\`?\n\nThis will execute the job on the production system.`
                                : `Submit JCL from \`${fullName}\`?`
                        ),
                    },
                };
            },

            // invoke — exécuté APRÈS confirmation
            async invoke(
                options: vscode.LanguageModelToolInvocationOptions<{
                    dataset: string;
                    member?: string;
                }>,
                token: vscode.CancellationToken
            ) {
                const { session } = await sessionManager.getSession();
                const fullName = options.input.member
                    ? `${options.input.dataset}(${options.input.member})`
                    : options.input.dataset;

                const job = await SubmitJobs.submitJob(session, fullName);

                telemetry.trackSuccess('tool', 'zos_submitJcl');

                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        JSON.stringify({
                            message: `Job submitted successfully`,
                            jobname: job.jobname,
                            jobid: job.jobid,
                            owner: job.owner,
                            status: job.status,
                            class: job.class,
                            source: fullName,
                        }, null, 2)
                    )
                ]);
            }
        })
    );
}
