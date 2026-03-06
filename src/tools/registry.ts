import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { List, Download, Upload } from '@zowe/zos-files-for-zowe-sdk';
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

/** Déduit l'extension locale à partir des qualificateurs du nom de PDS. */
function pdsExtension(dataset: string): string {
    for (const part of dataset.toUpperCase().split('.')) {
        if (/^(COBOL|CBL|COB)$/.test(part))            { return '.cbl'; }
        if (/^(JCL|CNTL|JCLLIB)$/.test(part))          { return '.jcl'; }
        if (/^(PROC|PROCLIB)$/.test(part))              { return '.proc'; }
        if (/^(ASM|ASSEM|MACLIB|MAC)$/.test(part))      { return '.asm'; }
        if (/^(COPY|CPY|COPYBOOK|COPYLIB)$/.test(part)) { return '.cpy'; }
        if (/^(PLI|PL1)$/.test(part))                   { return '.pli'; }
        if (/^(REXX|EXEC)$/.test(part))                 { return '.rexx'; }
        if (/^(XML)$/.test(part))                       { return '.xml'; }
    }
    return '.txt';
}

/** Renomme les fichiers déposés par le SDK : majuscules + extension PDS. */
function renameDownloadedFiles(dir: string, dataset: string): string[] {
    const ext = pdsExtension(dataset);
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isFile())
        .map(e => {
            const oldPath = path.join(dir, e.name);
            const newName = path.basename(e.name, path.extname(e.name)).toUpperCase() + ext;
            const newPath = path.join(dir, newName);
            if (oldPath !== newPath) { fs.renameSync(oldPath, newPath); }
            return newName;
        });
}

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

    // DOWNLOAD MEMBER
    context.subscriptions.push(
        vscode.lm.registerTool('zos_downloadMember', {
            async invoke(
                options: vscode.LanguageModelToolInvocationOptions<{
                    dataset: string;
                    member: string;
                    targetDir?: string;
                }>,
                _token: vscode.CancellationToken
            ) {
                const { session } = await sessionManager.getSession();
                const { dataset, member, targetDir } = options.input;

                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                    ?? require('os').homedir();
                const base = targetDir
                    ? (path.isAbsolute(targetDir) ? targetDir : path.join(workspaceRoot, targetDir))
                    : path.join(workspaceRoot, 'downloads');

                const dsDir = path.join(base, dataset.replace(/\./g, path.sep));
                fs.mkdirSync(dsDir, { recursive: true });

                const localFile = path.join(dsDir, `${member.toUpperCase()}${pdsExtension(dataset)}`);

                await Download.dataSet(session, `${dataset}(${member})`, { file: localFile });

                telemetry.trackSuccess('tool', 'zos_downloadMember');

                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        JSON.stringify({ status: 'success', localFile, dataset, member }, null, 2)
                    )
                ]);
            }
        })
    );

    // DOWNLOAD ALL MEMBERS
    context.subscriptions.push(
        vscode.lm.registerTool('zos_downloadAllMembers', {
            async invoke(
                options: vscode.LanguageModelToolInvocationOptions<{
                    dataset: string;
                    targetDir?: string;
                }>,
                _token: vscode.CancellationToken
            ) {
                const { session } = await sessionManager.getSession();
                const { dataset, targetDir } = options.input;

                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                    ?? require('os').homedir();
                const base = targetDir
                    ? (path.isAbsolute(targetDir) ? targetDir : path.join(workspaceRoot, targetDir))
                    : path.join(workspaceRoot, 'downloads');

                const dsDir = path.join(base, dataset.replace(/\./g, path.sep));
                fs.mkdirSync(dsDir, { recursive: true });

                await Download.allMembers(session, dataset, { directory: dsDir });

                const files = fs.existsSync(dsDir) ? renameDownloadedFiles(dsDir, dataset) : [];

                telemetry.trackSuccess('tool', 'zos_downloadAllMembers');

                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        JSON.stringify({ status: 'success', localDirectory: dsDir, fileCount: files.length, files }, null, 2)
                    )
                ]);
            }
        })
    );

    // DOWNLOAD ALL DATASETS
    context.subscriptions.push(
        vscode.lm.registerTool('zos_downloadAllDatasets', {
            async invoke(
                options: vscode.LanguageModelToolInvocationOptions<{
                    pattern: string;
                    targetDir?: string;
                }>,
                _token: vscode.CancellationToken
            ) {
                const { session } = await sessionManager.getSession();
                const { pattern, targetDir } = options.input;

                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                    ?? require('os').homedir();
                const localDir = targetDir
                    ? (path.isAbsolute(targetDir) ? targetDir : path.join(workspaceRoot, targetDir))
                    : path.join(workspaceRoot, 'downloads');
                fs.mkdirSync(localDir, { recursive: true });

                const listResponse = await List.dataSet(session, pattern, { attributes: true });
                const dataSetObjs = listResponse.apiResponse?.items ?? [];

                if (dataSetObjs.length === 0) {
                    return new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart(
                            JSON.stringify({ status: 'no_datasets', pattern }, null, 2)
                        )
                    ]);
                }

                await Download.allDataSets(session, dataSetObjs, { directory: localDir });

                // Renommage : majuscules + extension dérivée du nom de PDS
                for (const ds of dataSetObjs) {
                    const dsLocalPath = path.join(localDir, ds.dsname.replace(/\./g, path.sep));
                    if (!fs.existsSync(dsLocalPath)) { continue; }

                    if (fs.statSync(dsLocalPath).isDirectory()) {
                        renameDownloadedFiles(dsLocalPath, ds.dsname);
                    } else {
                        const ext = pdsExtension(ds.dsname);
                        const dir = path.dirname(dsLocalPath);
                        const newName = path.basename(dsLocalPath).toUpperCase() + ext;
                        const newPath = path.join(dir, newName);
                        if (dsLocalPath !== newPath) { fs.renameSync(dsLocalPath, newPath); }
                    }
                }

                telemetry.trackSuccess('tool', 'zos_downloadAllDatasets');

                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        JSON.stringify({
                            status: 'success',
                            localDirectory: localDir,
                            datasetCount: dataSetObjs.length,
                            datasets: dataSetObjs.map((ds: any) => ds.dsname),
                        }, null, 2)
                    )
                ]);
            }
        })
    );

    // UPLOAD FILE TO MEMBER
    context.subscriptions.push(
        vscode.lm.registerTool('zos_uploadFileToPds', {
            async invoke(
                options: vscode.LanguageModelToolInvocationOptions<{
                    localPath: string;
                    dataset: string;
                    member: string;
                }>,
                _token: vscode.CancellationToken
            ) {
                const { session } = await sessionManager.getSession();
                const { localPath, dataset, member } = options.input;

                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                    ?? require('os').homedir();
                const filePath = path.isAbsolute(localPath)
                    ? localPath
                    : path.join(workspaceRoot, localPath);

                if (!fs.existsSync(filePath)) {
                    return new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart(
                            JSON.stringify({ status: 'error', message: `File not found: ${filePath}` }, null, 2)
                        )
                    ]);
                }

                const target = `${dataset}(${member})`;
                await Upload.fileToDataset(session, filePath, target);

                telemetry.trackSuccess('tool', 'zos_uploadFileToPds');

                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        JSON.stringify({ status: 'success', localFile: filePath, target }, null, 2)
                    )
                ]);
            }
        })
    );

    // UPLOAD DIR TO PDS
    context.subscriptions.push(
        vscode.lm.registerTool('zos_uploadDirToPds', {
            async invoke(
                options: vscode.LanguageModelToolInvocationOptions<{
                    localPath: string;
                    dataset: string;
                }>,
                _token: vscode.CancellationToken
            ) {
                const { session } = await sessionManager.getSession();
                const { localPath, dataset } = options.input;

                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                    ?? require('os').homedir();
                const dirPath = path.isAbsolute(localPath)
                    ? localPath
                    : path.join(workspaceRoot, localPath);

                if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
                    return new vscode.LanguageModelToolResult([
                        new vscode.LanguageModelTextPart(
                            JSON.stringify({ status: 'error', message: `Directory not found: ${dirPath}` }, null, 2)
                        )
                    ]);
                }

                await Upload.dirToPds(session, dirPath, dataset);

                const files = fs.readdirSync(dirPath)
                    .filter(f => fs.statSync(path.join(dirPath, f)).isFile());

                telemetry.trackSuccess('tool', 'zos_uploadDirToPds');

                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(
                        JSON.stringify({
                            status: 'success',
                            localDirectory: dirPath,
                            dataset,
                            uploadedFiles: files.length,
                            members: files.map(f => path.basename(f, path.extname(f)).toUpperCase().slice(0, 8)),
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
