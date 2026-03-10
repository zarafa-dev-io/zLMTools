import * as vscode from 'vscode';
import { ZoweSessionManager } from '../zowe/session';
import { TelemetryService } from '../utils/telemetry';
import { ZosChatResult, createResult, followup } from '../types/chat-result';
import { detectLanguage, Lang } from '../utils/i18n';

// ============================================================
// Stubs pour les handlers restants — /tso et /uss
// ============================================================

export class TsoHandler {
    private lang: Lang = 'fr';
    private t(fr: string, en: string): string { return this.lang === 'fr' ? fr : en; }

    constructor(
        private sessionManager: ZoweSessionManager,
        private telemetry: TelemetryService
    ) {}

    async handle(
        request: vscode.ChatRequest,
        chatContext: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<ZosChatResult> {
        this.lang = detectLanguage(request.prompt);

        stream.markdown(
            `**${this.t('Commande /tso', '/tso command')}** — *${this.t('Implémentation à venir', 'Coming soon')}*\n\n` +
            this.t(
                'Prévu : exécution de commandes TSO et console z/OS.',
                'Planned: TSO command execution and z/OS console.'
            )
        );

        return createResult('tso', undefined, [
            followup(this.t('📁 Lister des datasets', '📁 List datasets'), this.t('liste les datasets HLQ.**', 'list datasets HLQ.**'), 'ds'),
            followup(this.t('📋 Voir mes jobs', '📋 View my jobs'), this.t('liste mes jobs', 'list my jobs'), 'jobs'),
        ]);
    }
}

export class UssHandler {
    private lang: Lang = 'fr';
    private t(fr: string, en: string): string { return this.lang === 'fr' ? fr : en; }

    constructor(
        private sessionManager: ZoweSessionManager,
        private telemetry: TelemetryService
    ) {}

    async handle(
        request: vscode.ChatRequest,
        chatContext: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<ZosChatResult> {
        this.lang = detectLanguage(request.prompt);

        stream.markdown(
            `**${this.t('Commande /uss', '/uss command')}** — *${this.t('Implémentation à venir', 'Coming soon')}*\n\n` +
            this.t(
                'Prévu : navigation et manipulation du filesystem Unix (USS).',
                'Planned: Unix System Services (USS) filesystem navigation and manipulation.'
            )
        );

        return createResult('uss', undefined, [
            followup(this.t('📁 Lister des datasets', '📁 List datasets'), this.t('liste les datasets HLQ.**', 'list datasets HLQ.**'), 'ds'),
            followup(this.t('📋 Voir mes jobs', '📋 View my jobs'), this.t('liste mes jobs', 'list my jobs'), 'jobs'),
        ]);
    }
}
