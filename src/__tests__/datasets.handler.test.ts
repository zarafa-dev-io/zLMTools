import { DatasetsHandler } from '../handlers/datasets.handler';
import { DsIntentClassifier } from '../intents/ds.classifier';
import { ZoweSessionManager } from '../zowe/session';
import { TelemetryService } from '../utils/telemetry';
import { List, Download, Upload, Create, Delete, Copy } from '@zowe/zos-files-for-zowe-sdk';
import * as fs from 'fs';
import * as vscode from 'vscode';

// ============================================================
// Mocks
// ============================================================

jest.mock('../intents/ds.classifier');

jest.mock('@zowe/zos-files-for-zowe-sdk', () => ({
    List: {
        dataSet: jest.fn(),
        allMembers: jest.fn(),
    },
    Download: {
        dataSet: jest.fn(),
        allMembers: jest.fn(),
        allDataSets: jest.fn(),
    },
    Upload: {
        fileToDataset: jest.fn(),
        dirToPds: jest.fn(),
        bufferToDataSet: jest.fn(),
    },
    Create: {
        dataSet: jest.fn(),
        dataSetMember: jest.fn(),
        dataSetLike: jest.fn(),
    },
    Delete: {
        dataSet: jest.fn(),
    },
    Copy: {
        dataSet: jest.fn(),
        isPDS: jest.fn(),
    },
    CreateDataSetTypeEnum: {
        DATA_SET_PARTITIONED: 'PARTITIONED',
        DATA_SET_SEQUENTIAL: 'SEQUENTIAL',
        DATA_SET_CLASSIC: 'CLASSIC',
        DATA_SET_BINARY: 'BINARY',
        DATA_SET_C: 'C',
    },
}));

jest.mock('../zowe/safety', () => ({
    requestConfirmation: jest.fn().mockResolvedValue(true),
    describeOperation: jest.fn().mockReturnValue('test operation'),
    getEffectiveSafetyLevel: jest.fn().mockImplementation((s: string) => s),
    isProtectedDataset: jest.fn().mockReturnValue(false),
}));

jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(false),
    readFileSync: jest.fn().mockReturnValue('content'),
    mkdirSync: jest.fn(),
    readdirSync: jest.fn().mockReturnValue([]),
    statSync: jest.fn().mockReturnValue({ isDirectory: () => false, isFile: () => true, size: 1024 }),
    renameSync: jest.fn(),
}));

// ============================================================
// Tests — DatasetsHandler
// ============================================================

describe('DatasetsHandler', () => {
    let handler: DatasetsHandler;
    let mockClassify: jest.Mock;
    let mockSessionManager: Partial<ZoweSessionManager>;
    let mockTelemetry: Partial<TelemetryService>;
    let mockStream: Partial<vscode.ChatResponseStream>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockClassify = jest.fn();
        (DsIntentClassifier as jest.Mock).mockImplementation(() => ({
            classify: mockClassify,
        }));

        mockSessionManager = {
            getSession: jest.fn().mockResolvedValue({ session: {}, profileName: 'DEV1' }),
        };

        mockTelemetry = {
            trackSuccess: jest.fn(),
            trackError: jest.fn(),
        };

        mockStream = {
            progress: jest.fn(),
            markdown: jest.fn(),
            button: jest.fn(),
        } as any;

        handler = new DatasetsHandler(
            mockSessionManager as ZoweSessionManager,
            mockTelemetry as TelemetryService
        );
    });

    // ── Instantiation ─────────────────────────────────────────

    describe('Handler instantiation', () => {
        it('should create DatasetsHandler instance', () => {
            expect(handler).toBeDefined();
            expect(handler).toBeInstanceOf(DatasetsHandler);
        });
    });

    // ── Empty prompt ──────────────────────────────────────────

    describe('Empty prompt', () => {
        it('should return help text without calling the classifier', async () => {
            const request = { prompt: '', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.command).toBe('ds');
            expect(mockClassify).not.toHaveBeenCalled();
        });

        it('should return followup suggestions', async () => {
            const request = { prompt: '', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.followups.length).toBeGreaterThan(0);
        });

        it('should call stream.markdown with help content', async () => {
            const request = { prompt: '', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(mockStream.markdown).toHaveBeenCalled();
        });
    });

    // ── Unrecognized intent ────────────────────────────────────

    describe('Unrecognized intent', () => {
        it('should return graceful response when classifier returns null', async () => {
            mockClassify.mockResolvedValue(null);
            const request = { prompt: 'quelque chose d\'incompréhensible', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.command).toBe('ds');
            expect(result.metadata.intentType).toBeUndefined();
        });

        it('should not call getSession when intent is null', async () => {
            mockClassify.mockResolvedValue(null);
            const request = { prompt: 'foo bar', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(mockSessionManager.getSession).not.toHaveBeenCalled();
        });
    });

    // ── LIST_DATASETS ─────────────────────────────────────────

    describe('LIST_DATASETS', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'LIST_DATASETS', pattern: 'HLQ.**' });
            (List.dataSet as jest.Mock).mockResolvedValue({ apiResponse: { items: [] } });
        });

        it('should call List.dataSet with the pattern', async () => {
            const request = { prompt: 'liste les datasets HLQ.**', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(List.dataSet).toHaveBeenCalledWith(expect.anything(), 'HLQ.**', expect.any(Object));
        });

        it('should return intentType LIST_DATASETS', async () => {
            const request = { prompt: 'liste les datasets HLQ.**', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.intentType).toBe('LIST_DATASETS');
        });

        it('should display datasets in a table when found', async () => {
            (List.dataSet as jest.Mock).mockResolvedValue({
                apiResponse: {
                    items: [
                        { dsname: 'HLQ.COBOL.SRC', dsorg: 'PO', recfm: 'FB', lrecl: 80, vol: 'VOL001' },
                        { dsname: 'HLQ.DATA.FILE', dsorg: 'PS', recfm: 'FB', lrecl: 80, vol: 'VOL001' },
                    ],
                },
            });
            const request = { prompt: 'liste les datasets HLQ.**', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('HLQ.COBOL.SRC');
            expect(allMarkdown).toContain('HLQ.DATA.FILE');
        });

        it('should display "no dataset found" message for empty result', async () => {
            const request = { prompt: 'liste les datasets HLQ.**', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(mockStream.markdown).toHaveBeenCalled();
        });

        it('should track success in telemetry', async () => {
            const request = { prompt: 'liste les datasets HLQ.**', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(mockTelemetry.trackSuccess).toHaveBeenCalledWith('ds', 'LIST_DATASETS', 'DEV1');
        });
    });

    // ── LIST_MEMBERS ──────────────────────────────────────────

    describe('LIST_MEMBERS', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'LIST_MEMBERS', dataset: 'HLQ.COBOL.SRC' });
            (List.allMembers as jest.Mock).mockResolvedValue({ apiResponse: { items: [] } });
        });

        it('should call List.allMembers with the dataset name', async () => {
            const request = { prompt: 'liste les membres de HLQ.COBOL.SRC', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(List.allMembers).toHaveBeenCalledWith(expect.anything(), 'HLQ.COBOL.SRC', expect.any(Object));
        });

        it('should return intentType LIST_MEMBERS', async () => {
            const request = { prompt: 'liste les membres de HLQ.COBOL.SRC', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.intentType).toBe('LIST_MEMBERS');
        });

        it('should display members when found', async () => {
            (List.allMembers as jest.Mock).mockResolvedValue({
                apiResponse: {
                    items: [
                        { member: 'PGMA', changed: '2024-01-01' },
                        { member: 'PGMB', changed: '2024-01-02' },
                    ],
                },
            });
            const request = { prompt: 'liste les membres de HLQ.COBOL.SRC', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('PGMA');
            expect(allMarkdown).toContain('PGMB');
        });

        it('should handle empty member list', async () => {
            const request = { prompt: 'liste les membres de HLQ.COBOL.SRC', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result).toBeDefined();
            expect(mockStream.markdown).toHaveBeenCalled();
        });
    });

    // ── READ_MEMBER ───────────────────────────────────────────

    describe('READ_MEMBER', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'READ_MEMBER', dataset: 'HLQ.COBOL.SRC', member: 'PGMA' });
            (Download.dataSet as jest.Mock).mockResolvedValue({ apiResponse: 'IDENTIFICATION DIVISION.\n       PROGRAM-ID. PGMA.\n' });
            (mockStream as any).button = jest.fn();
        });

        it('should call Download.dataSet', async () => {
            const request = { prompt: 'affiche HLQ.COBOL.SRC(PGMA)', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Download.dataSet).toHaveBeenCalled();
        });

        it('should return intentType READ_MEMBER', async () => {
            const request = { prompt: 'affiche HLQ.COBOL.SRC(PGMA)', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.intentType).toBe('READ_MEMBER');
        });
    });

    // ── DELETE_MEMBER ─────────────────────────────────────────

    describe('DELETE_MEMBER', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'DELETE_MEMBER', dataset: 'HLQ.COBOL.SRC', member: 'PGMA' });
            (Delete.dataSet as jest.Mock).mockResolvedValue({ success: true });
        });

        it('should request confirmation before deleting', async () => {
            const { requestConfirmation } = require('../zowe/safety');
            const request = { prompt: 'supprime HLQ.COBOL.SRC(PGMA)', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(requestConfirmation).toHaveBeenCalled();
        });

        it('should call Delete.dataSet with member notation when confirmed', async () => {
            const request = { prompt: 'supprime HLQ.COBOL.SRC(PGMA)', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Delete.dataSet).toHaveBeenCalledWith(expect.anything(), 'HLQ.COBOL.SRC(PGMA)');
        });

        it('should not call Delete.dataSet when confirmation is refused', async () => {
            const { requestConfirmation } = require('../zowe/safety');
            (requestConfirmation as jest.Mock).mockResolvedValueOnce(false);
            // reset the mock to confirm it was NOT called after the refused one
            (Delete.dataSet as jest.Mock).mockClear();

            const request = { prompt: 'supprime HLQ.COBOL.SRC(PGMA)', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Delete.dataSet).not.toHaveBeenCalled();
        });

        it('should return intentType DELETE_MEMBER', async () => {
            const request = { prompt: 'supprime HLQ.COBOL.SRC(PGMA)', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.intentType).toBe('DELETE_MEMBER');
        });
    });

    // ── DELETE_DATASET ────────────────────────────────────────

    describe('DELETE_DATASET', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'DELETE_DATASET', dataset: 'HLQ.OLD.DATA' });
            (Delete.dataSet as jest.Mock).mockResolvedValue({ success: true });
        });

        it('should call Delete.dataSet when confirmed', async () => {
            const request = { prompt: 'supprime le dataset HLQ.OLD.DATA', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Delete.dataSet).toHaveBeenCalled();
        });

        it('should return intentType DELETE_DATASET', async () => {
            const request = { prompt: 'supprime le dataset HLQ.OLD.DATA', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.intentType).toBe('DELETE_DATASET');
        });
    });

    // ── DATASET_INFO ──────────────────────────────────────────

    describe('DATASET_INFO', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'DATASET_INFO', dataset: 'HLQ.COBOL.SRC' });
            (List.dataSet as jest.Mock).mockResolvedValue({
                apiResponse: {
                    items: [{
                        dsname: 'HLQ.COBOL.SRC',
                        dsorg: 'PO',
                        recfm: 'FB',
                        lrecl: 80,
                        blksize: 27920,
                        vol: 'VOL001',
                        catnm: 'SYS1.MASTER',
                    }],
                },
            });
        });

        it('should call List.dataSet with the dataset name', async () => {
            const request = { prompt: 'info sur HLQ.COBOL.SRC', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(List.dataSet).toHaveBeenCalledWith(expect.anything(), 'HLQ.COBOL.SRC', expect.any(Object));
        });

        it('should display dataset properties', async () => {
            const request = { prompt: 'info sur HLQ.COBOL.SRC', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('HLQ.COBOL.SRC');
        });

        it('should return intentType DATASET_INFO', async () => {
            const request = { prompt: 'info sur HLQ.COBOL.SRC', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.intentType).toBe('DATASET_INFO');
        });
    });

    // ── Session management ─────────────────────────────────────

    describe('Session management', () => {
        it('should call getSession when processing an intent', async () => {
            mockClassify.mockResolvedValue({ type: 'LIST_DATASETS', pattern: 'HLQ.**' });
            (List.dataSet as jest.Mock).mockResolvedValue({ apiResponse: { items: [] } });

            const request = { prompt: 'liste les datasets HLQ.**', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(mockSessionManager.getSession).toHaveBeenCalled();
        });

        it('should propagate session errors', async () => {
            mockClassify.mockResolvedValue({ type: 'LIST_DATASETS', pattern: 'HLQ.**' });
            (mockSessionManager.getSession as jest.Mock).mockRejectedValue(new Error('Connection failed'));

            const request = { prompt: 'liste les datasets HLQ.**', model: {} } as any;

            await expect(
                handler.handle(request, {} as any, mockStream as any, {} as any)
            ).rejects.toThrow('Connection failed');
        });
    });

    // ── Stream interactions ────────────────────────────────────

    describe('Stream interactions', () => {
        it('should call stream.progress while processing', async () => {
            mockClassify.mockResolvedValue({ type: 'LIST_DATASETS', pattern: 'HLQ.**' });
            (List.dataSet as jest.Mock).mockResolvedValue({ apiResponse: { items: [] } });

            const request = { prompt: 'liste les datasets HLQ.**', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(mockStream.progress).toHaveBeenCalled();
        });
    });

    // ── LIST_DATASETS — followup branches ─────────────────────

    describe('LIST_DATASETS — followup branches', () => {
        it('should suggest second PDS when more than one PDS returned', async () => {
            mockClassify.mockResolvedValue({ type: 'LIST_DATASETS', pattern: 'HLQ.**' });
            (List.dataSet as jest.Mock).mockResolvedValue({
                apiResponse: {
                    items: [
                        { dsname: 'HLQ.COBOL.SRC', dsorg: 'PO', recfm: 'FB', lrecl: 80, vol: 'V1' },
                        { dsname: 'HLQ.JCL.CNTL', dsorg: 'PO', recfm: 'FB', lrecl: 80, vol: 'V1' },
                    ],
                },
            });
            const request = { prompt: 'liste HLQ.**', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.followups.length).toBeGreaterThanOrEqual(3);
        });
    });

    // ── LIST_MEMBERS — large list ─────────────────────────────

    describe('LIST_MEMBERS — large list', () => {
        it('should render multi-column table when more than 20 members', async () => {
            mockClassify.mockResolvedValue({ type: 'LIST_MEMBERS', dataset: 'HLQ.COBOL.SRC' });
            const items = Array.from({ length: 25 }, (_, i) => ({ member: `PGM${String(i).padStart(2, '0')}` }));
            (List.allMembers as jest.Mock).mockResolvedValue({ apiResponse: { items } });

            const request = { prompt: 'liste les membres', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('PGM00');
        });

        it('should handle pattern filter with empty result', async () => {
            mockClassify.mockResolvedValue({ type: 'LIST_MEMBERS', dataset: 'HLQ.COBOL.SRC', pattern: 'XYZ*' });
            (List.allMembers as jest.Mock).mockResolvedValue({ apiResponse: { items: [] } });

            const request = { prompt: 'liste les membres XYZ*', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('XYZ*');
        });
    });

    // ── READ_MEMBER — edge cases ──────────────────────────────

    describe('READ_MEMBER — edge cases', () => {
        it('should show empty message when member content is blank', async () => {
            mockClassify.mockResolvedValue({ type: 'READ_MEMBER', dataset: 'HLQ.COBOL.SRC', member: 'EMPTY' });
            (Download.dataSet as jest.Mock).mockResolvedValue({ apiResponse: '   ' });

            const request = { prompt: 'affiche HLQ.COBOL.SRC(EMPTY)', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('vide');
        });

        it('should handle Buffer response from Download.dataSet', async () => {
            mockClassify.mockResolvedValue({ type: 'READ_MEMBER', dataset: 'HLQ.COBOL.SRC', member: 'PGMA' });
            (Download.dataSet as jest.Mock).mockResolvedValue({
                apiResponse: Buffer.from('IDENTIFICATION DIVISION.\n       PROGRAM-ID. PGMA.\n'),
            });

            const request = { prompt: 'affiche HLQ.COBOL.SRC(PGMA)', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('PGMA');
        });
    });

    // ── WRITE_MEMBER ──────────────────────────────────────────

    describe('WRITE_MEMBER', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({
                type: 'WRITE_MEMBER', dataset: 'HLQ.COBOL.SRC', member: 'PGMA', content: 'LINE1\nLINE2\n',
            });
            (Upload.bufferToDataSet as jest.Mock).mockResolvedValue({});
        });

        it('should call Upload.bufferToDataSet', async () => {
            const request = { prompt: 'écris PGMA', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Upload.bufferToDataSet).toHaveBeenCalled();
        });

        it('should return intentType WRITE_MEMBER', async () => {
            const request = { prompt: 'écris PGMA', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.intentType).toBe('WRITE_MEMBER');
        });

        it('should display success message with line count', async () => {
            const request = { prompt: 'écris PGMA', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('HLQ.COBOL.SRC(PGMA)');
        });
    });

    // ── CREATE_DATASET ────────────────────────────────────────

    describe('CREATE_DATASET', () => {
        beforeEach(() => {
            (Create.dataSet as jest.Mock).mockResolvedValue({});
            (Create.dataSetLike as jest.Mock).mockResolvedValue({});
        });

        it('should create dataset with default PARTITIONED type', async () => {
            mockClassify.mockResolvedValue({ type: 'CREATE_DATASET', name: 'HLQ.NEW.PDS' });

            const request = { prompt: 'crée HLQ.NEW.PDS', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Create.dataSet).toHaveBeenCalled();
            expect(result.metadata.intentType).toBe('CREATE_DATASET');
        });

        it('should create SEQUENTIAL dataset', async () => {
            mockClassify.mockResolvedValue({ type: 'CREATE_DATASET', name: 'HLQ.NEW.SEQ', dstype: 'SEQUENTIAL' });

            const request = { prompt: 'crée dataset séquentiel', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Create.dataSet).toHaveBeenCalled();
        });

        it('should create BINARY dataset', async () => {
            mockClassify.mockResolvedValue({ type: 'CREATE_DATASET', name: 'HLQ.NEW.BIN', dstype: 'BINARY' });

            const request = { prompt: 'crée dataset binaire', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Create.dataSet).toHaveBeenCalled();
        });

        it('should create CLASSIC dataset', async () => {
            mockClassify.mockResolvedValue({ type: 'CREATE_DATASET', name: 'HLQ.NEW.CLASSIC', dstype: 'CLASSIC' });

            const request = { prompt: 'crée dataset classic', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Create.dataSet).toHaveBeenCalled();
        });

        it('should create dataset with likeDataset', async () => {
            mockClassify.mockResolvedValue({
                type: 'CREATE_DATASET', name: 'HLQ.NEW.COPY', likeDataset: 'HLQ.EXISTING.PDS',
            });

            const request = { prompt: 'crée comme HLQ.EXISTING.PDS', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Create.dataSetLike).toHaveBeenCalledWith(expect.anything(), 'HLQ.NEW.COPY', 'HLQ.EXISTING.PDS', expect.any(Object));
        });

        it('should create dataset with custom options', async () => {
            mockClassify.mockResolvedValue({
                type: 'CREATE_DATASET', name: 'HLQ.CUSTOM', dstype: 'PARTITIONED',
                lrecl: 132, blksize: 27920, primary: 50, secondary: 10, dirblk: 30,
                volser: 'VOL001', storclass: 'SMSCLASS',
            });

            const request = { prompt: 'crée avec options', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('HLQ.CUSTOM');
        });
    });

    // ── CREATE_MEMBER ─────────────────────────────────────────

    describe('CREATE_MEMBER', () => {
        beforeEach(() => {
            (Upload.bufferToDataSet as jest.Mock).mockResolvedValue({});
        });

        it('should create a member with content', async () => {
            mockClassify.mockResolvedValue({
                type: 'CREATE_MEMBER', dataset: 'HLQ.COBOL.SRC', member: 'NEWPGM', content: 'IDENTIFICATION DIVISION.\n',
            });

            const request = { prompt: 'crée NEWPGM', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Upload.bufferToDataSet).toHaveBeenCalled();
            expect(result.metadata.intentType).toBe('CREATE_MEMBER');
        });

        it('should create an empty member when no content provided', async () => {
            mockClassify.mockResolvedValue({
                type: 'CREATE_MEMBER', dataset: 'HLQ.COBOL.SRC', member: 'EMPTY', content: undefined,
            });

            const request = { prompt: 'crée membre vide', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('vide');
        });
    });

    // ── DELETE_DATASET — with volume ──────────────────────────

    describe('DELETE_DATASET — volume', () => {
        it('should pass volume option when specified', async () => {
            mockClassify.mockResolvedValue({ type: 'DELETE_DATASET', dataset: 'HLQ.OLD.DATA', volume: 'VOL001' });
            (Delete.dataSet as jest.Mock).mockResolvedValue({});

            const request = { prompt: 'supprime HLQ.OLD.DATA sur VOL001', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Delete.dataSet).toHaveBeenCalledWith(expect.anything(), 'HLQ.OLD.DATA', { volume: 'VOL001' });
        });
    });

    // ── SEARCH_CONTENT ────────────────────────────────────────

    describe('SEARCH_CONTENT', () => {
        it('should search and find matches across members', async () => {
            mockClassify.mockResolvedValue({ type: 'SEARCH_CONTENT', dataset: 'HLQ.COBOL.SRC', searchTerm: 'PERFORM' });
            (List.allMembers as jest.Mock).mockResolvedValue({
                apiResponse: { items: [{ member: 'PGMA' }, { member: 'PGMB' }] },
            });
            (Download.dataSet as jest.Mock)
                .mockResolvedValueOnce({ apiResponse: 'LINE1\n       PERFORM SOMETHING\nLINE3\n' })
                .mockResolvedValueOnce({ apiResponse: 'NO MATCH HERE\n' });

            const request = { prompt: 'cherche PERFORM', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.intentType).toBe('SEARCH_CONTENT');
            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('PGMA');
        });

        it('should show no-results message when term not found', async () => {
            mockClassify.mockResolvedValue({ type: 'SEARCH_CONTENT', dataset: 'HLQ.COBOL.SRC', searchTerm: 'XYZNOTFOUND' });
            (List.allMembers as jest.Mock).mockResolvedValue({
                apiResponse: { items: [{ member: 'PGMA' }] },
            });
            (Download.dataSet as jest.Mock).mockResolvedValue({ apiResponse: 'NO MATCH\n' });

            const request = { prompt: 'cherche XYZNOTFOUND', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('XYZNOTFOUND');
        });

        it('should show no-member message when dataset has no members', async () => {
            mockClassify.mockResolvedValue({ type: 'SEARCH_CONTENT', dataset: 'HLQ.COBOL.SRC', searchTerm: 'PERFORM' });
            (List.allMembers as jest.Mock).mockResolvedValue({ apiResponse: { items: [] } });

            const request = { prompt: 'cherche PERFORM', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('HLQ.COBOL.SRC');
        });

        it('should truncate results when member has more than 10 matching lines', async () => {
            mockClassify.mockResolvedValue({ type: 'SEARCH_CONTENT', dataset: 'HLQ.COBOL.SRC', searchTerm: 'CALL' });
            (List.allMembers as jest.Mock).mockResolvedValue({
                apiResponse: { items: [{ member: 'BIGPGM' }] },
            });
            const lines = Array.from({ length: 15 }, (_, i) => `       CALL ROUTINE${i}`).join('\n');
            (Download.dataSet as jest.Mock).mockResolvedValue({ apiResponse: lines });

            const request = { prompt: 'cherche CALL', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('autres');
        });

        it('should skip members that throw on download', async () => {
            mockClassify.mockResolvedValue({ type: 'SEARCH_CONTENT', dataset: 'HLQ.COBOL.SRC', searchTerm: 'PERFORM' });
            (List.allMembers as jest.Mock).mockResolvedValue({
                apiResponse: { items: [{ member: 'PGMA' }, { member: 'BAD' }] },
            });
            (Download.dataSet as jest.Mock)
                .mockResolvedValueOnce({ apiResponse: 'PERFORM SOMETHING\n' })
                .mockRejectedValueOnce(new Error('Read error'));

            const request = { prompt: 'cherche PERFORM', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.intentType).toBe('SEARCH_CONTENT');
        });
    });

    // ── DATASET_INFO — empty result ───────────────────────────

    describe('DATASET_INFO — empty result', () => {
        it('should show not found message when dataset does not exist', async () => {
            mockClassify.mockResolvedValue({ type: 'DATASET_INFO', dataset: 'HLQ.MISSING' });
            (List.dataSet as jest.Mock).mockResolvedValue({ apiResponse: { items: [] } });

            const request = { prompt: 'info sur HLQ.MISSING', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('HLQ.MISSING');
        });

        it('should suggest PDS followups when dataset is a PDS', async () => {
            mockClassify.mockResolvedValue({ type: 'DATASET_INFO', dataset: 'HLQ.COBOL.SRC' });
            (List.dataSet as jest.Mock).mockResolvedValue({
                apiResponse: { items: [{ dsname: 'HLQ.COBOL.SRC', dsorg: 'PO', recfm: 'FB', lrecl: 80 }] },
            });

            const request = { prompt: 'info sur HLQ.COBOL.SRC', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.followups.length).toBeGreaterThan(0);
        });
    });

    // ── DOWNLOAD_MEMBER ───────────────────────────────────────

    describe('DOWNLOAD_MEMBER', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({
                type: 'DOWNLOAD_MEMBER', dataset: 'HLQ.COBOL.SRC', member: 'PGMA',
            });
            (Download.dataSet as jest.Mock).mockResolvedValue({});
            (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
        });

        it('should call Download.dataSet with local file path', async () => {
            const request = { prompt: 'télécharge HLQ.COBOL.SRC(PGMA)', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Download.dataSet).toHaveBeenCalledWith(
                expect.anything(), 'HLQ.COBOL.SRC(PGMA)', expect.objectContaining({ file: expect.any(String) })
            );
        });

        it('should return intentType DOWNLOAD_MEMBER', async () => {
            const request = { prompt: 'télécharge HLQ.COBOL.SRC(PGMA)', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.intentType).toBe('DOWNLOAD_MEMBER');
        });

        it('should use targetDir when specified', async () => {
            mockClassify.mockResolvedValue({
                type: 'DOWNLOAD_MEMBER', dataset: 'HLQ.COBOL.SRC', member: 'PGMA', targetDir: '/custom/dir',
            });

            const request = { prompt: 'télécharge vers /custom/dir', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Download.dataSet).toHaveBeenCalledWith(
                expect.anything(), 'HLQ.COBOL.SRC(PGMA)', expect.objectContaining({ file: expect.stringContaining('custom') })
            );
        });
    });

    // ── DOWNLOAD_ALL_MEMBERS ──────────────────────────────────

    describe('DOWNLOAD_ALL_MEMBERS', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'DOWNLOAD_ALL_MEMBERS', dataset: 'HLQ.COBOL.SRC' });
            (Download.allMembers as jest.Mock).mockResolvedValue({});
            (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
        });

        it('should call Download.allMembers', async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readdirSync as jest.Mock).mockReturnValue([]);

            const request = { prompt: 'télécharge tous les membres', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Download.allMembers).toHaveBeenCalled();
        });

        it('should return intentType DOWNLOAD_ALL_MEMBERS', async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(false);

            const request = { prompt: 'télécharge tous les membres', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.intentType).toBe('DOWNLOAD_ALL_MEMBERS');
        });
    });

    // ── DOWNLOAD_ALL_DATASETS ─────────────────────────────────

    describe('DOWNLOAD_ALL_DATASETS', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'DOWNLOAD_ALL_DATASETS', pattern: 'HLQ.**' });
            (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
        });

        it('should show no-dataset message when pattern matches nothing', async () => {
            (List.dataSet as jest.Mock).mockResolvedValue({ apiResponse: { items: [] } });

            const request = { prompt: 'télécharge tous les datasets HLQ.**', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('HLQ.**');
        });

        it('should download datasets when found', async () => {
            (List.dataSet as jest.Mock).mockResolvedValue({
                apiResponse: { items: [{ dsname: 'HLQ.COBOL.SRC', dsorg: 'PO' }] },
            });
            (Download.allDataSets as jest.Mock).mockResolvedValue({});
            (fs.existsSync as jest.Mock).mockReturnValue(false);

            const request = { prompt: 'télécharge tous les datasets HLQ.**', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Download.allDataSets).toHaveBeenCalled();
            expect(result.metadata.intentType).toBe('DOWNLOAD_ALL_DATASETS');
        });

        it('should show truncated list when more than 20 datasets', async () => {
            const items = Array.from({ length: 25 }, (_, i) => ({ dsname: `HLQ.DS${i}`, dsorg: 'PS' }));
            (List.dataSet as jest.Mock).mockResolvedValue({ apiResponse: { items } });
            (Download.allDataSets as jest.Mock).mockResolvedValue({});
            (fs.existsSync as jest.Mock).mockReturnValue(false);

            const request = { prompt: 'télécharge tous', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('autres');
        });
    });

    // ── UPLOAD_FILE_TO_MEMBER ─────────────────────────────────

    describe('UPLOAD_FILE_TO_MEMBER', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({
                type: 'UPLOAD_FILE_TO_MEMBER',
                localPath: '/tmp/pgma.cbl',
                dataset: 'HLQ.COBOL.SRC',
                member: 'PGMA',
            });
            (Upload.fileToDataset as jest.Mock).mockResolvedValue({});
        });

        it('should upload file when it exists', async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.statSync as jest.Mock).mockReturnValue({ size: 2048 });

            const request = { prompt: 'upload pgma.cbl', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Upload.fileToDataset).toHaveBeenCalled();
            expect(result.metadata.intentType).toBe('UPLOAD_FILE_TO_MEMBER');
        });

        it('should show error when file not found', async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(false);

            const request = { prompt: 'upload pgma.cbl', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('introuvable');
            expect(Upload.fileToDataset).not.toHaveBeenCalled();
        });
    });

    // ── UPLOAD_DIR_TO_PDS ─────────────────────────────────────

    describe('UPLOAD_DIR_TO_PDS', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({
                type: 'UPLOAD_DIR_TO_PDS', localPath: '/tmp/srcdir', dataset: 'HLQ.COBOL.SRC',
            });
            (Upload.dirToPds as jest.Mock).mockResolvedValue({});
        });

        it('should show error when directory not found', async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(false);
            (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });

            const request = { prompt: 'upload dossier', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('introuvable');
        });

        it('should show error when directory is empty', async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true, isFile: () => false });
            (fs.readdirSync as jest.Mock).mockReturnValue([]);

            const request = { prompt: 'upload dossier vide', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('vide');
        });

        it('should upload directory when it has files', async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.statSync as jest.Mock).mockImplementation((p: string) => {
                if (p === '/tmp/srcdir') { return { isDirectory: () => true, isFile: () => false }; }
                return { isDirectory: () => false, isFile: () => true };
            });
            (fs.readdirSync as jest.Mock).mockReturnValue(['pgma.cbl', 'pgmb.cbl']);

            const request = { prompt: 'upload dossier', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Upload.dirToPds).toHaveBeenCalled();
            expect(result.metadata.intentType).toBe('UPLOAD_DIR_TO_PDS');
        });

        it('should truncate file list when more than 20 files', async () => {
            const files = Array.from({ length: 25 }, (_, i) => `pgm${i}.cbl`);
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.statSync as jest.Mock).mockImplementation((p: string) => {
                if (p === '/tmp/srcdir') { return { isDirectory: () => true, isFile: () => false }; }
                return { isDirectory: () => false, isFile: () => true };
            });
            (fs.readdirSync as jest.Mock).mockReturnValue(files);

            const request = { prompt: 'upload grand dossier', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('autres');
        });
    });

    // ── COPY_MEMBER ───────────────────────────────────────────

    describe('COPY_MEMBER', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({
                type: 'COPY_MEMBER',
                fromDataset: 'HLQ.SRC', fromMember: 'PGMA',
                toDataset: 'HLQ.TGT', toMember: 'PGMACOPY',
            });
            (Copy.dataSet as jest.Mock).mockResolvedValue({});
        });

        it('should call Copy.dataSet', async () => {
            const request = { prompt: 'copie PGMA vers HLQ.TGT', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Copy.dataSet).toHaveBeenCalled();
        });

        it('should return intentType COPY_MEMBER', async () => {
            const request = { prompt: 'copie PGMA vers HLQ.TGT', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.intentType).toBe('COPY_MEMBER');
        });
    });

    // ── COPY_DATASET ──────────────────────────────────────────

    describe('COPY_DATASET', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({
                type: 'COPY_DATASET', fromDataset: 'HLQ.SRC.PDS', toDataset: 'HLQ.TGT.PDS',
            });
            (Copy.dataSet as jest.Mock).mockResolvedValue({});
        });

        it('should copy PDS member by member', async () => {
            (Copy.isPDS as jest.Mock).mockResolvedValue(true);
            (List.allMembers as jest.Mock).mockResolvedValue({
                apiResponse: { items: [{ member: 'PGMA' }, { member: 'PGMB' }] },
            });

            const request = { prompt: 'copie HLQ.SRC.PDS vers HLQ.TGT.PDS', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Copy.dataSet).toHaveBeenCalledTimes(2);
            expect(result.metadata.intentType).toBe('COPY_DATASET');
        });

        it('should report errors when some members fail to copy', async () => {
            (Copy.isPDS as jest.Mock).mockResolvedValue(true);
            (List.allMembers as jest.Mock).mockResolvedValue({
                apiResponse: { items: [{ member: 'PGMA' }, { member: 'BAD' }] },
            });
            (Copy.dataSet as jest.Mock)
                .mockResolvedValueOnce({})
                .mockRejectedValueOnce(new Error('Copy failed'));

            const request = { prompt: 'copie PDS', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('erreur');
        });

        it('should copy sequential dataset directly', async () => {
            (Copy.isPDS as jest.Mock).mockResolvedValue(false);

            const request = { prompt: 'copie dataset séquentiel', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(Copy.dataSet).toHaveBeenCalledTimes(1);
            expect(result.metadata.intentType).toBe('COPY_DATASET');
        });
    });

    // ── Private utility methods ───────────────────────────────

    describe('pdsExtension (private)', () => {
        it('should return .cbl for COBOL dataset', () => {
            expect((handler as any).pdsExtension('HLQ.COBOL.SRC')).toBe('.cbl');
        });

        it('should return .jcl for JCL dataset', () => {
            expect((handler as any).pdsExtension('HLQ.JCL.CNTL')).toBe('.jcl');
        });

        it('should return .proc for PROC dataset', () => {
            expect((handler as any).pdsExtension('HLQ.PROCLIB')).toBe('.proc');
        });

        it('should return .asm for ASM dataset', () => {
            expect((handler as any).pdsExtension('HLQ.ASM.SRC')).toBe('.asm');
        });

        it('should return .cpy for COPY dataset', () => {
            expect((handler as any).pdsExtension('HLQ.COPY.LIB')).toBe('.cpy');
        });

        it('should return .pli for PLI dataset', () => {
            expect((handler as any).pdsExtension('HLQ.PLI.SRC')).toBe('.pli');
        });

        it('should return .rexx for REXX dataset', () => {
            expect((handler as any).pdsExtension('HLQ.REXX.EXEC')).toBe('.rexx');
        });

        it('should return .xml for XML dataset', () => {
            expect((handler as any).pdsExtension('HLQ.XML.CONFIG')).toBe('.xml');
        });

        it('should return .txt for unknown dataset type', () => {
            expect((handler as any).pdsExtension('HLQ.DATA.SET')).toBe('.txt');
        });
    });

    describe('detectCodeLanguage (private)', () => {
        it('should detect COBOL from content', () => {
            expect((handler as any).detectCodeLanguage('PGMA', 'IDENTIFICATION DIVISION.')).toBe('cobol');
        });

        it('should detect COBOL from indented code', () => {
            expect((handler as any).detectCodeLanguage('PGMA', '      MOVE X TO Y\n')).toBe('cobol');
        });

        it('should detect JCL from content', () => {
            expect((handler as any).detectCodeLanguage('MYJOB', '//MYJOB JOB\n// DD DSN=HLQ.DATA\n')).toBe('jcl');
        });

        it('should detect ASM from member name', () => {
            expect((handler as any).detectCodeLanguage('ASMPGM', 'some content')).toBe('asm');
        });

        it('should detect ASM from CSECT', () => {
            expect((handler as any).detectCodeLanguage('PROG', 'MYPGM CSECT\n USING MYPGM,15\n')).toBe('asm');
        });

        it('should detect PL/I content', () => {
            expect((handler as any).detectCodeLanguage('PROG', 'PROC ;\n/* comment */\nEND;\n')).toBe('pli');
        });

        it('should detect XML content', () => {
            expect((handler as any).detectCodeLanguage('CONFIG', '<root><item>value</item></root>')).toBe('xml');
        });

        it('should return text for unknown content', () => {
            expect((handler as any).detectCodeLanguage('DATA', 'some plain text')).toBe('text');
        });
    });

    describe('resolveDownloadDir (private)', () => {
        it('should use absolute targetDir directly', () => {
            const result = (handler as any).resolveDownloadDir('/absolute/path');
            expect(result).toBe('/absolute/path');
        });

        it('should join relative targetDir with workspace root', () => {
            (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
            const result = (handler as any).resolveDownloadDir('relative/dir');
            expect(result).toContain('workspace');
            expect(result).toContain('relative');
        });

        it('should use downloads subfolder when no targetDir', () => {
            (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
            const result = (handler as any).resolveDownloadDir();
            expect(result).toContain('downloads');
        });
    });

    describe('renameDownloadedFiles (private)', () => {
        it('should rename files to uppercase with extension', () => {
            (fs.readdirSync as jest.Mock).mockReturnValue([
                { isFile: () => true, name: 'pgma.txt' },
            ]);
            (fs.renameSync as jest.Mock).mockImplementation(() => {});

            const result = (handler as any).renameDownloadedFiles('/some/dir', 'HLQ.COBOL.SRC');

            expect(result).toContain('PGMA.cbl');
        });

        it('should skip renaming when old path equals new path', () => {
            (fs.readdirSync as jest.Mock).mockReturnValue([
                { isFile: () => true, name: 'PGMA.cbl' },
            ]);

            const result = (handler as any).renameDownloadedFiles('/some/dir', 'HLQ.COBOL.SRC');

            expect(result).toContain('PGMA.cbl');
            expect(fs.renameSync).not.toHaveBeenCalled();
        });
    });

    describe('renameDatasetFiles (private)', () => {
        it('should rename members in PDS directory', () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true, isFile: () => false });
            (fs.readdirSync as jest.Mock).mockReturnValue([
                { isFile: () => true, name: 'pgma.txt' },
            ]);
            (fs.renameSync as jest.Mock).mockImplementation(() => {});

            (handler as any).renameDatasetFiles('/base', [{ dsname: 'HLQ.COBOL.SRC', dsorg: 'PO' }]);

            expect(fs.readdirSync).toHaveBeenCalled();
        });

        it('should rename sequential dataset file', () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false, isFile: () => true });
            (fs.renameSync as jest.Mock).mockImplementation(() => {});

            (handler as any).renameDatasetFiles('/base', [{ dsname: 'HLQ.DATA.FILE', dsorg: 'PS' }]);

            expect(fs.renameSync).toHaveBeenCalled();
        });

        it('should skip datasets that do not exist locally', () => {
            (fs.existsSync as jest.Mock).mockReturnValue(false);

            (handler as any).renameDatasetFiles('/base', [{ dsname: 'HLQ.MISSING', dsorg: 'PS' }]);

            expect(fs.renameSync).not.toHaveBeenCalled();
        });
    });

    describe('resolveLocalPath (private)', () => {
        it('should return absolute path unchanged', () => {
            const result = (handler as any).resolveLocalPath('/absolute/path.jcl');
            expect(result).toBe('/absolute/path.jcl');
        });

        it('should join relative path with workspace root', () => {
            (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
            const result = (handler as any).resolveLocalPath('relative/path.jcl');
            expect(result).toContain('workspace');
        });

        it('should return relative path as-is when no workspace root', () => {
            (vscode.workspace as any).workspaceFolders = undefined;
            const result = (handler as any).resolveLocalPath('relative/path.jcl');
            expect(result).toBe('relative/path.jcl');
        });
    });

    // ── CREATE_DATASET — likeDataset with options ─────────────

    describe('CREATE_DATASET — likeDataset with override options', () => {
        it('should display options table when likeDataset + overrides provided', async () => {
            mockClassify.mockResolvedValue({
                type: 'CREATE_DATASET', name: 'HLQ.NEW.COPY',
                likeDataset: 'HLQ.EXISTING.PDS',
                lrecl: 132, primary: 20,
            });
            (Create.dataSetLike as jest.Mock).mockResolvedValue({});

            const request = { prompt: 'crée comme HLQ.EXISTING.PDS lrecl 132', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('LRECL');
        });
    });

    // ── CREATE_DATASET — configuration defaults ───────────────

    describe('CREATE_DATASET — configuration defaults from workspace settings', () => {
        it('should apply volser/storclass/mgntclass/dataclass from config when provided', async () => {
            mockClassify.mockResolvedValue({ type: 'CREATE_DATASET', name: 'HLQ.SMS.PDS', dstype: 'PARTITIONED' });
            (Create.dataSet as jest.Mock).mockResolvedValue({});
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
                get: jest.fn().mockImplementation((key: string) => {
                    const vals: Record<string, any> = {
                        alcunit: 'CYL', primary: 5, secondary: 2, recfm: 'FB', lrecl: 80,
                        volser: 'SMS001', storclass: 'SMSCLS', mgntclass: 'MGMT', dataclass: 'DATA',
                    };
                    return vals[key];
                }),
            });

            const request = { prompt: 'crée PDS SMS', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('HLQ.SMS.PDS');
        });
    });

    // ── SEARCH_CONTENT — sort comparator ─────────────────────

    describe('SEARCH_CONTENT — multi-member sort', () => {
        it('should sort followups by hit count when multiple members match', async () => {
            mockClassify.mockResolvedValue({ type: 'SEARCH_CONTENT', dataset: 'HLQ.COBOL.SRC', searchTerm: 'PERFORM' });
            (List.allMembers as jest.Mock).mockResolvedValue({
                apiResponse: { items: [{ member: 'PGMA' }, { member: 'PGMB' }] },
            });
            (Download.dataSet as jest.Mock)
                .mockResolvedValueOnce({ apiResponse: 'PERFORM A\nPERFORM B\nPERFORM C\n' }) // 3 hits
                .mockResolvedValueOnce({ apiResponse: 'PERFORM X\n' }); // 1 hit

            const request = { prompt: 'cherche PERFORM dans les deux', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            // PGMA (3 hits) should appear before PGMB (1 hit) in followups
            expect(result.metadata.followups[0].prompt).toContain('PGMA');
        });
    });
});
