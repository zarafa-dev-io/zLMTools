import * as vscode from 'vscode';
import { ZoweSessionManager } from '../zowe/session';
import { TelemetryService } from '../utils/telemetry';
import { ZosChatResult, createResult, followup } from '../types/chat-result';

// ============================================================
// Stubs pour les handlers restants — /tso et /uss
// ============================================================

export class TsoHandler {
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
        stream.markdown(
            `**Commande /tso** — *Implémentation à venir*\n\n` +
            `Prévu : exécution de commandes TSO et console z/OS.`
        );

        return createResult('tso', undefined, [
            followup('📁 Lister des datasets', 'liste les datasets HLQ.**', 'ds'),
            followup('📋 Voir mes jobs', 'liste mes jobs', 'jobs'),
        ]);
    }
}

export class UssHandler {
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
        stream.markdown(
            `**Commande /uss** — *Implémentation à venir*\n\n` +
            `Prévu : navigation et manipulation du filesystem Unix (USS).`
        );

        return createResult('uss', undefined, [
            followup('📁 Lister des datasets', 'liste les datasets HLQ.**', 'ds'),
            followup('📋 Voir mes jobs', 'liste mes jobs', 'jobs'),
        ]);
    }
}
