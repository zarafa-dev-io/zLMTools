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
    setStatusBarMessage: jest.fn(),
    showQuickPick: jest.fn(),
    showTextDocument: jest.fn().mockResolvedValue(undefined),
    createStatusBarItem: jest.fn(() => ({
        text: '',
        tooltip: '',
        command: '',
        show: jest.fn(),
        hide: jest.fn(),
        dispose: jest.fn(),
    })),
};

export const workspace = {
    findFiles: jest.fn().mockResolvedValue([]),
    openTextDocument: jest.fn().mockResolvedValue({ uri: {} }),
    fs: {
        readFile: jest.fn(),
    },
    getConfiguration: jest.fn(() => ({
        get: jest.fn(),
        update: jest.fn(),
    })),
    workspaceFolders: undefined as any,
};

export const extensions = {
    getExtension: jest.fn(),
};

export const commands = {
    registerCommand: jest.fn(),
    executeCommand: jest.fn(),
};

export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
}

export const chat = {
    createChatParticipant: jest.fn(() => ({
        iconPath: null,
        dispose: jest.fn(),
    })),
};

export const lm = {
    selectChatModels: jest.fn().mockResolvedValue([]),
    registerTool: jest.fn(() => ({ dispose: jest.fn() })),
};

export class LanguageModelToolResult {
    constructor(public content: any[]) {}
}

export class LanguageModelTextPart {
    constructor(public value: string) {}
}

export class MarkdownString {
    constructor(public value: string) {}
}

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
