// ============================================================
// Mock de l'API vscode pour les tests unitaires
// ============================================================

export const window = {
    createOutputChannel: jest.fn(() => ({
        appendLine: jest.fn(),
        show: jest.fn(),
        dispose: jest.fn(),
    })),
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
};

export const workspace = {
    findFiles: jest.fn().mockResolvedValue([]),
    fs: {
        readFile: jest.fn(),
    },
    getConfiguration: jest.fn(() => ({
        get: jest.fn(),
        update: jest.fn(),
    })),
};

export const extensions = {
    getExtension: jest.fn(),
};

export const chat = {
    createChatParticipant: jest.fn(() => ({
        iconPath: null,
        dispose: jest.fn(),
    })),
};

export const lm = {
    selectChatModels: jest.fn().mockResolvedValue([]),
};

export class ThemeIcon {
    constructor(public id: string) {}
}

export const Uri = {
    file: (path: string) => ({ fsPath: path, scheme: 'file' }),
    parse: (uri: string) => ({ fsPath: uri }),
};

export enum LanguageModelChatMessageRole {
    User = 1,
    Assistant = 2,
}

export const LanguageModelChatMessage = {
    User: (content: string) => ({
        role: LanguageModelChatMessageRole.User,
        content,
    }),
    Assistant: (content: string) => ({
        role: LanguageModelChatMessageRole.Assistant,
        content,
    }),
};
