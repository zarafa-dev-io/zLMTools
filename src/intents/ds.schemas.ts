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
    | DatasetInfoIntent;

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
    dsorg: 'PO' | 'PS'; // PDS ou séquentiel
    recfm?: string;
    lrecl?: number;
    blksize?: number;
    primary?: number;
    secondary?: number;
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
    CREATE_MEMBER: 'moderate',
    WRITE_MEMBER: 'moderate',
    CREATE_DATASET: 'moderate',
    DELETE_MEMBER: 'dangerous',
    DELETE_DATASET: 'dangerous',
};
