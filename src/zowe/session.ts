import * as vscode from 'vscode';
import { imperative } from '@zowe/zowe-explorer-api';

// ============================================================
// Gestion des sessions Zowe — Multi-profils / Multi-LPAR
//
// Chaque profil zosmf dans le Zowe Team Config ou Zowe Explorer
// correspond à une partition (LPAR) mainframe.
//
// L'utilisateur peut :
//   1. Lister les LPARs disponibles   → /lpar
//   2. Changer de LPAR actif          → /lpar use DEV1
//   3. Voir le LPAR actif             → /lpar status
// ============================================================

export interface ZoweSession {
    session: imperative.Session;
    profileName: string;
    host?: string;
    port?: number;
}

export interface LparProfile {
    name: string;
    host: string;
    port: number;
    description?: string;
}

export class ZoweSessionManager {
    /** Profil actuellement actif */
    private activeProfileName: string | null = null;

    /** Cache des sessions par nom de profil */
    private sessionCache: Map<string, ZoweSession> = new Map();

    /** Cache des profils disponibles */
    private availableProfiles: LparProfile[] | null = null;

    /** Event émis quand le LPAR actif change */
    private _onDidChangeProfile = new vscode.EventEmitter<string>();
    readonly onDidChangeProfile = this._onDidChangeProfile.event;

    /**
     * Récupère la session du profil actif.
     * Si aucun profil n'est explicitement sélectionné,
     * utilise le profil par défaut.
     */
    async getSession(): Promise<ZoweSession> {
        // Si un profil est explicitement sélectionné, l'utiliser
        if (this.activeProfileName) {
            return this.getSessionByName(this.activeProfileName);
        }

        // Sinon, utiliser le setting ou le défaut
        const configuredProfile = vscode.workspace
            .getConfiguration('zosAssistant')
            .get<string>('defaultProfile');

        if (configuredProfile) {
            return this.getSessionByName(configuredProfile);
        }

        // Fallback : profil par défaut du Team Config ou Zowe Explorer
        return this.getDefaultSession();
    }

    /**
     * Récupère une session pour un profil spécifique
     */
    async getSessionByName(profileName: string): Promise<ZoweSession> {
        // Vérifier le cache
        const cached = this.sessionCache.get(profileName);
        if (cached) {
            return cached;
        }

        // Tenter Zowe Explorer d'abord
        const zoweApi = this.getZoweExplorerApi();
        if (zoweApi) {
            const session = await this.getSessionFromZoweExplorer(zoweApi, profileName);
            if (session) {
                this.sessionCache.set(profileName, session);
                return session;
            }
        }

        // Fallback Team Config
        const session = await this.getSessionFromTeamConfig(profileName);
        if (session) {
            this.sessionCache.set(profileName, session);
            return session;
        }

        throw new Error(
            `Profil "${profileName}" introuvable. ` +
            `Utilisez \`/lpar\` pour voir les profils disponibles.`
        );
    }

    /**
     * Change le profil/LPAR actif
     */
    setActiveProfile(profileName: string): void {
        this.activeProfileName = profileName;
        this._onDidChangeProfile.fire(profileName);

        // Mettre à jour la status bar si disponible
        vscode.window.setStatusBarMessage(
            `$(server) z/OS: ${profileName}`, 5000
        );
    }

    /**
     * Retourne le nom du profil actuellement actif
     */
    getActiveProfileName(): string | null {
        return this.activeProfileName;
    }

    /**
     * Liste tous les profils zosmf disponibles
     * (depuis Zowe Explorer + Team Config, dédupliqués)
     */
    async listProfiles(): Promise<LparProfile[]> {
        if (this.availableProfiles) {
            return this.availableProfiles;
        }

        const profiles: Map<string, LparProfile> = new Map();

        // Source 1 : Zowe Explorer
        const zoweApi = this.getZoweExplorerApi();
        if (zoweApi) {
            try {
                const cache = zoweApi?.getExplorerExtenderApi?.()?.getProfilesCache?.();
                if (cache) {
                    const allProfiles = cache.getProfiles?.('zosmf') ?? [];
                    for (const p of allProfiles) {
                        if (p.name && p.profile?.host) {
                            profiles.set(p.name, {
                                name: p.name,
                                host: p.profile.host,
                                port: p.profile.port ?? 443,
                                description: p.profile.description,
                            });
                        }
                    }
                }
            } catch (error) {
                console.warn('[zos] Could not list Zowe Explorer profiles:', error);
            }
        }

        // Source 2 : Team Config (zowe.config.json)
        try {
            const configProfiles = await this.getProfilesFromTeamConfig();
            for (const p of configProfiles) {
                if (!profiles.has(p.name)) {
                    profiles.set(p.name, p);
                }
            }
        } catch (error) {
            console.warn('[zos] Could not list Team Config profiles:', error);
        }

        this.availableProfiles = Array.from(profiles.values());
        return this.availableProfiles;
    }

    /**
     * Invalide tous les caches
     */
    clearCache(): void {
        this.sessionCache.clear();
        this.availableProfiles = null;
    }

    /**
     * Invalide le cache d'un profil spécifique
     */
    clearProfileCache(profileName: string): void {
        this.sessionCache.delete(profileName);
    }

    // ================================================================
    // Méthodes privées
    // ================================================================

    private async getDefaultSession(): Promise<ZoweSession> {
        const zoweApi = this.getZoweExplorerApi();
        if (zoweApi) {
            try {
                const session = await this.getSessionFromZoweExplorer(zoweApi);
                if (session) {
                    this.sessionCache.set(session.profileName, session);
                    return session;
                }
            } catch (error) {
                console.warn('[zos] Could not get default session from Zowe Explorer:', error);
            }
        }

        const session = await this.getSessionFromTeamConfig();
        if (session) {
            this.sessionCache.set(session.profileName, session);
            return session;
        }

        throw new Error(
            'Impossible de se connecter à z/OS. ' +
            'Vérifiez que Zowe Explorer est installé avec un profil configuré, ' +
            'ou qu\'un fichier zowe.config.json est présent dans le workspace.'
        );
    }

    private getZoweExplorerApi(): any | undefined {
        try {
            const zoweExplorer = vscode.extensions.getExtension('Zowe.vscode-extension-for-zowe');
            if (zoweExplorer?.isActive) {
                return zoweExplorer.exports;
            }
        } catch { /* not installed */ }
        return undefined;
    }

    /**
     * Session depuis Zowe Explorer — par nom ou défaut
     */
    private async getSessionFromZoweExplorer(
        api: any,
        profileName?: string
    ): Promise<ZoweSession | null> {
        const cache = api?.getExplorerExtenderApi?.()?.getProfilesCache?.();
        if (!cache) { return null; }

        let targetProfile;

        if (profileName) {
            // Chercher le profil par nom
            const allProfiles = cache.getProfiles?.('zosmf') ?? [];
            targetProfile = allProfiles.find((p: any) => p.name === profileName);
        } else {
            // Profil par défaut
            targetProfile = cache.getDefaultProfile('zosmf');
        }

        if (!targetProfile) { return null; }

        const baseProfile = cache.getDefaultProfile('base');
        const merged = {
            ...baseProfile?.profile,
            ...targetProfile.profile,
        };

        const session = new imperative.Session({
            hostname: merged.host,
            port: merged.port,
            user: merged.user,
            password: merged.password,
            type: imperative.SessConstants.AUTH_TYPE_BASIC,
            basePath: merged.basePath,
            rejectUnauthorized: merged.rejectUnauthorized ?? true,
            protocol: merged.protocol ?? 'https',
        });

        return {
            session,
            profileName: targetProfile.name ?? 'default',
            host: merged.host,
            port: merged.port,
        };
    }

    /**
     * Session depuis Team Config — par nom ou défaut
     */
    private async getSessionFromTeamConfig(
        profileName?: string
    ): Promise<ZoweSession | null> {
        const config = await this.loadTeamConfig();
        if (!config) { return null; }

        const targetName = profileName ?? config.defaults?.zosmf;
        if (!targetName) { return null; }

        const profile = config.profiles?.[targetName]?.properties;
        if (!profile) { return null; }

        const baseProfile = config.profiles?.base?.properties;
        const merged = { ...baseProfile, ...profile };

        const session = new imperative.Session({
            hostname: merged.host,
            port: merged.port,
            user: merged.user,
            password: merged.password,
            type: imperative.SessConstants.AUTH_TYPE_BASIC,
            basePath: merged.basePath,
            rejectUnauthorized: merged.rejectUnauthorized ?? true,
            protocol: merged.protocol ?? 'https',
        });

        return {
            session,
            profileName: targetName,
            host: merged.host,
            port: merged.port,
        };
    }

    /**
     * Liste des profils depuis le Team Config
     */
    private async getProfilesFromTeamConfig(): Promise<LparProfile[]> {
        const config = await this.loadTeamConfig();
        if (!config?.profiles) { return []; }

        const profiles: LparProfile[] = [];
        const baseProfile = config.profiles?.base?.properties;

        for (const [name, value] of Object.entries(config.profiles)) {
            if (name === 'base') { continue; }

            const p = (value as any)?.properties;
            if (!p) { continue; }

            // Seuls les profils avec un host sont des profils zosmf
            const host = p.host ?? baseProfile?.host;
            if (!host) { continue; }

            // Vérifier que c'est bien un profil zosmf
            // (dans Team Config, les profils ont un type ou sont dans defaults.zosmf)
            const profileType = (value as any)?.type;
            if (profileType && profileType !== 'zosmf') { continue; }

            profiles.push({
                name,
                host,
                port: p.port ?? baseProfile?.port ?? 443,
                description: p.description,
            });
        }

        return profiles;
    }

    /**
     * Charge et parse le zowe.config.json
     */
    private async loadTeamConfig(): Promise<any | null> {
        const configFiles = await vscode.workspace.findFiles(
            '**/zowe.config.json',
            '**/node_modules/**',
            1
        );

        if (configFiles.length === 0) { return null; }

        try {
            const content = await vscode.workspace.fs.readFile(configFiles[0]);
            return JSON.parse(Buffer.from(content).toString());
        } catch {
            return null;
        }
    }
}
