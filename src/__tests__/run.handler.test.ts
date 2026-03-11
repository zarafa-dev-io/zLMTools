import { RunHandler } from '../handlers/run.handler';
import { RunIntentClassifier } from '../intents/run.classifier';
import { ZoweSessionManager } from '../zowe/session';
import { TelemetryService } from '../utils/telemetry';
import { SubmitJobs, GetJobs } from '@zowe/zos-jobs-for-zowe-sdk';
import * as vscode from 'vscode';

// ============================================================
// Mocks
// ============================================================

jest.mock('../intents/run.classifier');

jest.mock('@zowe/zos-jobs-for-zowe-sdk', () => ({
    SubmitJobs: {
        submitJob: jest.fn(),
        submitJcl: jest.fn(),
    },
    GetJobs: {
        getJob: jest.fn(),
        getJobsCommon: jest.fn(),
        getSpoolFilesForJob: jest.fn(),
        getSpoolContentById: jest.fn(),
    },
    MonitorJobs: {
        waitForJobOutputStatus: jest.fn(),
    },
}));

jest.mock('@zowe/zos-files-for-zowe-sdk', () => ({
    Download: {
        dataSet: jest.fn(),
    },
}));

jest.mock('../zowe/safety', () => ({
    requestConfirmation: jest.fn().mockResolvedValue(true),
    describeOperation: jest.fn().mockReturnValue('test operation'),
    getEffectiveSafetyLevel: jest.fn().mockImplementation((s: string) => s),
    isProtectedDataset: jest.fn().mockReturnValue(false),
}));

jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(true),
    readFileSync: jest.fn().mockReturnValue('//MYJOB   JOB (ACCT),\'DESC\',CLASS=A\n//STEP01  EXEC PGM=IEFBR14\n'),
    mkdirSync: jest.fn(),
}));

// ============================================================
// Tests — RunHandler
// ============================================================

const MOCK_SUBMITTED_JOB = {
    jobname: 'MYJOB',
    jobid: 'JOB99001',
    owner: 'USER1',
    status: 'INPUT',
    retcode: null,
    type: 'JOB',
    class: 'A',
};

describe('RunHandler', () => {
    let handler: RunHandler;
    let mockClassify: jest.Mock;
    let mockSessionManager: Partial<ZoweSessionManager>;
    let mockTelemetry: Partial<TelemetryService>;
    let mockStream: Partial<vscode.ChatResponseStream>;
    let mockToken: Partial<vscode.CancellationToken>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockClassify = jest.fn();
        (RunIntentClassifier as jest.Mock).mockImplementation(() => ({
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
        };

        // CancellationToken: isCancellationRequested = true so that monitoring loops exit immediately
        mockToken = {
            isCancellationRequested: true,
            onCancellationRequested: jest.fn(),
        };

        handler = new RunHandler(
            mockSessionManager as ZoweSessionManager,
            mockTelemetry as TelemetryService
        );
    });

    // ── Instantiation ─────────────────────────────────────────

    describe('Handler instantiation', () => {
        it('should create RunHandler instance', () => {
            expect(handler).toBeDefined();
            expect(handler).toBeInstanceOf(RunHandler);
        });
    });

    // ── Empty prompt ──────────────────────────────────────────

    describe('Empty prompt', () => {
        it('should return help text without calling the classifier', async () => {
            const request = { prompt: '', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(result.metadata.command).toBe('run');
            expect(mockClassify).not.toHaveBeenCalled();
        });

        it('should return followup suggestions', async () => {
            const request = { prompt: '', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(result.metadata.followups.length).toBeGreaterThan(0);
        });

        it('should call stream.markdown with help content', async () => {
            const request = { prompt: '', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(mockStream.markdown).toHaveBeenCalled();
            const content = (mockStream.markdown as jest.Mock).mock.calls[0][0] as string;
            expect(content).toContain('/run');
        });
    });

    // ── Unrecognized intent ────────────────────────────────────

    describe('Unrecognized intent', () => {
        it('should return graceful response when classifier returns null', async () => {
            mockClassify.mockResolvedValue(null);
            const request = { prompt: 'quelque chose d\'incompréhensible', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(result.metadata.command).toBe('run');
            expect(result.metadata.intentType).toBeUndefined();
            expect(mockStream.markdown).toHaveBeenCalled();
        });

        it('should not call getSession when intent is null', async () => {
            mockClassify.mockResolvedValue(null);
            const request = { prompt: 'foo bar', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(mockSessionManager.getSession).not.toHaveBeenCalled();
        });
    });

    // ── SUBMIT_DATASET ────────────────────────────────────────

    describe('SUBMIT_DATASET', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'SUBMIT_DATASET', dataset: 'HLQ.JCL.CNTL', member: 'BATCH01' });
            (SubmitJobs.submitJob as jest.Mock).mockResolvedValue(MOCK_SUBMITTED_JOB);
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([]);
        });

        it('should call SubmitJobs.submitJob with the full name', async () => {
            const request = { prompt: 'soumets HLQ.JCL.CNTL(BATCH01)', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(SubmitJobs.submitJob).toHaveBeenCalledWith(expect.anything(), 'HLQ.JCL.CNTL(BATCH01)');
        });

        it('should return intentType SUBMIT_DATASET', async () => {
            const request = { prompt: 'soumets HLQ.JCL.CNTL(BATCH01)', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(result.metadata.intentType).toBe('SUBMIT_DATASET');
        });

        it('should submit dataset without member when member is not specified', async () => {
            mockClassify.mockResolvedValue({ type: 'SUBMIT_DATASET', dataset: 'HLQ.JCL.SEQ', member: undefined });
            const request = { prompt: 'soumets HLQ.JCL.SEQ', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(SubmitJobs.submitJob).toHaveBeenCalledWith(expect.anything(), 'HLQ.JCL.SEQ');
        });

        it('should display submit result in markdown', async () => {
            const request = { prompt: 'soumets HLQ.JCL.CNTL(BATCH01)', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('MYJOB');
            expect(allMarkdown).toContain('JOB99001');
        });

        it('should request confirmation before submitting', async () => {
            const { requestConfirmation } = require('../zowe/safety');
            const request = { prompt: 'soumets HLQ.JCL.CNTL(BATCH01)', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(requestConfirmation).toHaveBeenCalled();
        });

        it('should not submit when confirmation is refused', async () => {
            const { requestConfirmation } = require('../zowe/safety');
            (requestConfirmation as jest.Mock).mockResolvedValueOnce(false);

            const request = { prompt: 'soumets HLQ.JCL.CNTL(BATCH01)', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(SubmitJobs.submitJob).not.toHaveBeenCalled();
        });

        it('should track success in telemetry', async () => {
            const request = { prompt: 'soumets HLQ.JCL.CNTL(BATCH01)', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(mockTelemetry.trackSuccess).toHaveBeenCalledWith('run', 'SUBMIT_DATASET', 'DEV1');
        });
    });

    // ── SUBMIT_INLINE ─────────────────────────────────────────

    describe('SUBMIT_INLINE', () => {
        const validJcl = '//MYJOB   JOB (ACCT),\'DESC\',CLASS=A\n//STEP01  EXEC PGM=IEFBR14\n';

        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'SUBMIT_INLINE', jcl: validJcl });
            (SubmitJobs.submitJcl as jest.Mock).mockResolvedValue(MOCK_SUBMITTED_JOB);
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([]);
        });

        it('should call SubmitJobs.submitJcl with the JCL content', async () => {
            const request = { prompt: 'soumets ce JCL', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(SubmitJobs.submitJcl).toHaveBeenCalledWith(expect.anything(), validJcl);
        });

        it('should return intentType SUBMIT_INLINE', async () => {
            const request = { prompt: 'soumets ce JCL', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(result.metadata.intentType).toBe('SUBMIT_INLINE');
        });

        it('should reject incomplete JCL without JOB card', async () => {
            mockClassify.mockResolvedValue({ type: 'SUBMIT_INLINE', jcl: '//STEP01  EXEC PGM=IEFBR14' });

            const request = { prompt: 'soumets ce JCL', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(SubmitJobs.submitJcl).not.toHaveBeenCalled();
            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('⚠️');
        });
    });

    // ── SUBMIT_AND_MONITOR ────────────────────────────────────

    describe('SUBMIT_AND_MONITOR', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'SUBMIT_AND_MONITOR', dataset: 'HLQ.JCL.CNTL', member: 'NIGHTLY' });
            (SubmitJobs.submitJob as jest.Mock).mockResolvedValue(MOCK_SUBMITTED_JOB);
            (GetJobs.getJob as jest.Mock).mockResolvedValue({ ...MOCK_SUBMITTED_JOB, status: 'OUTPUT', retcode: 'CC 0000' });
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([]);
        });

        it('should call SubmitJobs.submitJob', async () => {
            const request = { prompt: 'soumets et surveille HLQ.JCL.CNTL(NIGHTLY)', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(SubmitJobs.submitJob).toHaveBeenCalledWith(expect.anything(), 'HLQ.JCL.CNTL(NIGHTLY)');
        });

        it('should return intentType SUBMIT_AND_MONITOR', async () => {
            const request = { prompt: 'soumets et surveille HLQ.JCL.CNTL(NIGHTLY)', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(result.metadata.intentType).toBe('SUBMIT_AND_MONITOR');
        });
    });

    // ── RESUBMIT ──────────────────────────────────────────────

    describe('RESUBMIT', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'RESUBMIT', jobId: 'JOB12345', jobName: 'PAYROLL' });
            (GetJobs.getJob as jest.Mock).mockResolvedValue({
                jobname: 'PAYROLL',
                jobid: 'JOB12345',
                owner: 'USER1',
                status: 'OUTPUT',
                retcode: 'CC 0000',
            });
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'JESJCL', stepname: null, id: 1 },
            ]);
            (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue(
                '//PAYROLL JOB (ACCT),\'TEST\',CLASS=A\n//STEP01  EXEC PGM=IEFBR14\n'
            );
            (SubmitJobs.submitJcl as jest.Mock).mockResolvedValue(MOCK_SUBMITTED_JOB);
        });

        it('should return intentType RESUBMIT', async () => {
            const request = { prompt: 'relance JOB12345', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(result.metadata.intentType).toBe('RESUBMIT');
        });

        it('should fetch original JCL from spool', async () => {
            const request = { prompt: 'relance JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(GetJobs.getSpoolFilesForJob).toHaveBeenCalled();
        });
    });

    // ── Session management ─────────────────────────────────────

    describe('Session management', () => {
        it('should call getSession when processing an intent', async () => {
            mockClassify.mockResolvedValue({ type: 'SUBMIT_DATASET', dataset: 'HLQ.JCL.CNTL', member: 'BATCH01' });
            (SubmitJobs.submitJob as jest.Mock).mockResolvedValue(MOCK_SUBMITTED_JOB);
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([]);

            const request = { prompt: 'soumets HLQ.JCL.CNTL(BATCH01)', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(mockSessionManager.getSession).toHaveBeenCalled();
        });

        it('should propagate session errors', async () => {
            mockClassify.mockResolvedValue({ type: 'SUBMIT_DATASET', dataset: 'HLQ.JCL.CNTL', member: 'BATCH01' });
            (mockSessionManager.getSession as jest.Mock).mockRejectedValue(new Error('No connection'));

            const request = { prompt: 'soumets HLQ.JCL.CNTL(BATCH01)', model: {} } as any;

            await expect(
                handler.handle(request, {} as any, mockStream as any, mockToken as any)
            ).rejects.toThrow('No connection');
        });
    });

    // ── Stream interactions ────────────────────────────────────

    describe('Stream interactions', () => {
        it('should call stream.progress while processing', async () => {
            mockClassify.mockResolvedValue({ type: 'SUBMIT_DATASET', dataset: 'HLQ.JCL.CNTL', member: 'BATCH01' });
            (SubmitJobs.submitJob as jest.Mock).mockResolvedValue(MOCK_SUBMITTED_JOB);
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([]);

            const request = { prompt: 'soumets HLQ.JCL.CNTL(BATCH01)', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(mockStream.progress).toHaveBeenCalled();
        });
    });

    // ── Language detection ─────────────────────────────────────

    describe('Language detection', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'SUBMIT_DATASET', dataset: 'HLQ.JCL.CNTL', member: 'BATCH01' });
            (SubmitJobs.submitJob as jest.Mock).mockResolvedValue(MOCK_SUBMITTED_JOB);
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([]);
        });

        it('should handle French prompts', async () => {
            const request = { prompt: 'soumets HLQ.JCL.CNTL(BATCH01)', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(result).toBeDefined();
        });

        it('should handle English prompts', async () => {
            const request = { prompt: 'submit HLQ.JCL.CNTL(BATCH01)', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(result).toBeDefined();
        });
    });

    // ── getStatusEmoji (private) ──────────────────────────────

    describe('getStatusEmoji (private)', () => {
        it('should return 🔄 for ACTIVE status', () => {
            expect((handler as any).getStatusEmoji('ACTIVE', null)).toBe('🔄');
        });

        it('should return 🚀 when no retcode', () => {
            expect((handler as any).getStatusEmoji('OUTPUT', undefined)).toBe('🚀');
        });

        it('should return ✅ for CC 0000', () => {
            expect((handler as any).getStatusEmoji('OUTPUT', 'CC 0000')).toBe('✅');
        });

        it('should return 🟡 for CC 0004', () => {
            expect((handler as any).getStatusEmoji('OUTPUT', 'CC 0004')).toBe('🟡');
        });

        it('should return 🟠 for CC 0008', () => {
            expect((handler as any).getStatusEmoji('OUTPUT', 'CC 0008')).toBe('🟠');
        });

        it('should return 🔴 for ABEND', () => {
            expect((handler as any).getStatusEmoji('OUTPUT', 'ABEND S0C7')).toBe('🔴');
        });

        it('should return 🔴 for JCL ERROR', () => {
            expect((handler as any).getStatusEmoji('OUTPUT', 'JCL ERROR')).toBe('🔴');
        });

        it('should return ❌ for CANCEL', () => {
            expect((handler as any).getStatusEmoji('OUTPUT', 'CANCEL')).toBe('❌');
        });

        it('should return 🟠 for unknown retcode', () => {
            expect((handler as any).getStatusEmoji('OUTPUT', 'FLUSH')).toBe('🟠');
        });
    });

    // ── formatReturnCode (private) ────────────────────────────

    describe('formatReturnCode (private)', () => {
        it('should return en cours for ACTIVE with no retcode', () => {
            const result = (handler as any).formatReturnCode({ status: 'ACTIVE', retcode: null });
            expect(result).toContain('en cours');
        });

        it('should return dash for non-ACTIVE with no retcode', () => {
            const result = (handler as any).formatReturnCode({ status: 'INPUT', retcode: null });
            expect(result).toBe('-');
        });

        it('should return backtick-wrapped retcode', () => {
            const result = (handler as any).formatReturnCode({ status: 'OUTPUT', retcode: 'CC 0000' });
            expect(result).toBe('`CC 0000`');
        });
    });

    // ── cleanJesJcl (private) ─────────────────────────────────

    describe('cleanJesJcl (private)', () => {
        it('should strip JES line numbers and keep JCL content', () => {
            const rawJcl = '        1 //MYJOB JOB (ACCT)\n        2 //STEP01 EXEC PGM=IEFBR14\n';
            const result = (handler as any).cleanJesJcl(rawJcl);
            expect(result).toContain('//MYJOB JOB (ACCT)');
            expect(result).not.toContain('        1');
        });

        it('should keep plain JCL lines unchanged', () => {
            const rawJcl = '//MYJOB JOB (ACCT)\n//STEP01 EXEC PGM=IEFBR14\n';
            const result = (handler as any).cleanJesJcl(rawJcl);
            expect(result).toContain('//MYJOB JOB (ACCT)');
        });

        it('should trim leading and trailing empty lines', () => {
            const rawJcl = '\n\n//MYJOB JOB\n\n';
            const result = (handler as any).cleanJesJcl(rawJcl);
            expect(result).toBe('//MYJOB JOB');
        });
    });

    // ── resolveJob (private) ──────────────────────────────────

    describe('resolveJob (private)', () => {
        it('should return null when neither jobId nor jobName provided', async () => {
            const result = await (handler as any).resolveJob({}, {});
            expect(result).toBeNull();
        });

        it('should resolve by jobName using getJobsCommon', async () => {
            const mockJob = { ...MOCK_SUBMITTED_JOB, jobname: 'PAYROLL' };
            (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([mockJob]);

            const result = await (handler as any).resolveJob({}, { jobName: 'PAYROLL' });
            expect(result).toEqual(mockJob);
            expect(GetJobs.getJobsCommon).toHaveBeenCalledWith(
                expect.anything(),
                { prefix: 'PAYROLL', maxJobs: 5 }
            );
        });

        it('should return null when no jobs found by jobName', async () => {
            (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([]);
            const result = await (handler as any).resolveJob({}, { jobName: 'UNKNOWN' });
            expect(result).toBeNull();
        });

        it('should return null when getJob throws for jobId', async () => {
            (GetJobs.getJob as jest.Mock).mockRejectedValue(new Error('Not found'));
            const result = await (handler as any).resolveJob({}, { jobId: 'JOB99999' });
            expect(result).toBeNull();
        });
    });

    // ── displayJobSpool (private) ─────────────────────────────

    describe('displayJobSpool (private)', () => {
        const mockJob = { jobname: 'MYJOB', jobid: 'JOB99001' };

        it('should show empty spool message when no files', async () => {
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([]);
            await (handler as any).displayJobSpool({}, mockJob, false, mockStream);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('spool file');
        });

        it('should display SYSPRINT on success path', async () => {
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'SYSPRINT', stepname: 'STEP01', id: 1 },
            ]);
            (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue('OUTPUT LINE 1\n');

            await (handler as any).displayJobSpool({}, mockJob, false, mockStream);
            expect(GetJobs.getSpoolContentById).toHaveBeenCalled();
        });

        it('should prioritize JESMSGLG in error path', async () => {
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'SYSPRINT', stepname: 'STEP01', id: 2 },
                { ddname: 'JESMSGLG', stepname: null, id: 1 },
            ]);
            (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue('ERROR MSG');

            await (handler as any).displayJobSpool({}, mockJob, true, mockStream);

            const firstCallId = (GetJobs.getSpoolContentById as jest.Mock).mock.calls[0][3];
            expect(firstCallId).toBe(1); // JESMSGLG id
        });

        it('should list remaining spool files beyond MAX_DISPLAY', async () => {
            const spoolFiles = [
                { ddname: 'SYSPRINT', stepname: 'STEP01', id: 1 },
                { ddname: 'SYSOUT', stepname: 'STEP01', id: 2 },
                { ddname: 'SYSTSPRT', stepname: 'STEP01', id: 3 },
                { ddname: 'JESMSGLG', stepname: null, id: 4 },
                { ddname: 'JESYSMSG', stepname: null, id: 5 }, // remaining
            ];
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue(spoolFiles);
            (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue('content');

            await (handler as any).displayJobSpool({}, mockJob, false, mockStream);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('Autres spool files');
        });

        it('should handle error from getSpoolFilesForJob', async () => {
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockRejectedValue(new Error('Spool error'));

            await (handler as any).displayJobSpool({}, mockJob, false, mockStream);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('spool');
        });
    });

    // ── displaySpoolContent (private) ─────────────────────────

    describe('displaySpoolContent (private)', () => {
        const mockJob = { jobname: 'MYJOB', jobid: 'JOB99001' };
        const mockSpoolFile = { ddname: 'SYSPRINT', stepname: 'STEP01', id: 1 };

        it('should skip empty content', async () => {
            (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue('   ');
            await (handler as any).displaySpoolContent({}, mockJob, mockSpoolFile, mockStream);
            expect(mockStream.markdown).not.toHaveBeenCalled();
        });

        it('should display full content for <= 100 lines', async () => {
            (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue('line1\nline2\nline3');
            await (handler as any).displaySpoolContent({}, mockJob, mockSpoolFile, mockStream);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('line1');
        });

        it('should show tail for JESMSGLG with > 100 lines', async () => {
            const lines = Array.from({ length: 150 }, (_, i) => `line ${i + 1}`);
            (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue(lines.join('\n'));
            const jesFile = { ddname: 'JESMSGLG', stepname: null, id: 1 };

            await (handler as any).displaySpoolContent({}, mockJob, jesFile, mockStream);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('masquées');
        });

        it('should show head+tail for other DDs with > 100 lines', async () => {
            const lines = Array.from({ length: 150 }, (_, i) => `line ${i + 1}`);
            (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue(lines.join('\n'));

            await (handler as any).displaySpoolContent({}, mockJob, mockSpoolFile, mockStream);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('masquées');
        });

        it('should handle error from getSpoolContentById', async () => {
            (GetJobs.getSpoolContentById as jest.Mock).mockRejectedValue(new Error('Read error'));

            await (handler as any).displaySpoolContent({}, mockJob, mockSpoolFile, mockStream);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('impossible');
        });
    });

    // ── RESUBMIT — edge cases ─────────────────────────────────

    describe('RESUBMIT — edge cases', () => {
        it('should show not-found message when job not found by jobId', async () => {
            mockClassify.mockResolvedValue({ type: 'RESUBMIT', jobId: 'JOB99999' });
            (GetJobs.getJob as jest.Mock).mockRejectedValue(new Error('Not found'));

            const request = { prompt: 'relance JOB99999', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('JOB99999');
            expect(allMarkdown).toContain('non trouvé');
        });

        it('should show not-found message when job not found by jobName', async () => {
            mockClassify.mockResolvedValue({ type: 'RESUBMIT', jobName: 'UNKNOWN' });
            (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([]);

            const request = { prompt: 'relance UNKNOWN', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('UNKNOWN');
        });

        it('should show error when JESJCL not found in spool', async () => {
            mockClassify.mockResolvedValue({ type: 'RESUBMIT', jobId: 'JOB12345' });
            (GetJobs.getJob as jest.Mock).mockResolvedValue({
                jobname: 'PAYROLL', jobid: 'JOB12345', status: 'OUTPUT', retcode: 'CC 0000',
            });
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'SYSPRINT', stepname: null, id: 1 }, // no JESJCL
            ]);

            const request = { prompt: 'relance JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('JESJCL');
        });

        it('should show error when JESJCL content is empty', async () => {
            mockClassify.mockResolvedValue({ type: 'RESUBMIT', jobId: 'JOB12345' });
            (GetJobs.getJob as jest.Mock).mockResolvedValue({
                jobname: 'PAYROLL', jobid: 'JOB12345', status: 'OUTPUT', retcode: 'CC 0000',
            });
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'JESJCL', stepname: null, id: 1 },
            ]);
            (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue('   ');

            const request = { prompt: 'relance JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('vide');
        });

        it('should resubmit using cleanJesJcl when JES line numbers are present', async () => {
            mockClassify.mockResolvedValue({ type: 'RESUBMIT', jobId: 'JOB12345' });
            (GetJobs.getJob as jest.Mock).mockResolvedValue({
                jobname: 'PAYROLL', jobid: 'JOB12345', status: 'OUTPUT', retcode: 'CC 0000',
            });
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'JESJCL', stepname: null, id: 1 },
            ]);
            (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue(
                '        1 //PAYROLL JOB (ACCT),\'TEST\',CLASS=A\n        2 //STEP01  EXEC PGM=IEFBR14\n'
            );
            (SubmitJobs.submitJcl as jest.Mock).mockResolvedValue(MOCK_SUBMITTED_JOB);

            const request = { prompt: 'relance JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            const [, submittedJcl] = (SubmitJobs.submitJcl as jest.Mock).mock.calls[0];
            expect(submittedJcl).toContain('//PAYROLL JOB');
            expect(submittedJcl).not.toContain('        1');
        });
    });

    // ── SUBMIT_LOCAL_FILE ─────────────────────────────────────

    describe('SUBMIT_LOCAL_FILE', () => {
        let fsMock: any;

        beforeEach(() => {
            fsMock = require('fs');
            (SubmitJobs.submitJcl as jest.Mock).mockResolvedValue(MOCK_SUBMITTED_JOB);
        });

        it('should submit a local JCL file successfully', async () => {
            mockClassify.mockResolvedValue({ type: 'SUBMIT_LOCAL_FILE', localPath: '/tmp/myjob.jcl' });
            (fsMock.existsSync as jest.Mock).mockReturnValue(true);
            (fsMock.readFileSync as jest.Mock).mockReturnValue('//MYJOB   JOB (ACCT)\n//STEP01  EXEC PGM=IEFBR14\n');

            const request = { prompt: 'soumets /tmp/myjob.jcl', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(result.metadata.intentType).toBe('SUBMIT_LOCAL_FILE');
            expect(SubmitJobs.submitJcl).toHaveBeenCalled();
        });

        it('should show error when local file not found', async () => {
            mockClassify.mockResolvedValue({ type: 'SUBMIT_LOCAL_FILE', localPath: '/tmp/notfound.jcl' });
            (fsMock.existsSync as jest.Mock).mockReturnValue(false);

            const request = { prompt: 'soumets /tmp/notfound.jcl', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('introuvable');
            expect(SubmitJobs.submitJcl).not.toHaveBeenCalled();
        });

        it('should show error when file contains invalid JCL', async () => {
            mockClassify.mockResolvedValue({ type: 'SUBMIT_LOCAL_FILE', localPath: '/tmp/bad.jcl' });
            (fsMock.existsSync as jest.Mock).mockReturnValue(true);
            (fsMock.readFileSync as jest.Mock).mockReturnValue('INVALID CONTENT WITHOUT JOB CARD');

            const request = { prompt: 'soumets /tmp/bad.jcl', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('JCL');
            expect(SubmitJobs.submitJcl).not.toHaveBeenCalled();
        });

        it('should truncate preview for files with more than 10 lines', async () => {
            const longJcl = Array.from({ length: 15 }, (_, i) =>
                i === 0 ? '//MYJOB   JOB (ACCT),\'DESC\',CLASS=A' :
                i === 1 ? '//STEP01  EXEC PGM=IEFBR14' : `// STEP${i}`
            ).join('\n');
            mockClassify.mockResolvedValue({ type: 'SUBMIT_LOCAL_FILE', localPath: '/tmp/long.jcl' });
            (fsMock.existsSync as jest.Mock).mockReturnValue(true);
            (fsMock.readFileSync as jest.Mock).mockReturnValue(longJcl);

            const request = { prompt: 'soumets /tmp/long.jcl', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('lignes au total');
        });

        it('should resolve relative path using workspace root', async () => {
            mockClassify.mockResolvedValue({ type: 'SUBMIT_LOCAL_FILE', localPath: 'relative/path.jcl' });
            (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
            (fsMock.existsSync as jest.Mock).mockReturnValue(true);
            (fsMock.readFileSync as jest.Mock).mockReturnValue('//MYJOB   JOB (ACCT)\n//STEP01  EXEC PGM=IEFBR14\n');

            const request = { prompt: 'soumets relative/path.jcl', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            const pathArg = (fsMock.existsSync as jest.Mock).mock.calls.at(-1)[0];
            expect(pathArg).toContain('workspace');
        });
    });

    // ── SUBMIT_LOCAL_FILE_AND_MONITOR ─────────────────────────

    describe('SUBMIT_LOCAL_FILE_AND_MONITOR', () => {
        let fsMock: any;

        beforeEach(() => {
            fsMock = require('fs');
            (SubmitJobs.submitJcl as jest.Mock).mockResolvedValue(MOCK_SUBMITTED_JOB);
        });

        it('should submit and monitor a local file', async () => {
            mockClassify.mockResolvedValue({
                type: 'SUBMIT_LOCAL_FILE_AND_MONITOR',
                localPath: '/tmp/myjob.jcl',
                autoDisplay: false,
            });
            (fsMock.existsSync as jest.Mock).mockReturnValue(true);
            (fsMock.readFileSync as jest.Mock).mockReturnValue('//MYJOB   JOB (ACCT)\n//STEP01  EXEC PGM=IEFBR14\n');

            const request = { prompt: 'soumets et surveille /tmp/myjob.jcl', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(result.metadata.intentType).toBe('SUBMIT_LOCAL_FILE_AND_MONITOR');
        });

        it('should show error when file not found for monitor', async () => {
            mockClassify.mockResolvedValue({
                type: 'SUBMIT_LOCAL_FILE_AND_MONITOR',
                localPath: '/tmp/notfound.jcl',
            });
            (fsMock.existsSync as jest.Mock).mockReturnValue(false);

            const request = { prompt: 'soumets et surveille /tmp/notfound.jcl', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            expect(SubmitJobs.submitJcl).not.toHaveBeenCalled();
        });
    });

    // ── monitorSubmittedJob — loop scenarios ──────────────────

    describe('monitorSubmittedJob — loop', () => {
        it('should show timeout message after MAX_WAIT_MS elapsed', async () => {
            mockClassify.mockResolvedValue({
                type: 'SUBMIT_AND_MONITOR', dataset: 'HLQ.JCL', member: 'BATCH',
            });
            (SubmitJobs.submitJob as jest.Mock).mockResolvedValue(MOCK_SUBMITTED_JOB);

            const activeToken = { isCancellationRequested: false, onCancellationRequested: jest.fn() };

            let nowCallCount = 0;
            jest.spyOn(Date, 'now').mockImplementation(() => {
                nowCallCount++;
                return nowCallCount === 1 ? 0 : 11 * 60 * 1000;
            });

            const request = { prompt: 'soumets et surveille HLQ.JCL(BATCH)', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, activeToken as any);

            jest.spyOn(Date, 'now').mockRestore();

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('Timeout');
        });

        it('should complete monitoring when job reaches OUTPUT', async () => {
            jest.useFakeTimers();

            mockClassify.mockResolvedValue({
                type: 'SUBMIT_AND_MONITOR', dataset: 'HLQ.JCL', member: 'BATCH', autoDisplay: false,
            });
            (SubmitJobs.submitJob as jest.Mock).mockResolvedValue(MOCK_SUBMITTED_JOB);
            const completedJob = { ...MOCK_SUBMITTED_JOB, status: 'OUTPUT', retcode: 'CC 0000' };
            (GetJobs.getJob as jest.Mock).mockResolvedValue(completedJob);
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([]);

            const activeToken = { isCancellationRequested: false, onCancellationRequested: jest.fn() };
            const request = { prompt: 'soumets et surveille HLQ.JCL(BATCH)', model: {} } as any;
            const promise = handler.handle(request, {} as any, mockStream as any, activeToken as any);

            await jest.runAllTimersAsync();
            const result = await promise;

            jest.useRealTimers();

            expect(result.metadata.intentType).toBe('SUBMIT_AND_MONITOR');
            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('terminé');
        });

        it('should continue monitoring after a poll error', async () => {
            jest.useFakeTimers();

            mockClassify.mockResolvedValue({
                type: 'SUBMIT_AND_MONITOR', dataset: 'HLQ.JCL', member: 'BATCH', autoDisplay: false,
            });
            (SubmitJobs.submitJob as jest.Mock).mockResolvedValue(MOCK_SUBMITTED_JOB);

            let pollCount = 0;
            (GetJobs.getJob as jest.Mock).mockImplementation(() => {
                pollCount++;
                if (pollCount === 1) { return Promise.reject(new Error('Network error')); }
                return Promise.resolve({ ...MOCK_SUBMITTED_JOB, status: 'OUTPUT', retcode: 'CC 0000' });
            });
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([]);

            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            const activeToken = { isCancellationRequested: false, onCancellationRequested: jest.fn() };
            const request = { prompt: 'soumets et surveille HLQ.JCL(BATCH)', model: {} } as any;
            const promise = handler.handle(request, {} as any, mockStream as any, activeToken as any);

            await jest.runAllTimersAsync();
            const result = await promise;

            warnSpy.mockRestore();
            jest.useRealTimers();

            // After poll error on first attempt, the second poll should succeed and complete monitoring
            expect(result.metadata.intentType).toBe('SUBMIT_AND_MONITOR');
            expect(pollCount).toBeGreaterThan(1);
        });

        it('should show error hint when autoDisplay=false and job fails', async () => {
            jest.useFakeTimers();

            mockClassify.mockResolvedValue({
                type: 'SUBMIT_AND_MONITOR', dataset: 'HLQ.JCL', member: 'BATCH', autoDisplay: false,
            });
            (SubmitJobs.submitJob as jest.Mock).mockResolvedValue(MOCK_SUBMITTED_JOB);
            (GetJobs.getJob as jest.Mock).mockResolvedValue({
                ...MOCK_SUBMITTED_JOB, status: 'OUTPUT', retcode: 'CC 0008',
            });

            const activeToken = { isCancellationRequested: false, onCancellationRequested: jest.fn() };
            const request = { prompt: 'soumets et surveille HLQ.JCL(BATCH)', model: {} } as any;
            const promise = handler.handle(request, {} as any, mockStream as any, activeToken as any);

            await jest.runAllTimersAsync();
            await promise;
            jest.useRealTimers();

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('erreur');
        });

        it('should display spool when autoDisplay=true and job succeeds', async () => {
            jest.useFakeTimers();

            mockClassify.mockResolvedValue({
                type: 'SUBMIT_AND_MONITOR', dataset: 'HLQ.JCL', member: 'BATCH', autoDisplay: true,
            });
            (SubmitJobs.submitJob as jest.Mock).mockResolvedValue(MOCK_SUBMITTED_JOB);
            (GetJobs.getJob as jest.Mock).mockResolvedValue({
                ...MOCK_SUBMITTED_JOB, status: 'OUTPUT', retcode: 'CC 0000',
            });
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'SYSPRINT', stepname: 'STEP01', id: 1 },
            ]);
            (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue('JOB OUTPUT\n');

            const activeToken = { isCancellationRequested: false, onCancellationRequested: jest.fn() };
            const request = { prompt: 'soumets et surveille HLQ.JCL(BATCH)', model: {} } as any;
            const promise = handler.handle(request, {} as any, mockStream as any, activeToken as any);

            await jest.runAllTimersAsync();
            await promise;
            jest.useRealTimers();

            expect(GetJobs.getSpoolFilesForJob).toHaveBeenCalled();
        });

        it('should return followup suggestions after job completes', async () => {
            jest.useFakeTimers();

            mockClassify.mockResolvedValue({
                type: 'SUBMIT_AND_MONITOR', dataset: 'HLQ.JCL', member: 'BATCH', autoDisplay: false,
            });
            (SubmitJobs.submitJob as jest.Mock).mockResolvedValue(MOCK_SUBMITTED_JOB);
            (GetJobs.getJob as jest.Mock).mockResolvedValue({
                ...MOCK_SUBMITTED_JOB, status: 'OUTPUT', retcode: 'CC 0000',
            });

            const activeToken = { isCancellationRequested: false, onCancellationRequested: jest.fn() };
            const request = { prompt: 'soumets et surveille HLQ.JCL(BATCH)', model: {} } as any;
            const promise = handler.handle(request, {} as any, mockStream as any, activeToken as any);

            await jest.runAllTimersAsync();
            const result = await promise;
            jest.useRealTimers();

            expect(result.metadata.followups.length).toBeGreaterThan(0);
        });
    });

    // ── SUBMIT_INLINE — truncation ────────────────────────────

    describe('SUBMIT_INLINE — truncation', () => {
        it('should truncate JCL preview when more than 10 lines', async () => {
            const longJcl = Array.from({ length: 15 }, (_, i) =>
                i === 0 ? '//MYJOB   JOB (ACCT),\'DESC\',CLASS=A' :
                i === 1 ? '//STEP01  EXEC PGM=IEFBR14' : `// LINE${i}`
            ).join('\n');
            mockClassify.mockResolvedValue({ type: 'SUBMIT_INLINE', jcl: longJcl });
            (SubmitJobs.submitJcl as jest.Mock).mockResolvedValue(MOCK_SUBMITTED_JOB);

            const request = { prompt: 'soumets ce JCL', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, mockToken as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('lignes');
        });
    });
});
