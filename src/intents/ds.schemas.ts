// ============================================================
// Intent schemas for the /ds command
// Each intent maps to a specific Zowe SDK operation
// ============================================================

export type DsIntent =
    | ListDatasetsIntent
    | ListMembersIntent
    | ReadMemberIntent
    | WriteMemberIntent
    | CreateDatasetIntent
    | CreateMemberIntent
    | DeleteMemberIntent
    | DeleteDatasetIntent
    | SearchContentIntent
    | DatasetInfoIntent
    | DownloadMemberIntent
    | DownloadAllMembersIntent
    | DownloadAllDatasetsIntent
    | UploadFileToMemberIntent
    | UploadDirToPdsIntent
    | CopyMemberIntent
    | CopyDatasetIntent;

export interface ListDatasetsIntent {
    type: 'LIST_DATASETS';
    pattern: string; // ex: "HLQ.COBOL.**"
}

export interface ListMembersIntent {
    type: 'LIST_MEMBERS';
    dataset: string; // ex: "HLQ.COBOL.SRC"
    pattern?: string; // filtre optionnel sur le nom du membre
}

export interface ReadMemberIntent {
    type: 'READ_MEMBER';
    dataset: string;
    member: string;
}

export interface WriteMemberIntent {
    type: 'WRITE_MEMBER';
    dataset: string;
    member: string;
    content: string;
}

export interface CreateDatasetIntent {
    type: 'CREATE_DATASET';
    name: string;
    // Dataset type — maps to Zowe SDK CreateDataSetTypeEnum
    // PARTITIONED = standard PDS (PO, FB/80, 5 dirblks)
    // SEQUENTIAL  = flat file (PS, FB/80)
    // CLASSIC     = PDS with 25 dirblks (legacy style)
    // BINARY      = binary PDS (U, blksize=27998)
    // C           = C-language PDS (VB, lrecl=260)
    dstype?: 'PARTITIONED' | 'SEQUENTIAL' | 'CLASSIC' | 'BINARY' | 'C';
    // Allocate like an existing dataset (uses Create.dataSetLike)
    likeDataset?: string;
    // Attribute overrides — defaults come from VS Code settings
    lrecl?: number;
    blksize?: number;
    recfm?: string;
    primary?: number;
    secondary?: number;
    dirblk?: number;
    alcunit?: 'TRK' | 'CYL';
    volser?: string;
    storclass?: string;
    mgntclass?: string;
    dataclass?: string;
    dsntype?: string;
}

export interface CreateMemberIntent {
    type: 'CREATE_MEMBER';
    dataset: string;
    member: string;
    content?: string;
}

export interface DeleteMemberIntent {
    type: 'DELETE_MEMBER';
    dataset: string;
    member: string;
}

export interface DeleteDatasetIntent {
    type: 'DELETE_DATASET';
    dataset: string;
    volume?: string; // required when dataset is not SMS-managed
}

export interface SearchContentIntent {
    type: 'SEARCH_CONTENT';
    dataset: string;
    searchTerm: string;
    memberPattern?: string;
}

export interface DatasetInfoIntent {
    type: 'DATASET_INFO';
    dataset: string;
}

export interface DownloadMemberIntent {
    type: 'DOWNLOAD_MEMBER';
    dataset: string;
    member: string;
    targetDir?: string;
}

export interface DownloadAllMembersIntent {
    type: 'DOWNLOAD_ALL_MEMBERS';
    dataset: string;
    targetDir?: string;
}

export interface DownloadAllDatasetsIntent {
    type: 'DOWNLOAD_ALL_DATASETS';
    pattern: string;
    targetDir?: string;
}

export interface UploadFileToMemberIntent {
    type: 'UPLOAD_FILE_TO_MEMBER';
    localPath: string; // chemin local (absolu ou relatif au workspace)
    dataset: string;   // PDS cible
    member: string;    // nom du membre cible
}

export interface UploadDirToPdsIntent {
    type: 'UPLOAD_DIR_TO_PDS';
    localPath: string; // répertoire local (absolu ou relatif au workspace)
    dataset: string;   // PDS cible
}

export interface CopyMemberIntent {
    type: 'COPY_MEMBER';
    fromDataset: string;
    fromMember: string;
    toDataset: string;
    toMember: string;   // peut être identique ou différent
    replace?: boolean;
}

export interface CopyDatasetIntent {
    type: 'COPY_DATASET';
    fromDataset: string;
    toDataset: string;
    replace?: boolean;
}

// ============================================================
// Safety levels — contrôle les confirmations requises
// ============================================================

export type SafetyLevel = 'safe' | 'moderate' | 'dangerous';

export const INTENT_SAFETY: Record<DsIntent['type'], SafetyLevel> = {
    LIST_DATASETS: 'safe',
    LIST_MEMBERS: 'safe',
    READ_MEMBER: 'safe',
    DATASET_INFO: 'safe',
    SEARCH_CONTENT: 'safe',
    DOWNLOAD_MEMBER: 'safe',
    DOWNLOAD_ALL_MEMBERS: 'safe',
    DOWNLOAD_ALL_DATASETS: 'safe',
    UPLOAD_FILE_TO_MEMBER: 'moderate',
    UPLOAD_DIR_TO_PDS: 'moderate',
    COPY_MEMBER: 'moderate',
    COPY_DATASET: 'moderate',
    CREATE_MEMBER: 'moderate',
    WRITE_MEMBER: 'moderate',
    CREATE_DATASET: 'moderate',
    DELETE_MEMBER: 'dangerous',
    DELETE_DATASET: 'dangerous',
};
