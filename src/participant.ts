import * as vscode from 'vscode';
import { DatasetsHandler } from './handlers/datasets.handler';
import { JobsHandler, RunHandler, TsoHandler, UssHandler } from './handlers';
import { LparHandler } from './handlers/lpar.handler';
import { ZoweSessionManager } from './zowe/session';
import { TelemetryService } from './utils/telemetry';
import { registerTools } from './tools/registry';
import { ZosChatResult, ZosFollowup, createResult, followup } from './types/chat-result';
import { detectLanguage, Lang, tr } from './utils/i18n';

const PARTICIPANT_ID = 'zdevops.zos';

export function activate(context: vscode.ExtensionContext) {
    const sessionManager = new ZoweSessionManager();
    const telemetry = new TelemetryService(context);

    // ── Chat Participant (slash commands) ──
    const datasetsHandler = new DatasetsHandler(sessionManager, telemetry);
    const jobsHandler = new JobsHandler(sessionManager, telemetry);
    const runHandler = new RunHandler(sessionManager, telemetry);
    const tsoHandler = new TsoHandler(sessionManager, telemetry);
    const ussHandler = new UssHandler(sessionManager, telemetry);
    const lparHandler = new LparHandler(sessionManager, telemetry);

    // ── Status Bar — affiche le LPAR actif ──
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left, 50
    );
    statusBarItem.command = 'zos.selectLpar';
    statusBarItem.tooltip = 'z/OS: LPAR actif — cliquez pour changer';
    updateStatusBar(statusBarItem, null);
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Mettre à jour la status bar quand le profil change
    sessionManager.onDidChangeProfile((profileName) => {
        updateStatusBar(statusBarItem, profileName);
    });

    // Commande pour ouvrir le QuickPick LPAR depuis la status bar
    context.subscriptions.push(
        vscode.commands.registerCommand('zos.selectLpar', async () => {
            const profiles = await sessionManager.listProfiles();
            if (profiles.length === 0) {
                vscode.window.showWarningMessage(
                    'Aucun profil Zowe trouvé. Configurez vos profils dans zowe.config.json.'
                );
                return;
            }

            const activeProfile = sessionManager.getActiveProfileName();

            const items = profiles.map(p => ({
                label: p.name === activeProfile ? `$(check) ${p.name}` : p.name,
                description: `${p.host}:${p.port}`,
                detail: p.description,
                profileName: p.name,
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Sélectionnez un LPAR z/OS',
                title: 'z/OS Assistant — Changer de partition',
            });

            if (selected) {
                sessionManager.setActiveProfile(selected.profileName);
                vscode.window.showInformationMessage(
                    `z/OS: LPAR changé → ${selected.profileName}`
                );
            }
        })
    );

    // ── Chat Handler ──
    const handler: vscode.ChatRequestHandler = async (
        request: vscode.ChatRequest,
        chatContext: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<ZosChatResult> => {
        const startTime = Date.now();

        try {
            // Afficher le LPAR actif en en-tête (sauf pour /lpar)
            if (request.command && request.command !== 'lpar') {
                const activeLpar = sessionManager.getActiveProfileName();
                if (activeLpar) {
                    stream.markdown(`> 🖥️ \`${activeLpar}\`\n\n`);
                }
            }

            const lang = detectLanguage(request.prompt);

            switch (request.command) {
                case 'ds':
                    return await datasetsHandler.handle(request, chatContext, stream, token);
                case 'jobs':
                    return await jobsHandler.handle(request, chatContext, stream, token);
                case 'run':
                    return await runHandler.handle(request, chatContext, stream, token);
                case 'tso':
                    return await tsoHandler.handle(request, chatContext, stream, token);
                case 'uss':
                    return await ussHandler.handle(request, chatContext, stream, token);
                case 'lpar':
                    return await lparHandler.handle(request, chatContext, stream, token);
                default:
                    return handleFreeForm(sessionManager, stream, lang);
            }
        } catch (error: any) {
            telemetry.trackError(request.command ?? 'freeform', error);
            const lang = detectLanguage(request.prompt);
            stream.markdown(`\n\n⚠️ **${tr('Erreur z/OS', 'z/OS Error', lang)}** : ${formatZoweError(error)}`);
            return createResult(request.command ?? 'freeform', undefined, []);
        } finally {
            telemetry.trackDuration(request.command ?? 'freeform', Date.now() - startTime);
        }
    };

    const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
    participant.iconPath = new vscode.ThemeIcon('server');

    // ── Followup Provider ──
    participant.followupProvider = {
        provideFollowups(
            result: ZosChatResult,
            _context: vscode.ChatContext,
            _token: vscode.CancellationToken
        ): vscode.ChatFollowup[] {
            if (!result?.metadata?.followups) {
                return [];
            }

            return result.metadata.followups.map((f: ZosFollowup) => ({
                prompt: f.prompt,
                label: f.label,
                command: f.command,
            }));
        }
    };

    context.subscriptions.push(participant);

    // ── Language Model Tools (#zos_*) ──
    registerTools(context, sessionManager, telemetry);

    // ── Commande clear cache ──
    context.subscriptions.push(
        vscode.commands.registerCommand('zos.clearSessionCache', () => {
            sessionManager.clearCache();
            vscode.window.showInformationMessage('z/OS: Cache des sessions vidé.');
        })
    );

    // ── Commande rapport de télémétrie ──
    context.subscriptions.push(
        vscode.commands.registerCommand('zos.telemetryReport', async () => {
            const report = await telemetry.generateReport();
            const doc = await vscode.workspace.openTextDocument({
                content: report,
                language: 'markdown',
            });
            await vscode.window.showTextDocument(doc, { preview: true });
        })
    );
}

function handleFreeForm(
    sessionManager: ZoweSessionManager,
    stream: vscode.ChatResponseStream,
    lang: Lang
): ZosChatResult {
    const activeLpar = sessionManager.getActiveProfileName();
    const lparInfo = activeLpar
        ? `\n\n🖥️ ${tr('LPAR actif', 'Active LPAR', lang)} : **${activeLpar}**`
        : '';

    stream.markdown(
        tr(
            `Je peux vous aider à interagir avec z/OS. Utilisez une commande :\n\n` +
            `- \`/ds\` — Datasets & membres PDS\n` +
            `- \`/jobs\` — Statut et spool des jobs\n` +
            `- \`/run\` — Soumettre du JCL\n` +
            `- \`/lpar\` — Changer de partition mainframe\n` +
            `- \`/tso\` — Commandes TSO/Console\n` +
            `- \`/uss\` — Filesystem USS`,
            `I can help you interact with z/OS. Use a command:\n\n` +
            `- \`/ds\` — Datasets & PDS members\n` +
            `- \`/jobs\` — Job status and spool output\n` +
            `- \`/run\` — Submit JCL\n` +
            `- \`/lpar\` — Switch mainframe partition\n` +
            `- \`/tso\` — TSO/Console commands\n` +
            `- \`/uss\` — USS Filesystem`,
            lang
        ) + lparInfo
    );

    return createResult('freeform', undefined, [
        followup(tr('🖥️ Voir les LPARs', '🖥️ View LPARs', lang), '', 'lpar'),
        followup(tr('📁 Lister mes datasets', '📁 List my datasets', lang), tr('liste les datasets HLQ.**', 'list datasets HLQ.**', lang), 'ds'),
        followup(tr('📋 Voir mes jobs', '📋 View my jobs', lang), tr('liste mes jobs', 'list my jobs', lang), 'jobs'),
    ]);
}

function updateStatusBar(
    item: vscode.StatusBarItem,
    profileName: string | null
): void {
    if (profileName) {
        item.text = `$(server) z/OS: ${profileName}`;
    } else {
        item.text = `$(server) z/OS: (défaut)`;
    }
}

function formatZoweError(error: any): string {
    if (error?.mDetails?.additionalDetails) {
        return `${error.message}\n\`\`\`\n${error.mDetails.additionalDetails}\n\`\`\``;
    }
    if (error?.causeErrors) {
        try {
            const cause = JSON.parse(error.causeErrors);
            return `RC=${cause.rc ?? '?'} — ${cause.message ?? error.message}`;
        } catch {
            return error.message;
        }
    }
    return error?.message ?? 'Erreur inconnue';
}

export function deactivate() {}
