import * as vscode from 'vscode';
import { List, Download, Upload, Create, Delete, IZosFilesResponse } from '@zowe/zos-files-for-zowe-sdk';
import { ZoweSessionManager } from '../zowe/session';
import { TelemetryService } from '../utils/telemetry';
import { DsIntentClassifier } from '../intents/ds.classifier';
import {
    DsIntent,
    INTENT_SAFETY,
} from '../intents/ds.schemas';
import {
    requestConfirmation,
    getEffectiveSafetyLevel,
    describeOperation,
} from '../zowe/safety';
import { ZosChatResult, ZosFollowup, createResult, followup } from '../types/chat-result';

// ============================================================
// Handler /ds — Datasets & Membres PDS
// 
// Chaque opération retourne un ZosChatResult contenant
// des followups contextuels affichés comme boutons cliquables.
// ============================================================

export class DatasetsHandler {
    private classifier: DsIntentClassifier;

    constructor(
        private sessionManager: ZoweSessionManager,
        private telemetry: TelemetryService
    ) {
        this.classifier = new DsIntentClassifier();
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
                `**Commande /ds** — Gestion des datasets z/OS\n\n` +
                `Tapez votre requête en langage naturel après \`/ds\`.`
            );
            return createResult('ds', undefined, [
                followup('📁 Lister des datasets', 'liste les datasets HLQ.**', 'ds'),
                followup('📄 Lister des membres', 'montre les membres de HLQ.COBOL.SRC', 'ds'),
                followup('📝 Lire un membre', 'affiche HLQ.COBOL.SRC(PGMA)', 'ds'),
                followup('🔍 Chercher du texte', 'cherche PERFORM dans HLQ.COBOL.SRC', 'ds'),
            ]);
        }

        // ── Step 1 : Classification ──
        stream.progress('Analyse de la requête...');
        const intent = await this.classifier.classify(prompt, token);

        if (!intent) {
            stream.markdown(
                `🤔 Je n'ai pas compris votre requête sur les datasets.`
            );
            return createResult('ds', undefined, [
                followup('📁 Lister des datasets', 'liste les datasets HLQ.**', 'ds'),
                followup('ℹ️ Info sur un dataset', 'info sur HLQ.COBOL.LOAD', 'ds'),
            ]);
        }

        // ── Step 2 : Sécurité ──
        const datasetName = this.extractDatasetName(intent);
        const baseSafety = INTENT_SAFETY[intent.type];
        const effectiveSafety = getEffectiveSafetyLevel(baseSafety, datasetName);

        if (effectiveSafety !== 'safe') {
            const description = describeOperation(intent.type, intent as any);
            const confirmed = await requestConfirmation(
                stream, description, effectiveSafety, datasetName
            );
            if (!confirmed) {
                return createResult('ds', intent.type, []);
            }
        }

        // ── Step 3 : Exécution ──
        stream.progress('Connexion à z/OS...');
        const { session, profileName } = await this.sessionManager.getSession();
        stream.progress(`Exécution ${intent.type}...`);

        let followups: ZosFollowup[];

        switch (intent.type) {
            case 'LIST_DATASETS':
                followups = await this.listDatasets(session, intent.pattern, stream);
                break;
            case 'LIST_MEMBERS':
                followups = await this.listMembers(session, intent.dataset, stream, intent.pattern);
                break;
            case 'READ_MEMBER':
                followups = await this.readMember(session, intent.dataset, intent.member, stream);
                break;
            case 'WRITE_MEMBER':
                followups = await this.writeMember(session, intent.dataset, intent.member, intent.content, stream);
                break;
            case 'CREATE_DATASET':
                followups = await this.createDataset(session, intent, stream);
                break;
            case 'CREATE_MEMBER':
                followups = await this.createMember(session, intent.dataset, intent.member, intent.content, stream);
                break;
            case 'DELETE_MEMBER':
                followups = await this.deleteMember(session, intent.dataset, intent.member, stream);
                break;
            case 'DELETE_DATASET':
                followups = await this.deleteDataset(session, intent.dataset, stream);
                break;
            case 'SEARCH_CONTENT':
                followups = await this.searchContent(session, intent.dataset, intent.searchTerm, stream, intent.memberPattern);
                break;
            case 'DATASET_INFO':
                followups = await this.datasetInfo(session, intent.dataset, stream);
                break;
            default:
                followups = [];
        }

        this.telemetry.trackSuccess('ds', intent.type, profileName);
        return createResult('ds', intent.type, followups);
    }

    // ================================================================
    // LIST_DATASETS
    // ================================================================
    private async listDatasets(
        session: any,
        pattern: string,
        stream: vscode.ChatResponseStream
    ): Promise<ZosFollowup[]> {
        const response: IZosFilesResponse = await List.dataSet(session, pattern, {
            attributes: true,
        });
        const items = response.apiResponse?.items ?? [];

        if (items.length === 0) {
            stream.markdown(`Aucun dataset trouvé pour le pattern \`${pattern}\`.`);
            return [];
        }

        stream.markdown(`### 📁 Datasets — \`${pattern}\` (${items.length} résultats)\n\n`);
        stream.markdown(`| Dataset | Organisation | RECFM | LRECL | Volume |\n`);
        stream.markdown(`|---------|-------------|-------|-------|--------|\n`);

        for (const ds of items) {
            stream.markdown(
                `| \`${ds.dsname}\` | ${ds.dsorg ?? '-'} | ${ds.recfm ?? '-'} | ${ds.lrecl ?? '-'} | ${ds.vol ?? '-'} |\n`
            );
        }

        // Followups contextuels basés sur les résultats
        const pdsItems = items.filter((ds: any) => ds.dsorg?.includes('PO'));
        const suggestions: ZosFollowup[] = [];

        if (pdsItems.length > 0) {
            const firstPds = pdsItems[0].dsname;
            suggestions.push(
                followup(`📄 Membres de ${firstPds}`, `montre les membres de ${firstPds}`, 'ds')
            );
        }
        if (items.length > 0) {
            const first = items[0].dsname;
            suggestions.push(
                followup(`ℹ️ Info sur ${first}`, `info sur ${first}`, 'ds')
            );
        }
        if (pdsItems.length > 1) {
            const second = pdsItems[1].dsname;
            suggestions.push(
                followup(`📄 Membres de ${second}`, `montre les membres de ${second}`, 'ds')
            );
        }

        return suggestions;
    }

    // ================================================================
    // LIST_MEMBERS
    // ================================================================
    private async listMembers(
        session: any,
        dataset: string,
        stream: vscode.ChatResponseStream,
        pattern?: string
    ): Promise<ZosFollowup[]> {
        const response: IZosFilesResponse = await List.allMembers(session, dataset, {
            attributes: true,
            pattern,
        });
        const items = response.apiResponse?.items ?? [];

        if (items.length === 0) {
            stream.markdown(
                pattern
                    ? `Aucun membre correspondant à \`${pattern}\` dans \`${dataset}\`.`
                    : `Le dataset \`${dataset}\` ne contient aucun membre (ou n'est pas un PDS).`
            );
            return [];
        }

        stream.markdown(`### 📄 Membres de \`${dataset}\` (${items.length})\n\n`);

        if (items.length > 20) {
            const columns = 4;
            const rows = Math.ceil(items.length / columns);
            stream.markdown(`| ${Array(columns).fill('Membre').join(' | ')} |\n`);
            stream.markdown(`| ${Array(columns).fill('------').join(' | ')} |\n`);
            for (let r = 0; r < rows; r++) {
                const cells = [];
                for (let c = 0; c < columns; c++) {
                    const idx = r + c * rows;
                    cells.push(idx < items.length ? `\`${items[idx].member}\`` : '');
                }
                stream.markdown(`| ${cells.join(' | ')} |\n`);
            }
        } else {
            stream.markdown(`| Membre | Modifié | Taille | ID |\n`);
            stream.markdown(`|--------|---------|--------|----|\n`);
            for (const m of items) {
                stream.markdown(
                    `| \`${m.member}\` | ${m.changed ?? m.m4date ?? '-'} ` +
                    `| ${m.init !== undefined ? `${m.init} lignes` : '-'} | ${m.user ?? '-'} |\n`
                );
            }
        }

        // Followups : proposer de lire les premiers membres
        const suggestions: ZosFollowup[] = [];
        const topMembers = items.slice(0, 3);

        for (const m of topMembers) {
            suggestions.push(
                followup(
                    `📝 Lire ${m.member}`,
                    `affiche ${dataset}(${m.member})`,
                    'ds'
                )
            );
        }

        return suggestions;
    }

    // ================================================================
    // READ_MEMBER
    // ================================================================
    private async readMember(
        session: any,
        dataset: string,
        member: string,
        stream: vscode.ChatResponseStream
    ): Promise<ZosFollowup[]> {
        const content = await Download.dataSet(session, `${dataset}(${member})`, {
            returnEtag: false,
            stream: undefined as any,
        });

        const text = typeof content.apiResponse === 'string'
            ? content.apiResponse
            : Buffer.from(content.apiResponse).toString('utf-8');

        if (!text || text.trim().length === 0) {
            stream.markdown(`Le membre \`${dataset}(${member})\` est vide.`);
            return [];
        }

        const lines = text.split('\n');
        const lang = this.detectLanguage(member, text);

        stream.markdown(`### 📝 \`${dataset}(${member})\` — ${lines.length} lignes\n\n`);
        stream.markdown(`\`\`\`${lang}\n${text}\n\`\`\`\n`);

        stream.button({
            command: 'zos.openMember',
            title: '📂 Ouvrir dans l\'éditeur',
            arguments: [dataset, member],
        });

        return [
            followup('🔍 Chercher dans ce PDS', `cherche PERFORM dans ${dataset}`, 'ds'),
            followup('📄 Voir les autres membres', `montre les membres de ${dataset}`, 'ds'),
            followup('ℹ️ Info sur le dataset', `info sur ${dataset}`, 'ds'),
        ];
    }

    // ================================================================
    // WRITE_MEMBER
    // ================================================================
    private async writeMember(
        session: any,
        dataset: string,
        member: string,
        content: string,
        stream: vscode.ChatResponseStream
    ): Promise<ZosFollowup[]> {
        const buffer = Buffer.from(content, 'utf-8');
        await Upload.bufferToDataSet(session, buffer, `${dataset}(${member})`, { binary: false });
        const lines = content.split('\n').length;

        stream.markdown(
            `✅ **Écriture réussie** — \`${dataset}(${member})\`\n\n${lines} lignes écrites.`
        );

        return [
            followup('📝 Relire le membre', `affiche ${dataset}(${member})`, 'ds'),
            followup('📄 Voir les membres', `montre les membres de ${dataset}`, 'ds'),
        ];
    }

    // ================================================================
    // CREATE_DATASET
    // ================================================================
    private async createDataset(
        session: any,
        intent: {
            name: string; dsorg: 'PO' | 'PS';
            recfm?: string; lrecl?: number; blksize?: number;
            primary?: number; secondary?: number;
        },
        stream: vscode.ChatResponseStream
    ): Promise<ZosFollowup[]> {
        const options: any = {
            dsorg: intent.dsorg,
            alcunit: 'TRK',
            primary: intent.primary ?? 10,
            secondary: intent.secondary ?? 5,
            recfm: intent.recfm ?? 'FB',
            lrecl: intent.lrecl ?? 80,
            blksize: intent.blksize ?? 27920,
        };

        if (intent.dsorg === 'PO') {
            options.dirblk = 20;
            options.dsntype = 'PDS';
        }

        await Create.dataSet(session, intent.dsorg === 'PO' ? 1 : 4, intent.name, options);

        stream.markdown(
            `✅ **Dataset créé** — \`${intent.name}\`\n\n` +
            `| Propriété | Valeur |\n|-----------|--------|\n` +
            `| Organisation | ${intent.dsorg} |\n` +
            `| RECFM | ${options.recfm} |\n` +
            `| LRECL | ${options.lrecl} |\n` +
            `| BLKSIZE | ${options.blksize} |\n`
        );

        const suggestions: ZosFollowup[] = [
            followup('ℹ️ Vérifier le dataset', `info sur ${intent.name}`, 'ds'),
        ];

        if (intent.dsorg === 'PO') {
            suggestions.push(
                followup('➕ Créer un membre', `crée un membre NEWPGM dans ${intent.name}`, 'ds')
            );
        }

        return suggestions;
    }

    // ================================================================
    // CREATE_MEMBER
    // ================================================================
    private async createMember(
        session: any,
        dataset: string,
        member: string,
        content: string | undefined,
        stream: vscode.ChatResponseStream
    ): Promise<ZosFollowup[]> {
        const data = content ?? '';
        const buffer = Buffer.from(data, 'utf-8');
        await Upload.bufferToDataSet(session, buffer, `${dataset}(${member})`, { binary: false });

        stream.markdown(
            `✅ **Membre créé** — \`${dataset}(${member})\`\n\n` +
            (content ? `${content.split('\n').length} lignes écrites.` : `Membre vide créé.`)
        );

        return [
            followup('📝 Lire le membre', `affiche ${dataset}(${member})`, 'ds'),
            followup('📄 Voir les membres', `montre les membres de ${dataset}`, 'ds'),
        ];
    }

    // ================================================================
    // DELETE_MEMBER
    // ================================================================
    private async deleteMember(
        session: any,
        dataset: string,
        member: string,
        stream: vscode.ChatResponseStream
    ): Promise<ZosFollowup[]> {
        await Delete.dataSet(session, `${dataset}(${member})`);
        stream.markdown(`✅ **Membre supprimé** — \`${dataset}(${member})\``);

        return [
            followup('📄 Voir les membres restants', `montre les membres de ${dataset}`, 'ds'),
        ];
    }

    // ================================================================
    // DELETE_DATASET
    // ================================================================
    private async deleteDataset(
        session: any,
        dataset: string,
        stream: vscode.ChatResponseStream
    ): Promise<ZosFollowup[]> {
        await Delete.dataSet(session, dataset);
        stream.markdown(`✅ **Dataset supprimé** — \`${dataset}\``);

        // Pas grand-chose à proposer après une suppression
        const hlq = dataset.split('.').slice(0, -1).join('.');
        return [
            followup('📁 Lister les datasets', `liste les datasets ${hlq}.**`, 'ds'),
        ];
    }

    // ================================================================
    // SEARCH_CONTENT
    // ================================================================
    private async searchContent(
        session: any,
        dataset: string,
        searchTerm: string,
        stream: vscode.ChatResponseStream,
        memberPattern?: string
    ): Promise<ZosFollowup[]> {
        const membersResponse = await List.allMembers(session, dataset, { pattern: memberPattern });
        const members = membersResponse.apiResponse?.items ?? [];

        if (members.length === 0) {
            stream.markdown(`Aucun membre trouvé dans \`${dataset}\`.`);
            return [];
        }

        stream.markdown(`### 🔍 Recherche de \`${searchTerm}\` dans \`${dataset}\`\n\n`);
        stream.progress(`Recherche dans ${members.length} membres...`);

        const results: { member: string; lines: { num: number; text: string }[] }[] = [];
        const maxMembers = Math.min(members.length, 50);

        for (let i = 0; i < maxMembers; i++) {
            const memberName = members[i].member;
            try {
                const content = await Download.dataSet(
                    session, `${dataset}(${memberName})`,
                    { returnEtag: false, stream: undefined as any }
                );
                const text = typeof content.apiResponse === 'string'
                    ? content.apiResponse
                    : Buffer.from(content.apiResponse).toString('utf-8');

                const matchingLines: { num: number; text: string }[] = [];
                const lines = text.split('\n');
                for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                    if (lines[lineNum].toUpperCase().includes(searchTerm.toUpperCase())) {
                        matchingLines.push({ num: lineNum + 1, text: lines[lineNum].trimEnd() });
                    }
                }
                if (matchingLines.length > 0) {
                    results.push({ member: memberName, lines: matchingLines });
                }
            } catch { /* skip */ }
        }

        if (results.length === 0) {
            stream.markdown(`Aucune occurrence de \`${searchTerm}\` trouvée dans ${maxMembers} membres.`);
            return [];
        }

        const totalHits = results.reduce((sum, r) => sum + r.lines.length, 0);
        stream.markdown(
            `**${totalHits} occurrences** dans **${results.length} membres** ` +
            `(${maxMembers}/${members.length} scannés)\n\n`
        );

        for (const result of results) {
            stream.markdown(`#### \`${result.member}\` — ${result.lines.length} occurrence(s)\n`);
            stream.markdown(`\`\`\`\n`);
            for (const line of result.lines.slice(0, 10)) {
                stream.markdown(`${String(line.num).padStart(6)} | ${line.text}\n`);
            }
            if (result.lines.length > 10) {
                stream.markdown(`  ... et ${result.lines.length - 10} autres lignes\n`);
            }
            stream.markdown(`\`\`\`\n\n`);
        }

        // Followups : proposer de lire les membres avec le plus de hits
        const topResults = results
            .sort((a, b) => b.lines.length - a.lines.length)
            .slice(0, 3);

        return topResults.map(r =>
            followup(
                `📝 Lire ${r.member} (${r.lines.length} hits)`,
                `affiche ${dataset}(${r.member})`,
                'ds'
            )
        );
    }

    // ================================================================
    // DATASET_INFO
    // ================================================================
    private async datasetInfo(
        session: any,
        dataset: string,
        stream: vscode.ChatResponseStream
    ): Promise<ZosFollowup[]> {
        const response = await List.dataSet(session, dataset, { attributes: true });
        const items = response.apiResponse?.items ?? [];

        if (items.length === 0) {
            stream.markdown(`Dataset \`${dataset}\` non trouvé.`);
            return [];
        }

        const ds = items[0];

        stream.markdown(`### ℹ️ Informations — \`${ds.dsname}\`\n\n`);
        stream.markdown(`| Propriété | Valeur |\n|-----------|--------|\n`);

        const props: [string, any][] = [
            ['Organisation', ds.dsorg], ['RECFM', ds.recfm], ['LRECL', ds.lrecl],
            ['BLKSIZE', ds.blksize], ['Volume', ds.vol], ['Unité', ds.unit],
            ['Création', ds.cdate], ['Référencé', ds.rdate], ['Expiration', ds.edate],
            ['Taille utilisée', ds.used !== undefined ? `${ds.used} extents` : undefined],
            ['Primaire', ds.primary], ['Secondaire', ds.secondary],
            ['Catalogue', ds.catnm], ['SMS Data', ds.dataclass],
            ['SMS Mgmt', ds.mgntclass], ['SMS Storage', ds.storeclass],
        ];

        for (const [label, value] of props) {
            if (value !== undefined && value !== null && value !== '') {
                stream.markdown(`| ${label} | \`${value}\` |\n`);
            }
        }

        const suggestions: ZosFollowup[] = [];

        if (ds.dsorg?.includes('PO')) {
            suggestions.push(
                followup('📄 Voir les membres', `montre les membres de ${dataset}`, 'ds'),
                followup('🔍 Chercher dans ce PDS', `cherche PERFORM dans ${dataset}`, 'ds'),
            );
        }

        return suggestions;
    }

    // ================================================================
    // Utilitaires
    // ================================================================

    private extractDatasetName(intent: DsIntent): string {
        switch (intent.type) {
            case 'LIST_DATASETS': return intent.pattern;
            case 'CREATE_DATASET': return intent.name;
            default: return (intent as any).dataset ?? '';
        }
    }

    private detectLanguage(member: string, content: string): string {
        if (content.match(/^\s{6}\w/m) || content.includes('IDENTIFICATION DIVISION')) return 'cobol';
        if (content.includes('//') && content.includes(' DD ')) return 'jcl';
        if (member.startsWith('ASM') || content.includes(' CSECT') || content.includes(' USING ')) return 'asm';
        if (content.includes('PROC ') && content.includes('END;')) return 'pli';
        if (content.includes('<') && content.includes('>')) return 'xml';
        return 'text';
    }
}
