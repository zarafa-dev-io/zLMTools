import { activate, deactivate } from '../participant';
import * as vscode from 'vscode';

// ============================================================
// Mocks — handlers, session, telemetry, tools
// ============================================================

const mockDatasetsHandle = jest.fn();
const mockJobsHandle = jest.fn();
const mockRunHandle = jest.fn();
const mockTsoHandle = jest.fn();
const mockUssHandle = jest.fn();
const mockLparHandle = jest.fn();

jest.mock('../handlers/datasets.handler', () => ({
    DatasetsHandler: jest.fn().mockImplementation(() => ({ handle: mockDatasetsHandle })),
}));

jest.mock('../handlers', () => ({
    JobsHandler: jest.fn().mockImplementation(() => ({ handle: mockJobsHandle })),
    RunHandler:  jest.fn().mockImplementation(() => ({ handle: mockRunHandle })),
    TsoHandler:  jest.fn().mockImplementation(() => ({ handle: mockTsoHandle })),
    UssHandler:  jest.fn().mockImplementation(() => ({ handle: mockUssHandle })),
}));

jest.mock('../handlers/lpar.handler', () => ({
    LparHandler: jest.fn().mockImplementation(() => ({ handle: mockLparHandle })),
}));

jest.mock('../zowe/session', () => ({
    ZoweSessionManager: jest.fn().mockImplementation(() => ({
        getActiveProfileName: jest.fn().mockReturnValue(null),
        listProfiles: jest.fn().mockResolvedValue([]),
        setActiveProfile: jest.fn(),
        clearCache: jest.fn(),
        onDidChangeProfile: jest.fn(),
    })),
}));

jest.mock('../utils/telemetry', () => ({
    TelemetryService: jest.fn().mockImplementation(() => ({
        trackSuccess: jest.fn(),
        trackError: jest.fn(),
        trackDuration: jest.fn(),
        generateReport: jest.fn().mockResolvedValue('# Rapport\n\nTotal : 0'),
    })),
}));

jest.mock('../tools/registry', () => ({
    registerTools: jest.fn(),
}));

// ============================================================
// Helpers
// ============================================================

/** Capture the chat handler function registered via vscode.chat.createChatParticipant */
function getChatHandler(): (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
) => Promise<any> {
    return (vscode.chat.createChatParticipant as jest.Mock).mock.calls[0][1];
}

/** Capture the followupProvider registered on the participant */
function getFollowupProvider(): vscode.ChatFollowupProvider {
    const participant = (vscode.chat.createChatParticipant as jest.Mock).mock.results[0].value;
    return participant.followupProvider;
}

function makeStream(): Partial<vscode.ChatResponseStream> {
    return { progress: jest.fn(), markdown: jest.fn(), button: jest.fn() };
}

function makeRequest(command: string | undefined, prompt = 'test'): Partial<vscode.ChatRequest> {
    return { command, prompt, model: {} as any };
}

function makeContext(): vscode.ExtensionContext {
    return {
        subscriptions: { push: jest.fn() },
        globalState: { get: jest.fn().mockReturnValue([]), update: jest.fn() },
    } as any;
}

const DEFAULT_RESULT = { metadata: { command: 'test', intentType: 'TEST', followups: [] } };
const token = {} as vscode.CancellationToken;

// ============================================================
// Tests — participant.ts
// ============================================================

describe('activate()', () => {
    let context: vscode.ExtensionContext;

    beforeEach(() => {
        jest.clearAllMocks();

        // Restore participant mock with followupProvider support
        (vscode.chat.createChatParticipant as jest.Mock).mockReturnValue({
            iconPath: null,
            followupProvider: null,
            dispose: jest.fn(),
        });

        // Set up handler defaults
        mockDatasetsHandle.mockResolvedValue(DEFAULT_RESULT);
        mockJobsHandle.mockResolvedValue(DEFAULT_RESULT);
        mockRunHandle.mockResolvedValue(DEFAULT_RESULT);
        mockTsoHandle.mockResolvedValue(DEFAULT_RESULT);
        mockUssHandle.mockResolvedValue(DEFAULT_RESULT);
        mockLparHandle.mockResolvedValue(DEFAULT_RESULT);

        context = makeContext();
    });

    // ── Participant creation ───────────────────────────────────

    describe('Participant registration', () => {
        it('should call vscode.chat.createChatParticipant with the correct ID', () => {
            activate(context);

            expect(vscode.chat.createChatParticipant).toHaveBeenCalledWith(
                'zdevops.zos',
                expect.any(Function)
            );
        });

        it('should push the participant to context.subscriptions', () => {
            activate(context);

            expect((context.subscriptions as any).push).toHaveBeenCalled();
        });

        it('should set an icon on the participant', () => {
            activate(context);

            const participant = (vscode.chat.createChatParticipant as jest.Mock).mock.results[0].value;
            expect(participant.iconPath).toBeInstanceOf(vscode.ThemeIcon);
        });
    });

    // ── Status bar ────────────────────────────────────────────

    describe('Status bar', () => {
        it('should create a status bar item', () => {
            activate(context);

            expect(vscode.window.createStatusBarItem).toHaveBeenCalled();
        });
    });

    // ── Registered commands ────────────────────────────────────

    describe('Registered commands', () => {
        it('should register zos.selectLpar command', () => {
            activate(context);

            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'zos.selectLpar',
                expect.any(Function)
            );
        });

        it('should register zos.clearSessionCache command', () => {
            activate(context);

            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'zos.clearSessionCache',
                expect.any(Function)
            );
        });

        it('should register zos.telemetryReport command', () => {
            activate(context);

            expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
                'zos.telemetryReport',
                expect.any(Function)
            );
        });
    });

    // ── Tools registration ─────────────────────────────────────

    describe('Tools registration', () => {
        it('should call registerTools', () => {
            const { registerTools } = require('../tools/registry');
            activate(context);

            expect(registerTools).toHaveBeenCalled();
        });
    });
});

// ============================================================
// Tests — Chat handler routing
// ============================================================

describe('Chat handler — command routing', () => {
    let context: vscode.ExtensionContext;
    let handler: ReturnType<typeof getChatHandler>;
    let stream: Partial<vscode.ChatResponseStream>;

    beforeEach(() => {
        jest.clearAllMocks();

        (vscode.chat.createChatParticipant as jest.Mock).mockReturnValue({
            iconPath: null,
            followupProvider: null,
            dispose: jest.fn(),
        });

        mockDatasetsHandle.mockResolvedValue(DEFAULT_RESULT);
        mockJobsHandle.mockResolvedValue(DEFAULT_RESULT);
        mockRunHandle.mockResolvedValue(DEFAULT_RESULT);
        mockTsoHandle.mockResolvedValue(DEFAULT_RESULT);
        mockUssHandle.mockResolvedValue(DEFAULT_RESULT);
        mockLparHandle.mockResolvedValue(DEFAULT_RESULT);

        context = makeContext();
        stream = makeStream();
        activate(context);
        handler = getChatHandler();
    });

    it('should route /ds to DatasetsHandler', async () => {
        await handler(makeRequest('ds') as any, {} as any, stream as any, token);

        expect(mockDatasetsHandle).toHaveBeenCalled();
    });

    it('should route /jobs to JobsHandler', async () => {
        await handler(makeRequest('jobs') as any, {} as any, stream as any, token);

        expect(mockJobsHandle).toHaveBeenCalled();
    });

    it('should route /run to RunHandler', async () => {
        await handler(makeRequest('run') as any, {} as any, stream as any, token);

        expect(mockRunHandle).toHaveBeenCalled();
    });

    it('should route /tso to TsoHandler', async () => {
        await handler(makeRequest('tso') as any, {} as any, stream as any, token);

        expect(mockTsoHandle).toHaveBeenCalled();
    });

    it('should route /uss to UssHandler', async () => {
        await handler(makeRequest('uss') as any, {} as any, stream as any, token);

        expect(mockUssHandle).toHaveBeenCalled();
    });

    it('should route /lpar to LparHandler', async () => {
        await handler(makeRequest('lpar') as any, {} as any, stream as any, token);

        expect(mockLparHandle).toHaveBeenCalled();
    });

    it('should handle freeform (no command) with help text', async () => {
        await handler(makeRequest(undefined) as any, {} as any, stream as any, token);

        expect(stream.markdown).toHaveBeenCalled();
        const allMarkdown = (stream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
        expect(allMarkdown).toContain('/ds');
        expect(allMarkdown).toContain('/jobs');
    });

    it('should not call any handler on freeform', async () => {
        await handler(makeRequest(undefined) as any, {} as any, stream as any, token);

        expect(mockDatasetsHandle).not.toHaveBeenCalled();
        expect(mockJobsHandle).not.toHaveBeenCalled();
        expect(mockRunHandle).not.toHaveBeenCalled();
    });

    it('should return a ZosChatResult for freeform', async () => {
        const result = await handler(makeRequest(undefined) as any, {} as any, stream as any, token);

        expect(result.metadata).toBeDefined();
        expect(result.metadata.command).toBe('freeform');
        expect(Array.isArray(result.metadata.followups)).toBe(true);
    });

    it('should return freeform followups pointing to key commands', async () => {
        const result = await handler(makeRequest(undefined) as any, {} as any, stream as any, token);

        const commands = result.metadata.followups.map((f: any) => f.command);
        expect(commands).toContain('lpar');
        expect(commands).toContain('ds');
        expect(commands).toContain('jobs');
    });
});

// ============================================================
// Tests — Active LPAR banner
// ============================================================

describe('Chat handler — active LPAR banner', () => {
    let context: vscode.ExtensionContext;
    let handler: ReturnType<typeof getChatHandler>;
    let stream: Partial<vscode.ChatResponseStream>;

    beforeEach(() => {
        jest.clearAllMocks();

        (vscode.chat.createChatParticipant as jest.Mock).mockReturnValue({
            iconPath: null,
            followupProvider: null,
            dispose: jest.fn(),
        });

        mockDatasetsHandle.mockResolvedValue(DEFAULT_RESULT);
        context = makeContext();
        stream = makeStream();
        activate(context);
        handler = getChatHandler();
    });

    it('should display the active LPAR banner when a profile is active and command != lpar', async () => {
        const { ZoweSessionManager } = require('../zowe/session');
        ZoweSessionManager.mock.results[0].value.getActiveProfileName.mockReturnValue('DEV1');

        await handler(makeRequest('ds') as any, {} as any, stream as any, token);

        const banner = (stream.markdown as jest.Mock).mock.calls[0][0] as string;
        expect(banner).toContain('DEV1');
    });

    it('should NOT display the banner when no profile is active', async () => {
        const { ZoweSessionManager } = require('../zowe/session');
        ZoweSessionManager.mock.results[0].value.getActiveProfileName.mockReturnValue(null);

        await handler(makeRequest('ds') as any, {} as any, stream as any, token);

        const markdownCalls = (stream.markdown as jest.Mock).mock.calls;
        // The first markdown call should come from the handler, not a banner
        // (DatasetsHandler is mocked, so markdown is only called by the banner if present)
        if (markdownCalls.length > 0) {
            const banner = markdownCalls[0][0] as string;
            // No profile name in banner
            expect(banner).not.toMatch(/DEV|PROD|STAGING/);
        }
    });

    it('should NOT display the banner for /lpar even when a profile is active', async () => {
        const { ZoweSessionManager } = require('../zowe/session');
        ZoweSessionManager.mock.results[0].value.getActiveProfileName.mockReturnValue('DEV1');

        await handler(makeRequest('lpar') as any, {} as any, stream as any, token);

        // If banner is shown it comes first, but for /lpar the handler is LparHandler (mocked)
        // The markdown mock won't be called with a banner from participant
        const bannerCalls = (stream.markdown as jest.Mock).mock.calls.filter(
            (c: any[]) => typeof c[0] === 'string' && c[0].includes('DEV1') && c[0].includes('🖥️')
        );
        expect(bannerCalls.length).toBe(0);
    });
});

// ============================================================
// Tests — Error handling
// ============================================================

describe('Chat handler — error handling', () => {
    let context: vscode.ExtensionContext;
    let handler: ReturnType<typeof getChatHandler>;
    let stream: Partial<vscode.ChatResponseStream>;
    let telemetryMock: any;

    beforeEach(() => {
        jest.clearAllMocks();

        (vscode.chat.createChatParticipant as jest.Mock).mockReturnValue({
            iconPath: null,
            followupProvider: null,
            dispose: jest.fn(),
        });

        context = makeContext();
        stream = makeStream();
        activate(context);
        handler = getChatHandler();

        const { TelemetryService } = require('../utils/telemetry');
        telemetryMock = TelemetryService.mock.results[0].value;
    });

    it('should catch errors from handlers and display an error message', async () => {
        mockJobsHandle.mockRejectedValue(new Error('Connection refused'));

        const result = await handler(makeRequest('jobs') as any, {} as any, stream as any, token);

        expect(stream.markdown).toHaveBeenCalled();
        const allMarkdown = (stream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
        expect(allMarkdown).toContain('Connection refused');
    });

    it('should call telemetry.trackError on handler failure', async () => {
        mockDatasetsHandle.mockRejectedValue(new Error('z/OS error'));

        await handler(makeRequest('ds') as any, {} as any, stream as any, token);

        expect(telemetryMock.trackError).toHaveBeenCalledWith('ds', expect.any(Error));
    });

    it('should return a valid ZosChatResult even after an error', async () => {
        mockRunHandle.mockRejectedValue(new Error('Submission failed'));

        const result = await handler(makeRequest('run') as any, {} as any, stream as any, token);

        expect(result).toBeDefined();
        expect(result.metadata.command).toBe('run');
        expect(Array.isArray(result.metadata.followups)).toBe(true);
    });

    it('should call telemetry.trackDuration even after an error (finally)', async () => {
        mockJobsHandle.mockRejectedValue(new Error('fail'));

        await handler(makeRequest('jobs') as any, {} as any, stream as any, token);

        expect(telemetryMock.trackDuration).toHaveBeenCalledWith('jobs', expect.any(Number));
    });

    it('should call telemetry.trackDuration on success (finally)', async () => {
        mockJobsHandle.mockResolvedValue(DEFAULT_RESULT);

        await handler(makeRequest('jobs') as any, {} as any, stream as any, token);

        expect(telemetryMock.trackDuration).toHaveBeenCalledWith('jobs', expect.any(Number));
    });

    it('should format Zowe error with additionalDetails', async () => {
        const zoweError = {
            message: 'REST API failed',
            mDetails: { additionalDetails: 'RC=8 REASON=0x04' },
        };
        mockDatasetsHandle.mockRejectedValue(zoweError);

        await handler(makeRequest('ds') as any, {} as any, stream as any, token);

        const allMarkdown = (stream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
        expect(allMarkdown).toContain('RC=8 REASON=0x04');
    });

    it('should format Zowe error with causeErrors JSON', async () => {
        const zoweError = {
            message: 'Connection error',
            causeErrors: JSON.stringify({ rc: 12, message: 'TCP/IP timeout' }),
        };
        mockDatasetsHandle.mockRejectedValue(zoweError);

        await handler(makeRequest('ds') as any, {} as any, stream as any, token);

        const allMarkdown = (stream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
        expect(allMarkdown).toContain('TCP/IP timeout');
    });

    it('should handle unknown error gracefully', async () => {
        mockDatasetsHandle.mockRejectedValue({});

        const result = await handler(makeRequest('ds') as any, {} as any, stream as any, token);

        expect(result).toBeDefined();
    });

    it('should use "freeform" as command when no command was set', async () => {
        // Force an error in the freeform path by mocking sessionManager.getActiveProfileName to throw
        const { ZoweSessionManager } = require('../zowe/session');
        ZoweSessionManager.mock.results[0].value.getActiveProfileName.mockImplementation(() => {
            throw new Error('SessionManager error');
        });

        const result = await handler(makeRequest(undefined) as any, {} as any, stream as any, token);

        expect(result.metadata.command).toBe('freeform');
    });
});

// ============================================================
// Tests — Followup provider
// ============================================================

describe('followupProvider', () => {
    let context: vscode.ExtensionContext;
    let participantMock: any;

    beforeEach(() => {
        jest.clearAllMocks();

        participantMock = {
            iconPath: null,
            followupProvider: null,
            dispose: jest.fn(),
        };
        (vscode.chat.createChatParticipant as jest.Mock).mockReturnValue(participantMock);

        context = makeContext();
        activate(context);
    });

    it('should set a followupProvider on the participant', () => {
        expect(participantMock.followupProvider).toBeDefined();
        expect(typeof participantMock.followupProvider.provideFollowups).toBe('function');
    });

    it('should convert ZosFollowup array to ChatFollowup array', async () => {
        const provider = participantMock.followupProvider as vscode.ChatFollowupProvider;
        const result = {
            metadata: {
                command: 'jobs',
                followups: [
                    { label: '📋 List jobs', prompt: 'liste mes jobs', command: 'jobs' },
                    { label: '🔍 Status', prompt: 'status JOB12345', command: 'jobs' },
                ],
            },
        } as any;

        const followups = await Promise.resolve(provider.provideFollowups(result, {} as any, {} as any)) as vscode.ChatFollowup[];

        expect(followups).toHaveLength(2);
        expect(followups[0].label).toBe('📋 List jobs');
        expect(followups[0].prompt).toBe('liste mes jobs');
        expect(followups[0].command).toBe('jobs');
    });

    it('should return empty array when result has no followups', async () => {
        const provider = participantMock.followupProvider as vscode.ChatFollowupProvider;
        const result = { metadata: { command: 'ds', followups: [] } } as any;

        const followups = await Promise.resolve(provider.provideFollowups(result, {} as any, {} as any)) as vscode.ChatFollowup[];

        expect(followups).toEqual([]);
    });

    it('should return empty array when result is null/undefined', async () => {
        const provider = participantMock.followupProvider as vscode.ChatFollowupProvider;

        const followups = await Promise.resolve(provider.provideFollowups(null as any, {} as any, {} as any)) as vscode.ChatFollowup[];

        expect(followups).toEqual([]);
    });

    it('should return empty array when metadata is missing', async () => {
        const provider = participantMock.followupProvider as vscode.ChatFollowupProvider;

        const followups = await Promise.resolve(provider.provideFollowups({} as any, {} as any, {} as any)) as vscode.ChatFollowup[];

        expect(followups).toEqual([]);
    });
});

// ============================================================
// Tests — deactivate()
// ============================================================

describe('deactivate()', () => {
    it('should not throw', () => {
        expect(() => deactivate()).not.toThrow();
    });
});

// ============================================================
// Tests — zos.selectLpar command
// ============================================================

describe('zos.selectLpar command', () => {
    let context: vscode.ExtensionContext;
    let selectLparCallback: () => Promise<void>;

    beforeEach(() => {
        jest.clearAllMocks();

        (vscode.chat.createChatParticipant as jest.Mock).mockReturnValue({
            iconPath: null,
            followupProvider: null,
            dispose: jest.fn(),
        });

        (vscode.commands.registerCommand as jest.Mock).mockImplementation((cmd, cb) => {
            if (cmd === 'zos.selectLpar') { selectLparCallback = cb; }
        });

        context = makeContext();
        activate(context);
    });

    it('should show a warning when no profiles are available', async () => {
        const { ZoweSessionManager } = require('../zowe/session');
        ZoweSessionManager.mock.results[0].value.listProfiles.mockResolvedValue([]);

        await selectLparCallback();

        expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    });

    it('should show QuickPick with available profiles', async () => {
        const { ZoweSessionManager } = require('../zowe/session');
        ZoweSessionManager.mock.results[0].value.listProfiles.mockResolvedValue([
            { name: 'DEV1', host: 'dev.mf.com', port: 443 },
            { name: 'PROD', host: 'prod.mf.com', port: 443 },
        ]);
        (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

        await selectLparCallback();

        expect(vscode.window.showQuickPick).toHaveBeenCalled();
        const items = (vscode.window.showQuickPick as jest.Mock).mock.calls[0][0];
        expect(items.length).toBe(2);
    });

    it('should call setActiveProfile when user selects a profile', async () => {
        const { ZoweSessionManager } = require('../zowe/session');
        ZoweSessionManager.mock.results[0].value.listProfiles.mockResolvedValue([
            { name: 'DEV1', host: 'dev.mf.com', port: 443 },
        ]);
        (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ profileName: 'DEV1' });

        await selectLparCallback();

        expect(ZoweSessionManager.mock.results[0].value.setActiveProfile).toHaveBeenCalledWith('DEV1');
    });

    it('should show an information message after profile switch', async () => {
        const { ZoweSessionManager } = require('../zowe/session');
        ZoweSessionManager.mock.results[0].value.listProfiles.mockResolvedValue([
            { name: 'DEV1', host: 'dev.mf.com', port: 443 },
        ]);
        (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ profileName: 'DEV1' });

        await selectLparCallback();

        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining('DEV1')
        );
    });

    it('should do nothing when user cancels the QuickPick', async () => {
        const { ZoweSessionManager } = require('../zowe/session');
        ZoweSessionManager.mock.results[0].value.listProfiles.mockResolvedValue([
            { name: 'DEV1', host: 'dev.mf.com', port: 443 },
        ]);
        (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

        await selectLparCallback();

        expect(ZoweSessionManager.mock.results[0].value.setActiveProfile).not.toHaveBeenCalled();
    });
});

// ============================================================
// Tests — zos.clearSessionCache command
// ============================================================

describe('zos.clearSessionCache command', () => {
    let context: vscode.ExtensionContext;
    let clearCacheCallback: () => void;

    beforeEach(() => {
        jest.clearAllMocks();

        (vscode.chat.createChatParticipant as jest.Mock).mockReturnValue({
            iconPath: null,
            followupProvider: null,
            dispose: jest.fn(),
        });

        (vscode.commands.registerCommand as jest.Mock).mockImplementation((cmd, cb) => {
            if (cmd === 'zos.clearSessionCache') { clearCacheCallback = cb; }
        });

        context = makeContext();
        activate(context);
    });

    it('should call sessionManager.clearCache', () => {
        const { ZoweSessionManager } = require('../zowe/session');
        clearCacheCallback();

        expect(ZoweSessionManager.mock.results[0].value.clearCache).toHaveBeenCalled();
    });

    it('should show an information message', () => {
        clearCacheCallback();

        expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });
});

// ============================================================
// Tests — zos.telemetryReport command
// ============================================================

describe('zos.telemetryReport command', () => {
    let context: vscode.ExtensionContext;
    let telemetryReportCallback: () => Promise<void>;

    beforeEach(() => {
        jest.clearAllMocks();

        (vscode.chat.createChatParticipant as jest.Mock).mockReturnValue({
            iconPath: null,
            followupProvider: null,
            dispose: jest.fn(),
        });

        (vscode.commands.registerCommand as jest.Mock).mockImplementation((cmd, cb) => {
            if (cmd === 'zos.telemetryReport') { telemetryReportCallback = cb; }
        });

        context = makeContext();
        activate(context);
    });

    it('should call telemetry.generateReport', async () => {
        const { TelemetryService } = require('../utils/telemetry');
        await telemetryReportCallback();

        expect(TelemetryService.mock.results[0].value.generateReport).toHaveBeenCalled();
    });

    it('should open a text document with the report content', async () => {
        await telemetryReportCallback();

        expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith({
            content: expect.stringContaining('Rapport'),
            language: 'markdown',
        });
    });

    it('should show the document in the editor', async () => {
        const fakeDoc = { uri: {} };
        (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(fakeDoc);

        await telemetryReportCallback();

        expect(vscode.window.showTextDocument).toHaveBeenCalledWith(fakeDoc, { preview: true });
    });
});
