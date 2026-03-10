import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { List, Download, Upload, Create, Delete, Copy, IZosFilesResponse } from '@zowe/zos-files-for-zowe-sdk';
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
import { detectLanguage, Lang } from '../utils/i18n';

// ============================================================
// Handler /ds — Datasets & Membres PDS
// 
// Chaque opération retourne un ZosChatResult contenant
// des followups contextuels affichés comme boutons cliquables.
// ============================================================

export class DatasetsHandler {
    private classifier: DsIntentClassifier;
    private lang: Lang = 'fr';

    constructor(
        private sessionManager: ZoweSessionManager,
        private telemetry: TelemetryService
    ) {
        this.classifier = new DsIntentClassifier();
    }

    /** Retourne la chaîne correspondant à la langue du prompt courant. */
    private t(fr: string, en: string): string { return this.lang === 'fr' ? fr : en; }

    async handle(
        request: vscode.ChatRequest,
        chatContext: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<ZosChatResult> {
        const prompt = request.prompt.trim();
        this.lang = detectLanguage(prompt);

        if (!prompt) {
            stream.markdown(
                this.t(
                    `**Commande /ds** — Gestion des datasets z/OS\n\nTapez votre requête en langage naturel après \`/ds\`.`,
                    `**Command /ds** — z/OS Dataset Management\n\nType your request in natural language after \`/ds\`.`
                )
            );
            return createResult('ds', undefined, [
                followup(this.t('📁 Lister des datasets', '📁 List datasets'), this.t('liste les datasets HLQ.**', 'list datasets HLQ.**'), 'ds'),
                followup(this.t('📄 Lister des membres', '📄 List members'), this.t('montre les membres de HLQ.COBOL.SRC', 'show members of HLQ.COBOL.SRC'), 'ds'),
                followup(this.t('📝 Lire un membre', '📝 Read a member'), this.t('affiche HLQ.COBOL.SRC(PGMA)', 'show HLQ.COBOL.SRC(PGMA)'), 'ds'),
                followup(this.t('🔍 Chercher du texte', '🔍 Search text'), this.t('cherche PERFORM dans HLQ.COBOL.SRC', 'search PERFORM in HLQ.COBOL.SRC'), 'ds'),
            ]);
        }

        // ── Step 1 : Classification ──
        stream.progress(this.t('Analyse de la requête...', 'Analyzing request...'));
        const intent = await this.classifier.classify(prompt, token, request.model);

        if (!intent) {
            stream.markdown(
                this.t(
                    `🤔 Je n'ai pas compris votre requête sur les datasets.`,
                    `🤔 I could not understand your dataset request.`
                )
            );
            return createResult('ds', undefined, [
                followup(this.t('📁 Lister des datasets', '📁 List datasets'), this.t('liste les datasets HLQ.**', 'list datasets HLQ.**'), 'ds'),
                followup(this.t('ℹ️ Info sur un dataset', 'ℹ️ Dataset info'), this.t('info sur HLQ.COBOL.LOAD', 'info on HLQ.COBOL.LOAD'), 'ds'),
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
        stream.progress(this.t('Connexion à z/OS...', 'Connecting to z/OS...'));
        const { session, profileName } = await this.sessionManager.getSession();
        stream.progress(this.t(`Exécution ${intent.type}...`, `Running ${intent.type}...`));

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
                followups = await this.deleteDataset(session, intent.dataset, stream, intent.volume);
                break;
            case 'SEARCH_CONTENT':
                followups = await this.searchContent(session, intent.dataset, intent.searchTerm, stream, intent.memberPattern);
                break;
            case 'DATASET_INFO':
                followups = await this.datasetInfo(session, intent.dataset, stream);
                break;
            case 'DOWNLOAD_MEMBER':
                followups = await this.downloadMember(session, intent.dataset, intent.member, stream, intent.targetDir);
                break;
            case 'DOWNLOAD_ALL_MEMBERS':
                followups = await this.downloadAllMembers(session, intent.dataset, stream, intent.targetDir);
                break;
            case 'DOWNLOAD_ALL_DATASETS':
                followups = await this.downloadAllDatasets(session, intent.pattern, stream, intent.targetDir);
                break;
            case 'UPLOAD_FILE_TO_MEMBER':
                followups = await this.uploadFileToMember(session, intent.localPath, intent.dataset, intent.member, stream);
                break;
            case 'UPLOAD_DIR_TO_PDS':
                followups = await this.uploadDirToPds(session, intent.localPath, intent.dataset, stream);
                break;
            case 'COPY_MEMBER':
                followups = await this.copyMember(
                    session, intent.fromDataset, intent.fromMember,
                    intent.toDataset, intent.toMember, stream, intent.replace
                );
                break;
            case 'COPY_DATASET':
                followups = await this.copyDataset(
                    session, intent.fromDataset, intent.toDataset, stream, intent.replace
                );
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
            stream.markdown(this.t(`Aucun dataset trouvé pour le pattern \`${pattern}\`.`, `No dataset found for pattern \`${pattern}\`.`));
            return [];
        }

        stream.markdown(`### 📁 Datasets — \`${pattern}\` (${items.length} ${this.t('résultats', 'results')})\n\n`);
        stream.markdown(`| Dataset | ${this.t('Organisation', 'Organization')} | RECFM | LRECL | Volume |\n`);
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
                followup(this.t(`📄 Membres de ${firstPds}`, `📄 Members of ${firstPds}`), this.t(`montre les membres de ${firstPds}`, `show members of ${firstPds}`), 'ds')
            );
        }
        if (items.length > 0) {
            const first = items[0].dsname;
            suggestions.push(
                followup(this.t(`ℹ️ Info sur ${first}`, `ℹ️ Info on ${first}`), this.t(`info sur ${first}`, `info on ${first}`), 'ds')
            );
        }
        if (pdsItems.length > 1) {
            const second = pdsItems[1].dsname;
            suggestions.push(
                followup(this.t(`📄 Membres de ${second}`, `📄 Members of ${second}`), this.t(`montre les membres de ${second}`, `show members of ${second}`), 'ds')
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
                    ? this.t(`Aucun membre correspondant à \`${pattern}\` dans \`${dataset}\`.`, `No member matching \`${pattern}\` in \`${dataset}\`.`)
                    : this.t(`Le dataset \`${dataset}\` ne contient aucun membre (ou n'est pas un PDS).`, `Dataset \`${dataset}\` has no members (or is not a PDS).`)
            );
            return [];
        }

        stream.markdown(`### 📄 ${this.t(`Membres de`, `Members of`)} \`${dataset}\` (${items.length})\n\n`);

        if (items.length > 20) {
            const columns = 4;
            const rows = Math.ceil(items.length / columns);
            const memberLabel = this.t('Membre', 'Member');
            stream.markdown(`| ${Array(columns).fill(memberLabel).join(' | ')} |\n`);
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
            stream.markdown(`| ${this.t('Membre', 'Member')} | ${this.t('Modifié', 'Changed')} | ${this.t('Taille', 'Size')} | ID |\n`);
            stream.markdown(`|--------|---------|--------|----|\n`);
            for (const m of items) {
                stream.markdown(
                    `| \`${m.member}\` | ${m.changed ?? m.m4date ?? '-'} ` +
                    `| ${m.init !== undefined ? `${m.init} ${this.t('lignes', 'lines')}` : '-'} | ${m.user ?? '-'} |\n`
                );
            }
        }

        // Followups : proposer de lire les premiers membres
        const suggestions: ZosFollowup[] = [];
        const topMembers = items.slice(0, 3);

        for (const m of topMembers) {
            suggestions.push(
                followup(
                    this.t(`📝 Lire ${m.member}`, `📝 Read ${m.member}`),
                    this.t(`affiche ${dataset}(${m.member})`, `show ${dataset}(${m.member})`),
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
            stream.markdown(this.t(`Le membre \`${dataset}(${member})\` est vide.`, `Member \`${dataset}(${member})\` is empty.`));
            return [];
        }

        const lines = text.split('\n');
        const codeLang = this.detectCodeLanguage(member, text);

        stream.markdown(`### 📝 \`${dataset}(${member})\` — ${lines.length} ${this.t('lignes', 'lines')}\n\n`);
        stream.markdown(`\`\`\`${codeLang}\n${text}\n\`\`\`\n`);

        stream.button({
            command: 'zos.openMember',
            title: this.t('📂 Ouvrir dans l\'éditeur', '📂 Open in editor'),
            arguments: [dataset, member],
        });

        return [
            followup(this.t('🔍 Chercher dans ce PDS', '🔍 Search in this PDS'), this.t(`cherche PERFORM dans ${dataset}`, `search PERFORM in ${dataset}`), 'ds'),
            followup(this.t('📄 Voir les autres membres', '📄 View other members'), this.t(`montre les membres de ${dataset}`, `show members of ${dataset}`), 'ds'),
            followup(this.t('ℹ️ Info sur le dataset', 'ℹ️ Dataset info'), this.t(`info sur ${dataset}`, `info on ${dataset}`), 'ds'),
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
            this.t(`✅ **Écriture réussie** — \`${dataset}(${member})\`\n\n${lines} lignes écrites.`,
                   `✅ **Write successful** — \`${dataset}(${member})\`\n\n${lines} lines written.`)
        );

        return [
            followup(this.t('📝 Relire le membre', '📝 Re-read member'), this.t(`affiche ${dataset}(${member})`, `show ${dataset}(${member})`), 'ds'),
            followup(this.t('📄 Voir les membres', '📄 View members'), this.t(`montre les membres de ${dataset}`, `show members of ${dataset}`), 'ds'),
        ];
    }

    // ================================================================
    // CREATE_DATASET
    // ================================================================

    // Mapping dstype → CreateDataSetTypeEnum numeric value
    // (const enum is inlined at compile time; we use a map for runtime safety with esbuild)
    private static readonly DS_TYPE_ENUM: Record<string, number> = {
        BINARY:      0,  // DATA_SET_BINARY      — PO, U,  blksize=27998, lrecl=27998
        C:           1,  // DATA_SET_C           — PO, VB, blksize=32760, lrecl=260, dirblk=25
        CLASSIC:     2,  // DATA_SET_CLASSIC     — PO, FB, blksize=6160,  lrecl=80,  dirblk=25
        PARTITIONED: 3,  // DATA_SET_PARTITIONED — PO, FB, blksize=6160,  lrecl=80,  dirblk=5
        SEQUENTIAL:  4,  // DATA_SET_SEQUENTIAL  — PS, FB, blksize=6160,  lrecl=80
    };

    private static readonly DS_TYPE_DSORG: Record<string, string> = {
        BINARY: 'PO', C: 'PO', CLASSIC: 'PO', PARTITIONED: 'PO', SEQUENTIAL: 'PS',
    };

    private async createDataset(
        session: any,
        intent: {
            name: string;
            dstype?: 'PARTITIONED' | 'SEQUENTIAL' | 'CLASSIC' | 'BINARY' | 'C';
            likeDataset?: string;
            lrecl?: number; blksize?: number; recfm?: string;
            primary?: number; secondary?: number; dirblk?: number;
            alcunit?: string; volser?: string;
            storclass?: string; mgntclass?: string; dataclass?: string; dsntype?: string;
        },
        stream: vscode.ChatResponseStream
    ): Promise<ZosFollowup[]> {
        const cfg = vscode.workspace.getConfiguration('zosAssistant.createDefaults');

        // Build override options common to both dataSet() and dataSetLike()
        const options: Record<string, unknown> = {};
        if (intent.alcunit   !== undefined) { options.alcunit   = intent.alcunit; }
        if (intent.primary   !== undefined) { options.primary   = intent.primary; }
        if (intent.secondary !== undefined) { options.secondary = intent.secondary; }
        if (intent.recfm     !== undefined) { options.recfm     = intent.recfm; }
        if (intent.lrecl     !== undefined) { options.lrecl     = intent.lrecl; }
        if (intent.blksize   !== undefined) { options.blksize   = intent.blksize; }
        if (intent.dirblk    !== undefined) { options.dirblk    = intent.dirblk; }
        if (intent.volser    !== undefined) { options.volser    = intent.volser; }
        if (intent.storclass !== undefined) { options.storclass = intent.storclass; }
        if (intent.mgntclass !== undefined) { options.mgntclass = intent.mgntclass; }
        if (intent.dataclass !== undefined) { options.dataclass = intent.dataclass; }
        if (intent.dsntype   !== undefined) { options.dsntype   = intent.dsntype; }

        if (intent.likeDataset) {
            // ── ALLOCATE LIKE ────────────────────────────────────────
            stream.progress(this.t(`Création de \`${intent.name}\` sur le modèle de \`${intent.likeDataset}\`...`, `Creating \`${intent.name}\` like \`${intent.likeDataset}\`...`));
            await Create.dataSetLike(session, intent.name, intent.likeDataset, options as any);

            stream.markdown(
                `### ✅ ${this.t('Dataset créé', 'Dataset created')} — \`${intent.name}\`\n\n` +
                `| ${this.t('Attribut', 'Attribute')} | ${this.t('Valeur', 'Value')} |\n|-----------|-------|\n` +
                `| ${this.t('Modèle', 'Model')} | \`${intent.likeDataset}\` |\n` +
                (Object.keys(options).length > 0
                    ? Object.entries(options).map(([k, v]) => `| ${k.toUpperCase()} | ${v} |\n`).join('')
                    : '')
            );
        } else {
            // ── TYPE PRESET ──────────────────────────────────────────
            const dstype = intent.dstype ?? 'PARTITIONED';
            const typeEnum = DatasetsHandler.DS_TYPE_ENUM[dstype] ?? 3;
            const isPds = DatasetsHandler.DS_TYPE_DSORG[dstype] === 'PO';

            // Apply settings defaults only when the intent did not specify the value
            if (options.alcunit   === undefined) { options.alcunit   = cfg.get<string>('alcunit')  ?? 'TRK'; }
            if (options.primary   === undefined) { options.primary   = cfg.get<number>('primary')  ?? 10; }
            if (options.secondary === undefined) { options.secondary = cfg.get<number>('secondary') ?? 5; }

            if (dstype !== 'BINARY' && dstype !== 'C') {
                if (options.recfm   === undefined) { options.recfm  = cfg.get<string>('recfm') ?? 'FB'; }
                if (options.lrecl   === undefined) { options.lrecl  = cfg.get<number>('lrecl') ?? 80; }
                const cfgBlk = cfg.get<number>('blksize');
                if (options.blksize === undefined && cfgBlk) { options.blksize = cfgBlk; }
            }

            if (isPds && options.dirblk === undefined) {
                options.dirblk = cfg.get<number>('dirblkPds') ?? 20;
            }

            if (options.volser    === undefined) { const v = cfg.get<string>('volser');    if (v) { options.volser    = v; } }
            if (options.storclass === undefined) { const v = cfg.get<string>('storclass'); if (v) { options.storclass = v; } }
            if (options.mgntclass === undefined) { const v = cfg.get<string>('mgntclass'); if (v) { options.mgntclass = v; } }
            if (options.dataclass === undefined) { const v = cfg.get<string>('dataclass'); if (v) { options.dataclass = v; } }

            stream.progress(this.t(`Création du dataset \`${intent.name}\` (${dstype})...`, `Creating dataset \`${intent.name}\` (${dstype})...`));
            await Create.dataSet(session, typeEnum, intent.name, options as any);

            const dsorg = DatasetsHandler.DS_TYPE_DSORG[dstype];
            stream.markdown(
                `### ✅ ${this.t('Dataset créé', 'Dataset created')} — \`${intent.name}\`\n\n` +
                `| ${this.t('Attribut', 'Attribute')} | ${this.t('Valeur', 'Value')} |\n|-----------|-------|\n` +
                `| ${this.t('Type', 'Type')} | ${dstype} |\n` +
                `| DSORG | ${dsorg} |\n` +
                `| ALCUNIT | ${options.alcunit} |\n` +
                `| PRIMARY | ${options.primary} |\n` +
                `| SECONDARY | ${options.secondary} |\n` +
                (options.recfm   ? `| RECFM | ${options.recfm} |\n`   : '') +
                (options.lrecl   ? `| LRECL | ${options.lrecl} |\n`   : '') +
                (options.blksize ? `| BLKSIZE | ${options.blksize} |\n` : '') +
                (options.dirblk  ? `| DIRBLK | ${options.dirblk} |\n`  : '') +
                (options.volser    ? `| VOLSER | ${options.volser} |\n`       : '') +
                (options.storclass ? `| STORCLASS | ${options.storclass} |\n` : '') +
                (options.mgntclass ? `| MGNTCLASS | ${options.mgntclass} |\n` : '') +
                (options.dataclass ? `| DATACLASS | ${options.dataclass} |\n` : '')
            );

            const isPdsResult = DatasetsHandler.DS_TYPE_DSORG[dstype] === 'PO';
            if (isPdsResult) {
                return [
                    followup(this.t('ℹ️ Info dataset', 'ℹ️ Dataset info'), this.t(`info sur ${intent.name}`, `info on ${intent.name}`), 'ds'),
                    followup(this.t('➕ Créer un membre', '➕ Create a member'), this.t(`crée un membre NEWPGM dans ${intent.name}`, `create member NEWPGM in ${intent.name}`), 'ds'),
                ];
            }
        }

        return [ followup(this.t('ℹ️ Info dataset', 'ℹ️ Dataset info'), this.t(`info sur ${intent.name}`, `info on ${intent.name}`), 'ds') ];
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
            `✅ **${this.t('Membre créé', 'Member created')}** — \`${dataset}(${member})\`\n\n` +
            (content
                ? this.t(`${content.split('\n').length} lignes écrites.`, `${content.split('\n').length} lines written.`)
                : this.t('Membre vide créé.', 'Empty member created.'))
        );

        return [
            followup(this.t('📝 Lire le membre', '📝 Read member'), this.t(`affiche ${dataset}(${member})`, `show ${dataset}(${member})`), 'ds'),
            followup(this.t('📄 Voir les membres', '📄 View members'), this.t(`montre les membres de ${dataset}`, `show members of ${dataset}`), 'ds'),
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
        stream.progress(this.t(`Suppression de \`${dataset}(${member})\`...`, `Deleting member \`${dataset}(${member})\`...`));
        await Delete.dataSet(session, `${dataset}(${member})`);

        stream.markdown(
            `### ✅ ${this.t('Membre supprimé', 'Member deleted')} — \`${dataset}(${member})\`\n\n` +
            `> ⚠️ ${this.t('Cette opération est irréversible.', 'This operation is irreversible.')}`
        );

        return [
            followup(this.t('📄 Membres restants', '📄 Remaining members'), this.t(`montre les membres de ${dataset}`, `show members of ${dataset}`), 'ds'),
        ];
    }

    // ================================================================
    // DELETE_DATASET
    // ================================================================
    private async deleteDataset(
        session: any,
        dataset: string,
        stream: vscode.ChatResponseStream,
        volume?: string
    ): Promise<ZosFollowup[]> {
        stream.progress(this.t(`Suppression de \`${dataset}\`${volume ? ` (volume: ${volume})` : ''}...`, `Deleting \`${dataset}\`${volume ? ` (volume: ${volume})` : ''}...`));
        await Delete.dataSet(session, dataset, volume ? { volume } : undefined);

        stream.markdown(
            `### ✅ ${this.t('Dataset supprimé', 'Dataset deleted')} — \`${dataset}\`\n\n` +
            (volume ? `> Volume: \`${volume}\`\n\n` : '') +
            `> ⚠️ ${this.t('Cette opération est irréversible.', 'This operation is irreversible.')}`
        );

        const hlq = dataset.split('.').slice(0, -1).join('.');
        return [
            followup(this.t('📁 Datasets restants', '📁 Remaining datasets'), this.t(`liste les datasets ${hlq}.**`, `list datasets ${hlq}.**`), 'ds'),
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
            stream.markdown(this.t(`Aucun membre trouvé dans \`${dataset}\`.`, `No member found in \`${dataset}\`.`));
            return [];
        }

        stream.markdown(`### 🔍 ${this.t(`Recherche de \`${searchTerm}\` dans \`${dataset}\``, `Search for \`${searchTerm}\` in \`${dataset}\``)}\n\n`);
        stream.progress(this.t(`Recherche dans ${members.length} membres...`, `Searching ${members.length} members...`));

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
            stream.markdown(this.t(`Aucune occurrence de \`${searchTerm}\` trouvée dans ${maxMembers} membres.`, `No occurrence of \`${searchTerm}\` found in ${maxMembers} members.`));
            return [];
        }

        const totalHits = results.reduce((sum, r) => sum + r.lines.length, 0);
        stream.markdown(
            `**${totalHits} ${this.t('occurrences', 'occurrences')}** ${this.t('dans', 'in')} **${results.length} ${this.t('membres', 'members')}** ` +
            `(${maxMembers}/${members.length} ${this.t('scannés', 'scanned')})\n\n`
        );

        for (const result of results) {
            stream.markdown(`#### \`${result.member}\` — ${result.lines.length} occurrence(s)\n`);
            stream.markdown(`\`\`\`\n`);
            for (const line of result.lines.slice(0, 10)) {
                stream.markdown(`${String(line.num).padStart(6)} | ${line.text}\n`);
            }
            if (result.lines.length > 10) {
                stream.markdown(`  ... ${this.t(`et ${result.lines.length - 10} autres lignes`, `and ${result.lines.length - 10} more lines`)}\n`);
            }
            stream.markdown(`\`\`\`\n\n`);
        }

        // Followups : proposer de lire les membres avec le plus de hits
        const topResults = results
            .sort((a, b) => b.lines.length - a.lines.length)
            .slice(0, 3);

        return topResults.map(r =>
            followup(
                this.t(`📝 Lire ${r.member} (${r.lines.length} hits)`, `📝 Read ${r.member} (${r.lines.length} hits)`),
                this.t(`affiche ${dataset}(${r.member})`, `show ${dataset}(${r.member})`),
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
            stream.markdown(this.t(`Dataset \`${dataset}\` non trouvé.`, `Dataset \`${dataset}\` not found.`));
            return [];
        }

        const ds = items[0];

        stream.markdown(`### ℹ️ ${this.t('Informations', 'Information')} — \`${ds.dsname}\`\n\n`);
        stream.markdown(`| ${this.t('Propriété', 'Property')} | ${this.t('Valeur', 'Value')} |\n|-----------|--------|\n`);

        const props: [string, any][] = [
            [this.t('Organisation', 'Organization'), ds.dsorg],
            ['RECFM', ds.recfm], ['LRECL', ds.lrecl], ['BLKSIZE', ds.blksize],
            [this.t('Volume', 'Volume'), ds.vol],
            [this.t('Unité', 'Unit'), ds.unit],
            [this.t('Création', 'Created'), ds.cdate],
            [this.t('Référencé', 'Referenced'), ds.rdate],
            [this.t('Expiration', 'Expiration'), ds.edate],
            [this.t('Taille utilisée', 'Used size'), ds.used !== undefined ? `${ds.used} extents` : undefined],
            [this.t('Primaire', 'Primary'), ds.primary],
            [this.t('Secondaire', 'Secondary'), ds.secondary],
            [this.t('Catalogue', 'Catalog'), ds.catnm],
            ['SMS Data', ds.dataclass],
            ['SMS Mgmt', ds.mgntclass],
            ['SMS Storage', ds.storeclass],
        ];

        for (const [label, value] of props) {
            if (value !== undefined && value !== null && value !== '') {
                stream.markdown(`| ${label} | \`${value}\` |\n`);
            }
        }

        const suggestions: ZosFollowup[] = [];

        if (ds.dsorg?.includes('PO')) {
            suggestions.push(
                followup(this.t('📄 Voir les membres', '📄 View members'), this.t(`montre les membres de ${dataset}`, `show members of ${dataset}`), 'ds'),
                followup(this.t('🔍 Chercher dans ce PDS', '🔍 Search in this PDS'), this.t(`cherche PERFORM dans ${dataset}`, `search PERFORM in ${dataset}`), 'ds'),
            );
        }

        return suggestions;
    }

    // ================================================================
    // Utilitaires
    // ================================================================

    // ================================================================
    // DOWNLOAD_MEMBER
    // ================================================================
    private async downloadMember(
        session: any,
        dataset: string,
        member: string,
        stream: vscode.ChatResponseStream,
        targetDir?: string
    ): Promise<ZosFollowup[]> {
        const localDir = this.resolveDownloadDir(targetDir);
        const dsDir = path.join(localDir, dataset.replace(/\./g, path.sep));
        fs.mkdirSync(dsDir, { recursive: true });

        const ext = this.pdsExtension(dataset);
        const localFile = path.join(dsDir, `${member.toUpperCase()}${ext}`);

        await Download.dataSet(session, `${dataset}(${member})`, {
            file: localFile,
        });

        const relPath = path.relative(
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? localDir,
            localFile
        );

        stream.markdown(
            `### ⬇️ ${this.t('Membre téléchargé', 'Member downloaded')} — \`${dataset}(${member})\`\n\n` +
            `${this.t('Fichier local', 'Local file')} : \`${relPath}\`\n`
        );

        stream.button({
            command: 'vscode.open',
            title: this.t('📂 Ouvrir le fichier', '📂 Open file'),
            arguments: [vscode.Uri.file(localFile)],
        });

        return [
            followup(this.t('📄 Voir les membres', '📄 View members'), this.t(`montre les membres de ${dataset}`, `show members of ${dataset}`), 'ds'),
            followup(this.t('⬇️ Télécharger tous les membres', '⬇️ Download all members'), this.t(`download tous les membres de ${dataset}`, `download all members of ${dataset}`), 'ds'),
        ];
    }

    // ================================================================
    // DOWNLOAD_ALL_MEMBERS
    // ================================================================
    private async downloadAllMembers(
        session: any,
        dataset: string,
        stream: vscode.ChatResponseStream,
        targetDir?: string
    ): Promise<ZosFollowup[]> {
        const localDir = this.resolveDownloadDir(targetDir);
        const dsDir = path.join(localDir, dataset.replace(/\./g, path.sep));
        fs.mkdirSync(dsDir, { recursive: true });

        stream.progress(this.t(`Téléchargement de tous les membres de ${dataset}...`, `Downloading all members of ${dataset}...`));

        await Download.allMembers(session, dataset, {
            directory: dsDir,
        });

        const files = fs.existsSync(dsDir) ? this.renameDownloadedFiles(dsDir, dataset) : [];
        const relDir = path.relative(
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? localDir,
            dsDir
        );

        stream.markdown(
            `### ⬇️ ${this.t('Membres téléchargés', 'Members downloaded')} — \`${dataset}\`\n\n` +
            `**${files.length} ${this.t('fichier(s)', 'file(s)')}** ${this.t('dans', 'in')} \`${relDir}\`\n`
        );

        stream.button({
            command: 'revealFileInOS',
            title: this.t('📁 Ouvrir le dossier', '📁 Open folder'),
            arguments: [vscode.Uri.file(dsDir)],
        });

        return [
            followup(this.t('📄 Lister les membres', '📄 List members'), this.t(`montre les membres de ${dataset}`, `show members of ${dataset}`), 'ds'),
        ];
    }

    // ================================================================
    // DOWNLOAD_ALL_DATASETS
    // ================================================================
    private async downloadAllDatasets(
        session: any,
        pattern: string,
        stream: vscode.ChatResponseStream,
        targetDir?: string
    ): Promise<ZosFollowup[]> {
        // Step 1 : récupérer la liste des datasets
        stream.progress(this.t(`Récupération de la liste des datasets pour ${pattern}...`, `Fetching dataset list for ${pattern}...`));
        const listResponse = await List.dataSet(session, pattern, { attributes: true });
        const dataSetObjs = listResponse.apiResponse?.items ?? [];

        if (dataSetObjs.length === 0) {
            stream.markdown(this.t(`Aucun dataset trouvé pour le pattern \`${pattern}\`.`, `No dataset found for pattern \`${pattern}\`.`));
            return [];
        }

        // Step 2 : téléchargement groupé
        const localDir = this.resolveDownloadDir(targetDir);
        fs.mkdirSync(localDir, { recursive: true });

        stream.progress(this.t(`Téléchargement de ${dataSetObjs.length} dataset(s)...`, `Downloading ${dataSetObjs.length} dataset(s)...`));

        await Download.allDataSets(session, dataSetObjs, {
            directory: localDir,
        });

        // Step 3 : renommage — majuscules + extension dérivée du nom de PDS
        stream.progress(this.t('Renommage des fichiers téléchargés...', 'Renaming downloaded files...'));
        this.renameDatasetFiles(localDir, dataSetObjs);

        const relDir = path.relative(
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? localDir,
            localDir
        );

        stream.markdown(
            `### ⬇️ ${this.t('Datasets téléchargés', 'Datasets downloaded')} — \`${pattern}\`\n\n` +
            `**${dataSetObjs.length} dataset(s)** ${this.t('dans', 'in')} \`${relDir || '.'}\`\n\n` +
            `| Dataset | ${this.t('Organisation', 'Organization')} |\n|---------|-------------|\n` +
            dataSetObjs.slice(0, 20).map((ds: any) =>
                `| \`${ds.dsname}\` | ${ds.dsorg ?? '-'} |`
            ).join('\n') +
            (dataSetObjs.length > 20 ? `\n| ... ${this.t(`et ${dataSetObjs.length - 20} autres`, `and ${dataSetObjs.length - 20} more`)} | |` : '')
        );

        stream.button({
            command: 'revealFileInOS',
            title: this.t('📁 Ouvrir le dossier', '📁 Open folder'),
            arguments: [vscode.Uri.file(localDir)],
        });

        return [
            followup(this.t('📁 Lister les datasets', '📁 List datasets'), this.t(`liste les datasets ${pattern}`, `list datasets ${pattern}`), 'ds'),
        ];
    }

    // ================================================================
    // UPLOAD_FILE_TO_MEMBER
    // ================================================================
    private async uploadFileToMember(
        session: any,
        localPath: string,
        dataset: string,
        member: string,
        stream: vscode.ChatResponseStream
    ): Promise<ZosFollowup[]> {
        const filePath = this.resolveLocalPath(localPath);

        if (!fs.existsSync(filePath)) {
            stream.markdown(this.t(`❌ Fichier introuvable : \`${filePath}\``, `❌ File not found: \`${filePath}\``));
            return [];
        }

        const target = `${dataset}(${member})`;
        stream.progress(this.t(`Upload de \`${filePath}\` vers \`${target}\`...`, `Uploading \`${filePath}\` to \`${target}\`...`));

        await Upload.fileToDataset(session, filePath, target);

        const size = fs.statSync(filePath).size;
        stream.markdown(
            `### ⬆️ ${this.t('Upload réussi', 'Upload successful')} — \`${target}\`\n\n` +
            `| ${this.t('Propriété', 'Property')} | ${this.t('Valeur', 'Value')} |\n|-----------|--------|\n` +
            `| ${this.t('Source', 'Source')} | \`${filePath}\` |\n` +
            `| ${this.t('Taille', 'Size')} | ${(size / 1024).toFixed(1)} ${this.t('Ko', 'KB')} |\n` +
            `| ${this.t('Destination', 'Destination')} | \`${target}\` |\n`
        );

        return [
            followup(this.t(`📝 Lire ${member}`, `📝 Read ${member}`), this.t(`affiche ${dataset}(${member})`, `show ${dataset}(${member})`), 'ds'),
            followup(this.t('📄 Voir les membres', '📄 View members'), this.t(`montre les membres de ${dataset}`, `show members of ${dataset}`), 'ds'),
        ];
    }

    // ================================================================
    // UPLOAD_DIR_TO_PDS
    // ================================================================
    private async uploadDirToPds(
        session: any,
        localPath: string,
        dataset: string,
        stream: vscode.ChatResponseStream
    ): Promise<ZosFollowup[]> {
        const dirPath = this.resolveLocalPath(localPath);

        if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
            stream.markdown(this.t(`❌ Répertoire introuvable : \`${dirPath}\``, `❌ Directory not found: \`${dirPath}\``));
            return [];
        }

        const files = fs.readdirSync(dirPath).filter(f =>
            fs.statSync(path.join(dirPath, f)).isFile()
        );

        if (files.length === 0) {
            stream.markdown(this.t(`❌ Le répertoire \`${dirPath}\` est vide.`, `❌ Directory \`${dirPath}\` is empty.`));
            return [];
        }

        stream.progress(this.t(`Upload de ${files.length} fichier(s) vers \`${dataset}\`...`, `Uploading ${files.length} file(s) to \`${dataset}\`...`));

        await Upload.dirToPds(session, dirPath, dataset);

        stream.markdown(
            `### ⬆️ ${this.t('Upload réussi', 'Upload successful')} — \`${dataset}\`\n\n` +
            `**${files.length} ${this.t('fichier(s)', 'file(s)')}** ${this.t('uploadés depuis', 'uploaded from')} \`${dirPath}\`\n\n` +
            `| ${this.t('Fichier local', 'Local file')} | ${this.t('Membre', 'Member')} |\n|---------------|--------|\n` +
            files.slice(0, 20).map(f => {
                const memberName = path.basename(f, path.extname(f)).toUpperCase().slice(0, 8);
                return `| \`${f}\` | \`${memberName}\` |`;
            }).join('\n') +
            (files.length > 20 ? `\n| ... ${this.t(`et ${files.length - 20} autres`, `and ${files.length - 20} more`)} | |` : '')
        );

        return [
            followup(this.t('📄 Voir les membres uploadés', '📄 View uploaded members'), this.t(`montre les membres de ${dataset}`, `show members of ${dataset}`), 'ds'),
            followup(this.t('🔍 Chercher dans le PDS', '🔍 Search in PDS'), this.t(`cherche IDENTIFICATION dans ${dataset}`, `search IDENTIFICATION in ${dataset}`), 'ds'),
        ];
    }

    // ================================================================
    // COPY_MEMBER
    // ================================================================
    private async copyMember(
        session: any,
        fromDataset: string,
        fromMember: string,
        toDataset: string,
        toMember: string,
        stream: vscode.ChatResponseStream,
        replace = false
    ): Promise<ZosFollowup[]> {
        stream.progress(this.t(`Copie de \`${fromDataset}(${fromMember})\` → \`${toDataset}(${toMember})\`...`, `Copying \`${fromDataset}(${fromMember})\` → \`${toDataset}(${toMember})\`...`));

        await Copy.dataSet(
            session,
            { dsn: toDataset, member: toMember },
            { 'from-dataset': { dsn: fromDataset, member: fromMember }, replace }
        );

        stream.markdown(
            `### ✅ ${this.t('Membre copié', 'Member copied')}\n\n` +
            `| | Dataset | ${this.t('Membre', 'Member')} |\n|--|---------|--------|\n` +
            `| **${this.t('Source', 'From')}** | \`${fromDataset}\` | \`${fromMember}\` |\n` +
            `| **${this.t('Destination', 'To')}**   | \`${toDataset}\` | \`${toMember}\` |\n`
        );

        return [
            followup(this.t(`📝 Lire ${toMember}`, `📝 Read ${toMember}`), this.t(`affiche ${toDataset}(${toMember})`, `show ${toDataset}(${toMember})`), 'ds'),
            followup(this.t('📄 Membres destination', '📄 Target members'), this.t(`montre les membres de ${toDataset}`, `show members of ${toDataset}`), 'ds'),
        ];
    }

    // ================================================================
    // COPY_DATASET
    // ================================================================
    private async copyDataset(
        session: any,
        fromDataset: string,
        toDataset: string,
        stream: vscode.ChatResponseStream,
        replace = false
    ): Promise<ZosFollowup[]> {
        stream.progress(this.t(`Inspection de \`${fromDataset}\`...`, `Inspecting \`${fromDataset}\`...`));
        const isPds = await Copy.isPDS(session, fromDataset);

        if (isPds) {
            // PDS: copy member by member; `replace` overwrites existing members in target
            const membersResp = await List.allMembers(session, fromDataset);
            const members: { member: string }[] = membersResp.apiResponse?.items ?? [];

            stream.progress(this.t(`Copie de ${members.length} membre(s) de \`${fromDataset}\` vers \`${toDataset}\`...`, `Copying ${members.length} member(s) from \`${fromDataset}\` to \`${toDataset}\`...`));
            let copied = 0;
            const errors: string[] = [];

            for (const { member } of members) {
                try {
                    await Copy.dataSet(
                        session,
                        { dsn: toDataset, member },
                        { 'from-dataset': { dsn: fromDataset, member }, replace }
                    );
                    copied++;
                } catch (err: any) {
                    errors.push(`${member}: ${err?.message ?? 'error'}`);
                }
            }

            stream.markdown(
                `### ✅ ${this.t('PDS copié', 'PDS copied')} — \`${fromDataset}\` → \`${toDataset}\`\n\n` +
                `**${copied} / ${members.length}** ${this.t('membre(s) copié(s).', 'member(s) copied successfully.')}\n` +
                (errors.length > 0
                    ? `\n⚠️ **${errors.length} ${this.t('erreur(s)', 'error(s)')}:**\n${errors.slice(0, 5).map(e => `- ${e}`).join('\n')}\n`
                    : '')
            );

            return [
                followup(this.t('📄 Membres destination', '📄 Target members'), this.t(`montre les membres de ${toDataset}`, `show members of ${toDataset}`), 'ds'),
                followup(this.t('ℹ️ Info dataset destination', 'ℹ️ Target dataset info'), this.t(`info sur ${toDataset}`, `info on ${toDataset}`), 'ds'),
            ];
        } else {
            // Sequential dataset: `overwrite` deletes the target before recreating+copying
            stream.progress(this.t(`Copie du dataset séquentiel \`${fromDataset}\` → \`${toDataset}\`...`, `Copying sequential dataset \`${fromDataset}\` → \`${toDataset}\`...`));

            await Copy.dataSet(
                session,
                { dsn: toDataset },
                { 'from-dataset': { dsn: fromDataset }, overwrite: replace }
            );

            stream.markdown(
                `### ✅ ${this.t('Dataset copié', 'Dataset copied')}\n\n` +
                `| | Dataset |\n|--|--------|\n` +
                `| **${this.t('Source', 'From')}** | \`${fromDataset}\` |\n` +
                `| **${this.t('Destination', 'To')}**   | \`${toDataset}\` |\n`
            );

            return [
                followup(this.t('ℹ️ Info dataset destination', 'ℹ️ Target dataset info'), this.t(`info sur ${toDataset}`, `info on ${toDataset}`), 'ds'),
            ];
        }
    }

    private resolveLocalPath(localPath: string): string {
        if (path.isAbsolute(localPath)) { return localPath; }
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        return workspaceRoot ? path.join(workspaceRoot, localPath) : localPath;
    }

    private resolveDownloadDir(targetDir?: string): string {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const base = workspaceRoot ?? require('os').homedir();
        return targetDir
            ? path.isAbsolute(targetDir) ? targetDir : path.join(base, targetDir)
            : path.join(base, 'downloads');
    }

    /**
     * Déduit l'extension locale à partir des qualificateurs du nom de PDS.
     * Ex : HLQ.COBOL.SRC → .cbl, HLQ.JCL.CNTL → .jcl
     */
    private pdsExtension(dataset: string): string {
        for (const part of dataset.toUpperCase().split('.')) {
            if (/^(COBOL|CBL|COB)$/.test(part))           { return '.cbl'; }
            if (/^(JCL|CNTL|JCLLIB)$/.test(part))         { return '.jcl'; }
            if (/^(PROC|PROCLIB)$/.test(part))             { return '.proc'; }
            if (/^(ASM|ASSEM|MACLIB|MAC)$/.test(part))     { return '.asm'; }
            if (/^(COPY|CPY|COPYBOOK|COPYLIB)$/.test(part)){ return '.cpy'; }
            if (/^(PLI|PL1)$/.test(part))                  { return '.pli'; }
            if (/^(REXX|EXEC)$/.test(part))                { return '.rexx'; }
            if (/^(XML)$/.test(part))                      { return '.xml'; }
        }
        return '.txt';
    }

    /**
     * Renomme les fichiers déposés par le SDK dans `dir` :
     * majuscules + extension dérivée du PDS.
     */
    private renameDownloadedFiles(dir: string, dataset: string): string[] {
        const ext = this.pdsExtension(dataset);
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

    /**
     * Post-traitement après Download.allDataSets :
     * - PDS (dsorg PO) : renomme les membres dans le sous-répertoire
     * - Séquentiel     : renomme le fichier lui-même
     */
    private renameDatasetFiles(localDir: string, dataSetObjs: any[]): void {
        for (const ds of dataSetObjs) {
            const dsLocalPath = path.join(localDir, ds.dsname.replace(/\./g, path.sep));
            if (!fs.existsSync(dsLocalPath)) { continue; }

            if (fs.statSync(dsLocalPath).isDirectory()) {
                // PDS : les membres sont dans ce répertoire
                this.renameDownloadedFiles(dsLocalPath, ds.dsname);
            } else {
                // Séquentiel : renommer le fichier lui-même
                const ext = this.pdsExtension(ds.dsname);
                const dir = path.dirname(dsLocalPath);
                const newName = path.basename(dsLocalPath).toUpperCase() + ext;
                const newPath = path.join(dir, newName);
                if (dsLocalPath !== newPath) { fs.renameSync(dsLocalPath, newPath); }
            }
        }
    }

    private extractDatasetName(intent: DsIntent): string {
        switch (intent.type) {
            case 'LIST_DATASETS': return intent.pattern;
            case 'CREATE_DATASET': return intent.name;
            default: return (intent as any).dataset ?? '';
        }
    }

    private detectCodeLanguage(member: string, content: string): string {
        if (content.match(/^\s{6}\w/m) || content.includes('IDENTIFICATION DIVISION')) return 'cobol';
        if (content.includes('//') && content.includes(' DD ')) return 'jcl';
        if (member.startsWith('ASM') || content.includes(' CSECT') || content.includes(' USING ')) return 'asm';
        if (content.includes('PROC ') && content.includes('END;')) return 'pli';
        if (content.includes('<') && content.includes('>')) return 'xml';
        return 'text';
    }
}
