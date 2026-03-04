import * as vscode from 'vscode';
import { ZoweSessionManager, LparProfile } from '../zowe/session';
import { TelemetryService } from '../utils/telemetry';
import { ZosChatResult, ZosFollowup, createResult, followup } from '../types/chat-result';

// ============================================================
// Handler /lpar — Gestion des partitions mainframe
//
// Sous-commandes (détectées par parsing simple, pas de LLM) :
//   /lpar              → Lister les LPARs disponibles
//   /lpar status       → Afficher le LPAR actif
//   /lpar use <name>   → Changer de LPAR
//   /lpar refresh      → Rafraîchir le cache des profils
// ============================================================

export class LparHandler {
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
        const prompt = request.prompt.trim().toLowerCase();
        const args = prompt.split(/\s+/);
        const subcommand = args[0] || '';

        switch (subcommand) {
            case 'use':
            case 'switch':
            case 'select':
            case 'connect':
                return await this.switchLpar(args.slice(1).join(' ').toUpperCase(), stream);

            case 'status':
            case 'current':
            case 'actif':
            case 'active':
                return await this.showStatus(stream);

            case 'refresh':
            case 'reload':
                return await this.refresh(stream);

            default:
                // Pas de sous-commande ou sous-commande inconnue → lister
                return await this.listLpars(stream);
        }
    }

    // ================================================================
    // LIST — Lister les LPARs disponibles
    // ================================================================
    private async listLpars(
        stream: vscode.ChatResponseStream
    ): Promise<ZosChatResult> {
        stream.progress('Recherche des profils Zowe...');

        const profiles = await this.sessionManager.listProfiles();
        const activeProfile = this.sessionManager.getActiveProfileName();

        if (profiles.length === 0) {
            stream.markdown(
                `⚠️ Aucun profil zosmf trouvé.\n\n` +
                `Vérifiez que :\n` +
                `- Zowe Explorer est installé et configuré, ou\n` +
                `- Un fichier \`zowe.config.json\` est présent dans le workspace.`
            );
            return createResult('lpar', 'LIST', []);
        }

        stream.markdown(`### 🖥️ Partitions z/OS disponibles (${profiles.length})\n\n`);
        stream.markdown(`| | Profil | Hôte | Port |\n`);
        stream.markdown(`|---|--------|------|------|\n`);

        for (const p of profiles) {
            const isActive = p.name === activeProfile;
            const marker = isActive ? '▶️' : ' ';
            const nameDisplay = isActive ? `**${p.name}**` : p.name;

            stream.markdown(
                `| ${marker} | \`${nameDisplay}\` | ${p.host} | ${p.port} |\n`
            );
        }

        if (activeProfile) {
            stream.markdown(`\n🟢 LPAR actif : **${activeProfile}**`);
        } else {
            stream.markdown(`\n⚪ Aucun LPAR sélectionné (profil par défaut utilisé).`);
        }

        // Followups : proposer de se connecter aux différents LPARs
        const suggestions: ZosFollowup[] = profiles
            .filter(p => p.name !== activeProfile)
            .slice(0, 3)
            .map(p =>
                followup(
                    `🔌 Utiliser ${p.name}`,
                    `use ${p.name}`,
                    'lpar'
                )
            );

        if (activeProfile) {
            suggestions.push(
                followup('📊 Statut connexion', 'status', 'lpar')
            );
        }

        return createResult('lpar', 'LIST', suggestions);
    }

    // ================================================================
    // USE — Changer de LPAR
    // ================================================================
    private async switchLpar(
        profileName: string,
        stream: vscode.ChatResponseStream
    ): Promise<ZosChatResult> {
        if (!profileName) {
            stream.markdown(
                `⚠️ Précisez le nom du profil.\n\n` +
                `Usage : \`/lpar use <NOM_PROFIL>\``
            );
            return await this.listLpars(stream);
        }

        // Vérifier que le profil existe
        const profiles = await this.sessionManager.listProfiles();
        const target = profiles.find(
            p => p.name.toUpperCase() === profileName.toUpperCase()
        );

        if (!target) {
            stream.markdown(
                `❌ Profil \`${profileName}\` introuvable.\n\n` +
                `Profils disponibles : ${profiles.map(p => `\`${p.name}\``).join(', ')}`
            );

            return createResult('lpar', 'USE', profiles.slice(0, 3).map(p =>
                followup(`🔌 Utiliser ${p.name}`, `use ${p.name}`, 'lpar')
            ));
        }

        // Tester la connexion avant de switcher
        stream.progress(`Connexion à ${target.name} (${target.host}:${target.port})...`);

        try {
            const session = await this.sessionManager.getSessionByName(target.name);

            // Activer le profil
            this.sessionManager.setActiveProfile(target.name);

            stream.markdown(
                `✅ **LPAR changé** → \`${target.name}\`\n\n` +
                `| Propriété | Valeur |\n` +
                `|-----------|--------|\n` +
                `| Profil | \`${target.name}\` |\n` +
                `| Hôte | \`${target.host}\` |\n` +
                `| Port | \`${target.port}\` |\n\n` +
                `Toutes les commandes \`/ds\`, \`/jobs\`, \`/run\` utilisent maintenant ce LPAR.`
            );

            this.telemetry.trackSuccess('lpar', 'USE', target.name);

            return createResult('lpar', 'USE', [
                followup('📁 Lister les datasets', 'liste les datasets HLQ.**', 'ds'),
                followup('📋 Voir les jobs', 'liste mes jobs', 'jobs'),
                followup('🖥️ Voir les LPARs', '', 'lpar'),
            ]);

        } catch (error: any) {
            stream.markdown(
                `❌ **Connexion échouée** à \`${target.name}\` (${target.host}:${target.port})\n\n` +
                `Erreur : ${error.message}\n\n` +
                `Vérifiez les credentials dans votre profil Zowe.`
            );

            return createResult('lpar', 'USE', [
                followup('🔄 Rafraîchir les profils', 'refresh', 'lpar'),
                followup('🖥️ Voir les LPARs', '', 'lpar'),
            ]);
        }
    }

    // ================================================================
    // STATUS — Afficher le LPAR actif avec test de connexion
    // ================================================================
    private async showStatus(
        stream: vscode.ChatResponseStream
    ): Promise<ZosChatResult> {
        const activeProfile = this.sessionManager.getActiveProfileName();

        if (!activeProfile) {
            stream.markdown(
                `⚪ Aucun LPAR explicitement sélectionné.\n\n` +
                `Le profil par défaut de votre configuration Zowe est utilisé.`
            );

            return createResult('lpar', 'STATUS', [
                followup('🖥️ Voir les LPARs disponibles', '', 'lpar'),
            ]);
        }

        stream.progress(`Test de connexion à ${activeProfile}...`);

        try {
            const session = await this.sessionManager.getSessionByName(activeProfile);

            stream.markdown(
                `### 🟢 LPAR actif : \`${activeProfile}\`\n\n` +
                `| Propriété | Valeur |\n` +
                `|-----------|--------|\n` +
                `| Profil | \`${session.profileName}\` |\n` +
                `| Hôte | \`${session.host ?? '-'}\` |\n` +
                `| Port | \`${session.port ?? '-'}\` |\n` +
                `| Connexion | ✅ OK |\n`
            );

            const profiles = await this.sessionManager.listProfiles();
            const others = profiles.filter(p => p.name !== activeProfile).slice(0, 2);

            const suggestions: ZosFollowup[] = [
                followup('📁 Datasets', 'liste les datasets HLQ.**', 'ds'),
                followup('📋 Jobs', 'liste mes jobs', 'jobs'),
            ];

            for (const p of others) {
                suggestions.push(
                    followup(`🔌 Basculer sur ${p.name}`, `use ${p.name}`, 'lpar')
                );
            }

            return createResult('lpar', 'STATUS', suggestions);

        } catch (error: any) {
            stream.markdown(
                `### 🔴 LPAR actif : \`${activeProfile}\`\n\n` +
                `Connexion : ❌ Erreur\n\n` +
                `\`\`\`\n${error.message}\n\`\`\`\n`
            );

            return createResult('lpar', 'STATUS', [
                followup('🔄 Rafraîchir', 'refresh', 'lpar'),
                followup('🖥️ Changer de LPAR', '', 'lpar'),
            ]);
        }
    }

    // ================================================================
    // REFRESH — Rafraîchir le cache des profils
    // ================================================================
    private async refresh(
        stream: vscode.ChatResponseStream
    ): Promise<ZosChatResult> {
        this.sessionManager.clearCache();

        stream.progress('Rafraîchissement des profils...');

        const profiles = await this.sessionManager.listProfiles();

        stream.markdown(
            `🔄 **Cache rafraîchi** — ${profiles.length} profil(s) trouvé(s).\n`
        );

        // Enchaîner sur le listing
        return await this.listLpars(stream);
    }
}
