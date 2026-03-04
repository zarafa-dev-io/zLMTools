import * as vscode from 'vscode';

// ============================================================
// Télémétrie — mesurer l'adoption et le ROI
// Les données restent locales (pas d'envoi externe)
// ============================================================

interface TelemetryEvent {
    timestamp: string;
    command: string;
    intentType?: string;
    duration?: number;
    success: boolean;
    error?: string;
    profileName?: string;
}

export class TelemetryService {
    private events: TelemetryEvent[] = [];
    private outputChannel: vscode.OutputChannel;

    constructor(private context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('z/OS Assistant Telemetry');

        // Charger l'historique depuis le globalState
        this.events = context.globalState.get<TelemetryEvent[]>('zos.telemetry', []);
    }

    /**
     * Enregistre une interaction réussie
     */
    trackSuccess(command: string, intentType: string, profileName?: string): void {
        this.addEvent({
            timestamp: new Date().toISOString(),
            command,
            intentType,
            success: true,
            profileName,
        });
    }

    /**
     * Enregistre une erreur
     */
    trackError(command: string, error: any): void {
        this.addEvent({
            timestamp: new Date().toISOString(),
            command,
            success: false,
            error: error?.message ?? String(error),
        });
    }

    /**
     * Enregistre la durée d'une opération
     */
    trackDuration(command: string, durationMs: number): void {
        // Mettre à jour le dernier event s'il correspond
        const last = this.events[this.events.length - 1];
        if (last && last.command === command && !last.duration) {
            last.duration = durationMs;
            this.persist();
        }
    }

    /**
     * Génère un rapport d'utilisation (pour les présentations management)
     */
    async generateReport(): Promise<string> {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const recentEvents = this.events.filter(
            e => new Date(e.timestamp) >= thirtyDaysAgo
        );

        const totalOps = recentEvents.length;
        const successOps = recentEvents.filter(e => e.success).length;
        const successRate = totalOps > 0 ? ((successOps / totalOps) * 100).toFixed(1) : 'N/A';

        // Répartition par commande
        const byCommand: Record<string, number> = {};
        for (const e of recentEvents) {
            byCommand[e.command] = (byCommand[e.command] ?? 0) + 1;
        }

        // Répartition par intent
        const byIntent: Record<string, number> = {};
        for (const e of recentEvents) {
            if (e.intentType) {
                byIntent[e.intentType] = (byIntent[e.intentType] ?? 0) + 1;
            }
        }

        // Temps moyen
        const withDuration = recentEvents.filter(e => e.duration);
        const avgDuration = withDuration.length > 0
            ? (withDuration.reduce((sum, e) => sum + (e.duration ?? 0), 0) / withDuration.length / 1000).toFixed(2)
            : 'N/A';

        return [
            `# 📊 Rapport @zos — 30 derniers jours`,
            ``,
            `| Métrique | Valeur |`,
            `|----------|--------|`,
            `| Total opérations | ${totalOps} |`,
            `| Taux de succès | ${successRate}% |`,
            `| Temps moyen | ${avgDuration}s |`,
            ``,
            `## Par commande`,
            ...Object.entries(byCommand)
                .sort(([, a], [, b]) => b - a)
                .map(([cmd, count]) => `- \`/${cmd}\` : ${count} utilisations`),
            ``,
            `## Par opération`,
            ...Object.entries(byIntent)
                .sort(([, a], [, b]) => b - a)
                .map(([intent, count]) => `- ${intent} : ${count}`),
        ].join('\n');
    }

    private addEvent(event: TelemetryEvent): void {
        this.events.push(event);
        // Garder max 1000 événements
        if (this.events.length > 1000) {
            this.events = this.events.slice(-1000);
        }
        this.persist();
        this.log(event);
    }

    private persist(): void {
        this.context.globalState.update('zos.telemetry', this.events);
    }

    private log(event: TelemetryEvent): void {
        const status = event.success ? '✅' : '❌';
        this.outputChannel.appendLine(
            `${status} [${event.timestamp}] /${event.command} → ${event.intentType ?? 'N/A'} ` +
            `(${event.duration ? event.duration + 'ms' : 'pending'})`
        );
    }
}
