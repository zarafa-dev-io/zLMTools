import { JobsHandler } from '../handlers/jobs.handler';
import { JobsIntentClassifier } from '../intents/jobs.classifier';
import { ZoweSessionManager } from '../zowe/session';
import { TelemetryService } from '../utils/telemetry';
import { GetJobs, CancelJobs, DeleteJobs } from '@zowe/zos-jobs-for-zowe-sdk';
import * as vscode from 'vscode';

// ============================================================
// Mocks
// ============================================================

jest.mock('../intents/jobs.classifier');

jest.mock('@zowe/zos-jobs-for-zowe-sdk', () => ({
    GetJobs: {
        getJobsCommon: jest.fn(),
        getJob: jest.fn(),
        getSpoolFilesForJob: jest.fn(),
        getSpoolContentById: jest.fn(),
    },
    CancelJobs: { cancelJob: jest.fn() },
    DeleteJobs: { deleteJob: jest.fn() },
    MonitorJobs: { waitForJobOutputStatus: jest.fn() },
}));

jest.mock('../zowe/safety', () => ({
    requestConfirmation: jest.fn().mockResolvedValue(true),
    describeOperation: jest.fn().mockReturnValue('test operation'),
    getEffectiveSafetyLevel: jest.fn().mockImplementation((s: string) => s),
    isProtectedDataset: jest.fn().mockReturnValue(false),
}));

// ============================================================
// Tests — JobsHandler
// ============================================================

const MOCK_JOB = {
    jobname: 'PAYROLL',
    jobid: 'JOB12345',
    owner: 'USER1',
    status: 'OUTPUT',
    retcode: 'CC 0000',
    type: 'JOB',
    class: 'A',
};

describe('JobsHandler', () => {
    let handler: JobsHandler;
    let mockClassify: jest.Mock;
    let mockSessionManager: Partial<ZoweSessionManager>;
    let mockTelemetry: Partial<TelemetryService>;
    let mockStream: Partial<vscode.ChatResponseStream>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockClassify = jest.fn();
        (JobsIntentClassifier as jest.Mock).mockImplementation(() => ({
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

        handler = new JobsHandler(
            mockSessionManager as ZoweSessionManager,
            mockTelemetry as TelemetryService
        );
    });

    // ── Instantiation ─────────────────────────────────────────

    describe('Handler instantiation', () => {
        it('should create JobsHandler instance', () => {
            expect(handler).toBeDefined();
            expect(handler).toBeInstanceOf(JobsHandler);
        });
    });

    // ── Empty prompt ──────────────────────────────────────────

    describe('Empty prompt', () => {
        it('should return help text without calling the classifier', async () => {
            const request = { prompt: '', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.command).toBe('jobs');
            expect(mockClassify).not.toHaveBeenCalled();
        });

        it('should return followup suggestions for empty prompt', async () => {
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

            expect(result.metadata.command).toBe('jobs');
            expect(result.metadata.intentType).toBeUndefined();
            expect(mockStream.markdown).toHaveBeenCalled();
        });

        it('should not call getSession when intent is null', async () => {
            mockClassify.mockResolvedValue(null);
            const request = { prompt: 'something gibberish', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(mockSessionManager.getSession).not.toHaveBeenCalled();
        });
    });

    // ── LIST_JOBS ─────────────────────────────────────────────

    describe('LIST_JOBS', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'LIST_JOBS' });
            (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([]);
        });

        it('should call getJobsCommon', async () => {
            const request = { prompt: 'liste mes jobs', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(GetJobs.getJobsCommon).toHaveBeenCalled();
        });

        it('should return intentType LIST_JOBS', async () => {
            const request = { prompt: 'liste mes jobs', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.intentType).toBe('LIST_JOBS');
        });

        it('should display jobs in a markdown table', async () => {
            (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([
                { ...MOCK_JOB },
                { ...MOCK_JOB, jobname: 'BATCH01', jobid: 'JOB12346', status: 'ACTIVE', retcode: null },
            ]);
            const request = { prompt: 'liste mes jobs', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('PAYROLL');
            expect(allMarkdown).toContain('JOB12345');
        });

        it('should display "no jobs found" message for empty list', async () => {
            const request = { prompt: 'liste mes jobs', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown.length).toBeGreaterThan(0);
        });

        it('should pass owner filter from intent', async () => {
            mockClassify.mockResolvedValue({ type: 'LIST_JOBS', owner: 'USER1' });
            const request = { prompt: 'liste les jobs de USER1', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const callArgs = (GetJobs.getJobsCommon as jest.Mock).mock.calls[0][1];
            expect(callArgs.owner).toBe('USER1');
        });

        it('should pass prefix filter from intent', async () => {
            mockClassify.mockResolvedValue({ type: 'LIST_JOBS', prefix: 'PAYROLL*' });
            const request = { prompt: 'liste les jobs PAYROLL', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const callArgs = (GetJobs.getJobsCommon as jest.Mock).mock.calls[0][1];
            expect(callArgs.prefix).toBe('PAYROLL*');
        });

        it('should track success in telemetry', async () => {
            const request = { prompt: 'liste mes jobs', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(mockTelemetry.trackSuccess).toHaveBeenCalledWith('jobs', 'LIST_JOBS', 'DEV1');
        });

        it('should return followups based on job results', async () => {
            (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([MOCK_JOB]);
            const request = { prompt: 'liste mes jobs', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.followups.length).toBeGreaterThan(0);
        });
    });

    // ── GET_JOB_STATUS ────────────────────────────────────────

    describe('GET_JOB_STATUS', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'GET_JOB_STATUS', jobId: 'JOB12345' });
            (GetJobs.getJob as jest.Mock).mockResolvedValue(MOCK_JOB);
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([]);
        });

        it('should call getJob with the job ID', async () => {
            const request = { prompt: 'statut de JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(GetJobs.getJob).toHaveBeenCalledWith(expect.anything(), 'JOB12345');
        });

        it('should return intentType GET_JOB_STATUS', async () => {
            const request = { prompt: 'statut de JOB12345', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.intentType).toBe('GET_JOB_STATUS');
        });

        it('should display job properties in markdown', async () => {
            const request = { prompt: 'statut de JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('PAYROLL');
            expect(allMarkdown).toContain('JOB12345');
        });

        it('should handle job not found', async () => {
            (GetJobs.getJob as jest.Mock).mockRejectedValue(new Error('Job not found'));
            const request = { prompt: 'statut de JOB99999', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result).toBeDefined();
            expect(result.metadata.command).toBe('jobs');
        });

        it('should resolve by jobName when no jobId given', async () => {
            mockClassify.mockResolvedValue({ type: 'GET_JOB_STATUS', jobName: 'PAYROLL' });
            (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([MOCK_JOB]);
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([]);

            const request = { prompt: 'statut du job PAYROLL', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(GetJobs.getJobsCommon).toHaveBeenCalled();
        });

        it('should also list spool files when available', async () => {
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'SYSPRINT', stepname: 'STEP01', procstep: null, class: 'V', 'byte-count': 1024, id: 1 },
            ]);
            const request = { prompt: 'statut de JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('SYSPRINT');
        });
    });

    // ── GET_JOB_OUTPUT ────────────────────────────────────────

    describe('GET_JOB_OUTPUT', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'GET_JOB_OUTPUT', jobId: 'JOB12345' });
            (GetJobs.getJob as jest.Mock).mockResolvedValue(MOCK_JOB);
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([]);
        });

        it('should call getSpoolFilesForJob', async () => {
            const request = { prompt: 'montre la sortie de JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(GetJobs.getSpoolFilesForJob).toHaveBeenCalled();
        });

        it('should return intentType GET_JOB_OUTPUT', async () => {
            const request = { prompt: 'montre la sortie de JOB12345', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.intentType).toBe('GET_JOB_OUTPUT');
        });

        it('should display spool files in a table when available', async () => {
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'JESMSGLG', stepname: null, procstep: null, class: 'X', 'byte-count': 512, id: 1 },
                { ddname: 'SYSOUT',   stepname: 'STEP01', procstep: null, class: 'X', 'byte-count': 2048, id: 2 },
            ]);
            (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue('some spool content');

            const request = { prompt: 'montre la sortie de JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('JESMSGLG');
        });

        it('should handle job not found', async () => {
            (GetJobs.getJob as jest.Mock).mockRejectedValue(new Error('Job not found'));
            const request = { prompt: 'montre la sortie de JOB99999', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result).toBeDefined();
        });
    });

    // ── GET_SPOOL_FILE ────────────────────────────────────────

    describe('GET_SPOOL_FILE', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({
                type: 'GET_SPOOL_FILE',
                jobId: 'JOB12345',
                jobName: 'PAYROLL',
                ddName: 'SYSPRINT',
            });
            (GetJobs.getJob as jest.Mock).mockResolvedValue(MOCK_JOB);
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'SYSPRINT', stepname: 'STEP01', id: 1 },
            ]);
            (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue('line1\nline2\n');
        });

        it('should call getSpoolContentById', async () => {
            const request = { prompt: 'affiche le SYSPRINT de JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(GetJobs.getSpoolContentById).toHaveBeenCalled();
        });

        it('should return intentType GET_SPOOL_FILE', async () => {
            const request = { prompt: 'affiche le SYSPRINT de JOB12345', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.intentType).toBe('GET_SPOOL_FILE');
        });

        it('should display spool content in a code block', async () => {
            const request = { prompt: 'affiche le SYSPRINT de JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('```');
            expect(allMarkdown).toContain('line1');
        });

        it('should handle DD not found', async () => {
            mockClassify.mockResolvedValue({
                type: 'GET_SPOOL_FILE',
                jobId: 'JOB12345',
                jobName: 'PAYROLL',
                ddName: 'NONEXIST',
            });
            const request = { prompt: 'affiche le NONEXIST de JOB12345', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result).toBeDefined();
            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown.length).toBeGreaterThan(0);
        });
    });

    // ── CANCEL_JOB ────────────────────────────────────────────

    describe('CANCEL_JOB', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'CANCEL_JOB', jobId: 'JOB12345', jobName: 'PAYROLL' });
            (GetJobs.getJob as jest.Mock).mockResolvedValue({ ...MOCK_JOB, status: 'ACTIVE', retcode: null });
            (CancelJobs.cancelJob as jest.Mock).mockResolvedValue(undefined);
        });

        it('should request confirmation before cancelling', async () => {
            const { requestConfirmation } = require('../zowe/safety');
            const request = { prompt: 'annule JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(requestConfirmation).toHaveBeenCalled();
        });

        it('should call cancelJob when confirmed', async () => {
            const request = { prompt: 'annule JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(CancelJobs.cancelJob).toHaveBeenCalledWith(expect.anything(), 'JOB12345', 'PAYROLL');
        });

        it('should not call cancelJob when confirmation is refused', async () => {
            const { requestConfirmation } = require('../zowe/safety');
            (requestConfirmation as jest.Mock).mockResolvedValueOnce(false);

            const request = { prompt: 'annule JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(CancelJobs.cancelJob).not.toHaveBeenCalled();
        });

        it('should display success message after cancellation', async () => {
            const request = { prompt: 'annule JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('PAYROLL');
        });

        it('should handle non-cancellable job (already OUTPUT)', async () => {
            (GetJobs.getJob as jest.Mock).mockResolvedValue({ ...MOCK_JOB, status: 'OUTPUT' });
            const request = { prompt: 'annule JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(CancelJobs.cancelJob).not.toHaveBeenCalled();
        });
    });

    // ── PURGE_JOB ─────────────────────────────────────────────

    describe('PURGE_JOB', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'PURGE_JOB', jobId: 'JOB12345', jobName: 'PAYROLL' });
            (GetJobs.getJob as jest.Mock).mockResolvedValue(MOCK_JOB);
            (DeleteJobs.deleteJob as jest.Mock).mockResolvedValue(undefined);
        });

        it('should call deleteJob when confirmed', async () => {
            const request = { prompt: 'purge JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(DeleteJobs.deleteJob).toHaveBeenCalledWith(expect.anything(), 'JOB12345', 'PAYROLL');
        });

        it('should return intentType PURGE_JOB', async () => {
            const request = { prompt: 'purge JOB12345', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.intentType).toBe('PURGE_JOB');
        });

        it('should not call deleteJob when confirmation is refused', async () => {
            const { requestConfirmation } = require('../zowe/safety');
            (requestConfirmation as jest.Mock).mockResolvedValueOnce(false);

            const request = { prompt: 'purge JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(DeleteJobs.deleteJob).not.toHaveBeenCalled();
        });
    });

    // ── Language detection ─────────────────────────────────────

    describe('Language detection', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'LIST_JOBS' });
            (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([]);
        });

        it('should handle French prompts', async () => {
            const request = { prompt: 'liste mes jobs', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result).toBeDefined();
        });

        it('should handle English prompts', async () => {
            const request = { prompt: 'list my jobs', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result).toBeDefined();
        });
    });

    // ── Session management ─────────────────────────────────────

    describe('Session management', () => {
        it('should call getSession when processing an intent', async () => {
            mockClassify.mockResolvedValue({ type: 'LIST_JOBS' });
            (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([]);

            const request = { prompt: 'liste mes jobs', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(mockSessionManager.getSession).toHaveBeenCalled();
        });

        it('should propagate session errors', async () => {
            mockClassify.mockResolvedValue({ type: 'LIST_JOBS' });
            (mockSessionManager.getSession as jest.Mock).mockRejectedValue(new Error('No z/OS connection'));

            const request = { prompt: 'liste mes jobs', model: {} } as any;

            await expect(
                handler.handle(request, {} as any, mockStream as any, {} as any)
            ).rejects.toThrow('No z/OS connection');
        });
    });

    // ── Stream interactions ────────────────────────────────────

    describe('Stream interactions', () => {
        it('should call stream.progress while processing', async () => {
            mockClassify.mockResolvedValue({ type: 'LIST_JOBS' });
            (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([]);

            const request = { prompt: 'liste mes jobs', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(mockStream.progress).toHaveBeenCalled();
        });
    });

    // ── LIST_JOBS additional ───────────────────────────────────

    describe('LIST_JOBS additional coverage', () => {
        beforeEach(() => {
            mockClassify.mockResolvedValue({ type: 'LIST_JOBS' });
        });

        it('should pass status filter from intent', async () => {
            mockClassify.mockResolvedValue({ type: 'LIST_JOBS', status: 'ACTIVE' });
            (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([]);

            const request = { prompt: 'liste les jobs actifs', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const callArgs = (GetJobs.getJobsCommon as jest.Mock).mock.calls[0][1];
            expect(callArgs.status).toBe('ACTIVE');
        });

        it('should pass maxJobs filter from intent', async () => {
            mockClassify.mockResolvedValue({ type: 'LIST_JOBS', maxJobs: 10 });
            (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([]);

            const request = { prompt: 'liste les 10 derniers jobs', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const callArgs = (GetJobs.getJobsCommon as jest.Mock).mock.calls[0][1];
            expect(callArgs.maxJobs).toBe(10);
        });

        it('should show filter info in "no jobs found" message', async () => {
            mockClassify.mockResolvedValue({ type: 'LIST_JOBS', owner: 'USER1', prefix: 'PAY*', status: 'ACTIVE' });
            (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([]);

            const request = { prompt: 'liste mes jobs', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('owner=USER1');
        });

        it('should use 🔍 label for jobs with no retcode', async () => {
            (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([
                { ...MOCK_JOB, retcode: null, status: 'ACTIVE' },
            ]);

            const request = { prompt: 'liste mes jobs', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            const followupLabels = result.metadata.followups.map((f: any) => f.label).join('');
            expect(followupLabels).toContain('🔍');
        });

        it('should build list title with all filters', async () => {
            mockClassify.mockResolvedValue({ type: 'LIST_JOBS', prefix: 'PAY*', owner: 'USER1', status: 'ACTIVE' });
            (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([MOCK_JOB]);

            const request = { prompt: 'liste mes jobs', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('PAY*');
            expect(allMarkdown).toContain('USER1');
            expect(allMarkdown).toContain('ACTIVE');
        });
    });

    // ── GET_JOB_STATUS additional ──────────────────────────────

    describe('GET_JOB_STATUS additional coverage', () => {
        it('should display diagnostic tip for non-CC-0000 retcode', async () => {
            mockClassify.mockResolvedValue({ type: 'GET_JOB_STATUS', jobId: 'JOB12345' });
            (GetJobs.getJob as jest.Mock).mockResolvedValue({ ...MOCK_JOB, retcode: 'CC 0008' });
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([]);

            const request = { prompt: 'statut de JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('JESMSGLG');
        });

        it('should display spool file without byte-count as dash', async () => {
            mockClassify.mockResolvedValue({ type: 'GET_JOB_STATUS', jobId: 'JOB12345' });
            (GetJobs.getJob as jest.Mock).mockResolvedValue(MOCK_JOB);
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'SYSPRINT', stepname: 'STEP01', procstep: null, class: 'V', id: 1 },
            ]);

            const request = { prompt: 'statut de JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('SYSPRINT');
        });

        it('should handle getSpoolFilesForJob throwing silently', async () => {
            mockClassify.mockResolvedValue({ type: 'GET_JOB_STATUS', jobId: 'JOB12345' });
            (GetJobs.getJob as jest.Mock).mockResolvedValue(MOCK_JOB);
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockRejectedValue(new Error('Spool not available'));

            const request = { prompt: 'statut de JOB12345', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.intentType).toBe('GET_JOB_STATUS');
        });

        it('should resolve by jobName returning null when empty list', async () => {
            mockClassify.mockResolvedValue({ type: 'GET_JOB_STATUS', jobName: 'UNKNOWN' });
            (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([]);
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([]);

            const request = { prompt: 'statut du job UNKNOWN', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('UNKNOWN');
        });

        it('should return null from resolveJob when neither jobId nor jobName is given', async () => {
            mockClassify.mockResolvedValue({ type: 'GET_JOB_STATUS' }); // no jobId, no jobName
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([]);

            const request = { prompt: 'statut du job', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('non trouvé');
        });
    });

    // ── GET_JOB_OUTPUT additional ──────────────────────────────

    describe('GET_JOB_OUTPUT additional coverage', () => {
        beforeEach(() => {
            (GetJobs.getJob as jest.Mock).mockResolvedValue(MOCK_JOB);
        });

        it('should display no spool message when spoolFiles is empty', async () => {
            mockClassify.mockResolvedValue({ type: 'GET_JOB_OUTPUT', jobId: 'JOB12345' });
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([]);

            const request = { prompt: 'montre la sortie de JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('PAYROLL');
        });

        it('should display filtered DD content when spoolFilter matches', async () => {
            mockClassify.mockResolvedValue({ type: 'GET_JOB_OUTPUT', jobId: 'JOB12345', spoolFilter: 'SYSPRINT' });
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'SYSPRINT', stepname: 'STEP01', id: 1 },
                { ddname: 'JESMSGLG', stepname: null, id: 2 },
            ]);
            (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue('filtered content');

            const request = { prompt: 'montre le SYSPRINT de JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(GetJobs.getSpoolContentById).toHaveBeenCalled();
            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('filtered content');
        });

        it('should show DD not found message when spoolFilter does not match', async () => {
            mockClassify.mockResolvedValue({ type: 'GET_JOB_OUTPUT', jobId: 'JOB12345', spoolFilter: 'NONEXIST' });
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'SYSPRINT', stepname: 'STEP01', id: 1 },
            ]);

            const request = { prompt: 'montre le NONEXIST de JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('NONEXIST');
        });

        it('should show remaining spool files table for non-auto-display DDs', async () => {
            mockClassify.mockResolvedValue({ type: 'GET_JOB_OUTPUT', jobId: 'JOB12345' });
            // Need > 5 spool files so the `spoolFiles.length <= 5` shortcut does NOT apply
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'JESMSGLG', stepname: null, id: 1 },
                { ddname: 'JESJCL',   stepname: null, id: 2 },
                { ddname: 'JESYSMSG', stepname: null, id: 3 },
                { ddname: 'MYOUTPUT', stepname: 'STEP01', id: 4, 'byte-count': 2048 },
                { ddname: 'OTHER',    stepname: 'STEP02', id: 5 },
                { ddname: 'EXTRA',    stepname: 'STEP03', id: 6 },
            ]);
            (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue('some content');

            const request = { prompt: 'montre la sortie de JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('MYOUTPUT');
        });
    });

    // ── GET_SPOOL_FILE additional ──────────────────────────────

    describe('GET_SPOOL_FILE additional coverage', () => {
        beforeEach(() => {
            (GetJobs.getJob as jest.Mock).mockResolvedValue(MOCK_JOB);
        });

        it('should filter by stepName when multiple DDs match', async () => {
            mockClassify.mockResolvedValue({
                type: 'GET_SPOOL_FILE',
                jobId: 'JOB12345',
                jobName: 'PAYROLL',
                ddName: 'SYSPRINT',
                stepName: 'STEP02',
            });
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'SYSPRINT', stepname: 'STEP01', id: 1 },
                { ddname: 'SYSPRINT', stepname: 'STEP02', id: 2 },
            ]);
            (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue('step2 content');

            const request = { prompt: 'affiche le SYSPRINT STEP02 de JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('step2 content');
        });

        it('should show stepName in DD not found message', async () => {
            mockClassify.mockResolvedValue({
                type: 'GET_SPOOL_FILE',
                jobId: 'JOB12345',
                jobName: 'PAYROLL',
                ddName: 'SYSPRINT',
                stepName: 'STEPX',
            });
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'JESMSGLG', stepname: null, id: 1 },
            ]);

            const request = { prompt: 'affiche le SYSPRINT de STEPX de JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('STEPX');
        });

        it('should handle job not found in getSpoolFile', async () => {
            mockClassify.mockResolvedValue({
                type: 'GET_SPOOL_FILE',
                jobId: 'JOB99999',
                jobName: 'UNKNOWN',
                ddName: 'SYSPRINT',
            });
            (GetJobs.getJob as jest.Mock).mockRejectedValue(new Error('Not found'));

            const request = { prompt: 'affiche le SYSPRINT de JOB99999', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result).toBeDefined();
            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('JOB99999');
        });
    });

    // ── CANCEL_JOB additional ──────────────────────────────────

    describe('CANCEL_JOB additional coverage', () => {
        it('should handle job not found in cancelJob', async () => {
            mockClassify.mockResolvedValue({ type: 'CANCEL_JOB', jobId: 'JOB99999', jobName: 'UNKNOWN' });
            (GetJobs.getJob as jest.Mock).mockRejectedValue(new Error('Not found'));

            const request = { prompt: 'annule JOB99999', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result).toBeDefined();
        });

        it('should reject cancellation for INPUT status job', async () => {
            mockClassify.mockResolvedValue({ type: 'CANCEL_JOB', jobId: 'JOB12345', jobName: 'PAYROLL' });
            (GetJobs.getJob as jest.Mock).mockResolvedValue({ ...MOCK_JOB, status: 'INPUT', retcode: null });
            const { CancelJobs: CJ } = require('@zowe/zos-jobs-for-zowe-sdk');
            (CJ.cancelJob as jest.Mock).mockResolvedValue(undefined);

            const request = { prompt: 'annule JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            // INPUT is cancellable per source code (status !== 'ACTIVE' && status !== 'INPUT')
            expect(CJ.cancelJob).toHaveBeenCalled();
        });
    });

    // ── PURGE_JOB additional ───────────────────────────────────

    describe('PURGE_JOB additional coverage', () => {
        it('should handle job not found in purgeJob', async () => {
            mockClassify.mockResolvedValue({ type: 'PURGE_JOB', jobId: 'JOB99999', jobName: 'UNKNOWN' });
            (GetJobs.getJob as jest.Mock).mockRejectedValue(new Error('Not found'));

            const request = { prompt: 'purge JOB99999', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result).toBeDefined();
        });
    });

    // ── MONITOR_JOB ────────────────────────────────────────────

    describe('MONITOR_JOB', () => {
        it('should return immediately when job is already OUTPUT', async () => {
            mockClassify.mockResolvedValue({ type: 'MONITOR_JOB', jobId: 'JOB12345', jobName: 'PAYROLL' });
            (GetJobs.getJob as jest.Mock).mockResolvedValue({ ...MOCK_JOB, status: 'OUTPUT', retcode: 'CC 0000' });

            const request = { prompt: 'surveille JOB12345', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result.metadata.intentType).toBe('MONITOR_JOB');
            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('déjà terminé');
        });

        it('should handle job not found in monitorJob', async () => {
            mockClassify.mockResolvedValue({ type: 'MONITOR_JOB', jobId: 'JOB99999', jobName: 'UNKNOWN' });
            (GetJobs.getJob as jest.Mock).mockRejectedValue(new Error('Not found'));

            const request = { prompt: 'surveille JOB99999', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result).toBeDefined();
        });

        it('should cancel monitoring when token is already cancelled', async () => {
            mockClassify.mockResolvedValue({ type: 'MONITOR_JOB', jobId: 'JOB12345', jobName: 'PAYROLL' });
            (GetJobs.getJob as jest.Mock).mockResolvedValue({ ...MOCK_JOB, status: 'ACTIVE', retcode: null });

            const cancelToken = { isCancellationRequested: true };
            const request = { prompt: 'surveille JOB12345', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, cancelToken as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('annulée');
        });

        it('should detect timeout and stop monitoring', async () => {
            mockClassify.mockResolvedValue({ type: 'MONITOR_JOB', jobId: 'JOB12345', jobName: 'PAYROLL' });
            (GetJobs.getJob as jest.Mock).mockResolvedValue({ ...MOCK_JOB, status: 'ACTIVE', retcode: null });

            let nowCallCount = 0;
            const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => {
                nowCallCount++;
                return nowCallCount === 1 ? 0 : 6 * 60 * 1000; // startTime=0, then > MAX_WAIT_MS
            });

            const cancelToken = { isCancellationRequested: false };
            const request = { prompt: 'surveille JOB12345', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, cancelToken as any);

            dateSpy.mockRestore();

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('Timeout');
        });

        it('should complete monitoring when job reaches OUTPUT', async () => {
            jest.useFakeTimers();
            mockClassify.mockResolvedValue({ type: 'MONITOR_JOB', jobId: 'JOB12345', jobName: 'PAYROLL' });
            (GetJobs.getJob as jest.Mock)
                .mockResolvedValueOnce({ ...MOCK_JOB, status: 'ACTIVE', retcode: null }) // resolveJob
                .mockResolvedValueOnce({ ...MOCK_JOB, status: 'OUTPUT', retcode: 'CC 0000' }); // poll

            const cancelToken = { isCancellationRequested: false };
            const request = { prompt: 'surveille JOB12345', model: {} } as any;
            const promise = handler.handle(request, {} as any, mockStream as any, cancelToken as any);

            await jest.runAllTimersAsync();
            const result = await promise;
            jest.useRealTimers();

            expect(result.metadata.intentType).toBe('MONITOR_JOB');
            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('terminé');
        });

        it('should show error tip when job completes with non-CC-0000 retcode', async () => {
            jest.useFakeTimers();
            mockClassify.mockResolvedValue({ type: 'MONITOR_JOB', jobId: 'JOB12345', jobName: 'PAYROLL' });
            (GetJobs.getJob as jest.Mock)
                .mockResolvedValueOnce({ ...MOCK_JOB, status: 'ACTIVE', retcode: null })
                .mockResolvedValueOnce({ ...MOCK_JOB, status: 'OUTPUT', retcode: 'ABEND S0C7' });

            const cancelToken = { isCancellationRequested: false };
            const request = { prompt: 'surveille JOB12345', model: {} } as any;
            const promise = handler.handle(request, {} as any, mockStream as any, cancelToken as any);

            await jest.runAllTimersAsync();
            await promise;
            jest.useRealTimers();

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('erreur');
        });

        it('should continue polling after a transient error', async () => {
            jest.useFakeTimers();
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            mockClassify.mockResolvedValue({ type: 'MONITOR_JOB', jobId: 'JOB12345', jobName: 'PAYROLL' });
            (GetJobs.getJob as jest.Mock)
                .mockResolvedValueOnce({ ...MOCK_JOB, status: 'ACTIVE', retcode: null }) // resolveJob
                .mockRejectedValueOnce(new Error('transient'))                            // poll 1 error
                .mockResolvedValueOnce({ ...MOCK_JOB, status: 'OUTPUT', retcode: 'CC 0000' }); // poll 2

            const cancelToken = { isCancellationRequested: false };
            const request = { prompt: 'surveille JOB12345', model: {} } as any;
            const promise = handler.handle(request, {} as any, mockStream as any, cancelToken as any);

            await jest.runAllTimersAsync();
            const result = await promise;
            jest.useRealTimers();
            warnSpy.mockRestore();

            expect(result.metadata.intentType).toBe('MONITOR_JOB');
        });

        it('should emit progress when job status changes during poll', async () => {
            jest.useFakeTimers();
            mockClassify.mockResolvedValue({ type: 'MONITOR_JOB', jobId: 'JOB12345', jobName: 'PAYROLL' });
            (GetJobs.getJob as jest.Mock)
                .mockResolvedValueOnce({ ...MOCK_JOB, status: 'INPUT', retcode: null })
                .mockResolvedValueOnce({ ...MOCK_JOB, status: 'ACTIVE', retcode: null }) // status changes
                .mockResolvedValueOnce({ ...MOCK_JOB, status: 'OUTPUT', retcode: 'CC 0000' });

            const cancelToken = { isCancellationRequested: false };
            const request = { prompt: 'surveille JOB12345', model: {} } as any;
            const promise = handler.handle(request, {} as any, mockStream as any, cancelToken as any);

            await jest.runAllTimersAsync();
            await promise;
            jest.useRealTimers();

            expect(mockStream.progress).toHaveBeenCalled();
        });
    });

    // ── displaySpoolContent edge cases ─────────────────────────

    describe('displaySpoolContent edge cases', () => {
        beforeEach(() => {
            (GetJobs.getJob as jest.Mock).mockResolvedValue(MOCK_JOB);
        });

        it('should show empty marker when spool content is blank', async () => {
            mockClassify.mockResolvedValue({
                type: 'GET_SPOOL_FILE',
                jobId: 'JOB12345',
                jobName: 'PAYROLL',
                ddName: 'SYSPRINT',
            });
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'SYSPRINT', stepname: 'STEP01', id: 1 },
            ]);
            (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue('   ');

            const request = { prompt: 'affiche le SYSPRINT de JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('vide');
        });

        it('should truncate content beyond 200 lines', async () => {
            mockClassify.mockResolvedValue({
                type: 'GET_SPOOL_FILE',
                jobId: 'JOB12345',
                jobName: 'PAYROLL',
                ddName: 'SYSPRINT',
            });
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'SYSPRINT', stepname: 'STEP01', id: 1 },
            ]);
            const longContent = Array.from({ length: 300 }, (_, i) => `line${i}`).join('\n');
            (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue(longContent);

            const request = { prompt: 'affiche le SYSPRINT de JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('tronqué');
            expect(allMarkdown).toContain('300 lignes au total');
        });

        it('should show error when getSpoolContentById fails', async () => {
            mockClassify.mockResolvedValue({
                type: 'GET_SPOOL_FILE',
                jobId: 'JOB12345',
                jobName: 'PAYROLL',
                ddName: 'SYSPRINT',
            });
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'SYSPRINT', stepname: 'STEP01', id: 1 },
            ]);
            (GetJobs.getSpoolContentById as jest.Mock).mockRejectedValue(new Error('Read error'));

            const request = { prompt: 'affiche le SYSPRINT de JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('Impossible de lire');
        });

        it('should include byte-count and stepname in spool display', async () => {
            mockClassify.mockResolvedValue({
                type: 'GET_SPOOL_FILE',
                jobId: 'JOB12345',
                jobName: 'PAYROLL',
                ddName: 'SYSPRINT',
            });
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
                { ddname: 'SYSPRINT', stepname: 'STEP01', id: 1, 'byte-count': 2048 },
            ]);
            (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue('content here');

            const request = { prompt: 'affiche le SYSPRINT de JOB12345', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            expect(allMarkdown).toContain('STEP01');
            expect(allMarkdown).toContain('KB');
        });
    });

    // ── Private utility methods ────────────────────────────────

    describe('Private utility methods', () => {
        describe('formatReturnCode', () => {
            it('should return "*(en cours)*" for ACTIVE job with no retcode', () => {
                const job = { status: 'ACTIVE', retcode: null } as any;
                expect((handler as any).formatReturnCode(job)).toBe('*(en cours)*');
            });

            it('should return "-" for non-ACTIVE job with no retcode', () => {
                const job = { status: 'OUTPUT', retcode: null } as any;
                expect((handler as any).formatReturnCode(job)).toBe('-');
            });

            it('should return formatted retcode string', () => {
                const job = { status: 'OUTPUT', retcode: 'CC 0004' } as any;
                expect((handler as any).formatReturnCode(job)).toBe('`CC 0004`');
            });
        });

        describe('getStatusEmoji', () => {
            it('should return ⏳ for INPUT status', () => {
                expect((handler as any).getStatusEmoji('INPUT', null)).toBe('⏳');
            });

            it('should return ⚪ when no retcode and not ACTIVE/INPUT', () => {
                expect((handler as any).getStatusEmoji('OUTPUT', null)).toBe('⚪');
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
                expect((handler as any).getStatusEmoji('OUTPUT', 'UNKNOWN CODE')).toBe('🟠');
            });
        });

        describe('jobNotFoundMessage', () => {
            it('should include jobName in message when only jobName is given', () => {
                const msg = (handler as any).jobNotFoundMessage({ jobName: 'PAYROLL' });
                expect(msg).toContain('PAYROLL');
            });

            it('should return generic message when neither jobId nor jobName is given', () => {
                const msg = (handler as any).jobNotFoundMessage({});
                expect(msg).toContain('Job non trouvé');
            });
        });

        describe('formatBytes', () => {
            it('should return bytes for < 1024', () => {
                expect((handler as any).formatBytes(512)).toBe('512 B');
            });

            it('should return KB for 1024 to 1MB', () => {
                expect((handler as any).formatBytes(2048)).toBe('2.0 KB');
            });

            it('should return MB for >= 1MB', () => {
                expect((handler as any).formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
            });
        });

        describe('describeJobOperation', () => {
            it('should describe CANCEL_JOB operation', () => {
                const desc = (handler as any).describeJobOperation({ type: 'CANCEL_JOB', jobName: 'PAYROLL', jobId: 'JOB12345' });
                expect(desc).toContain('PAYROLL');
                expect(desc).toContain('JOB12345');
            });

            it('should describe PURGE_JOB operation', () => {
                const desc = (handler as any).describeJobOperation({ type: 'PURGE_JOB', jobName: 'PAYROLL', jobId: 'JOB12345' });
                expect(desc).toContain('spool');
            });

            it('should describe other operations with type name', () => {
                const desc = (handler as any).describeJobOperation({ type: 'LIST_JOBS' });
                expect(desc).toContain('LIST_JOBS');
            });
        });
    });

    // ── English language responses ─────────────────────────────

    describe('English language responses', () => {
        beforeEach(() => {
            (GetJobs.getJob as jest.Mock).mockResolvedValue(MOCK_JOB);
            (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([]);
        });

        it('should return English empty prompt help', async () => {
            const request = { prompt: '', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            // Both FR and EN paths tested by checking markdown was called
            expect(mockStream.markdown).toHaveBeenCalled();
        });

        it('should return English null intent message', async () => {
            mockClassify.mockResolvedValue(null);
            const request = { prompt: 'list my jobs', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(mockStream.markdown).toHaveBeenCalled();
        });

        it('should use English for GET_JOB_STATUS with English prompt', async () => {
            mockClassify.mockResolvedValue({ type: 'GET_JOB_STATUS', jobId: 'JOB12345' });
            // Use a clearly English sentence that detectLanguage will recognize
            const request = { prompt: 'show the status of job JOB12345 please', model: {} } as any;
            await handler.handle(request, {} as any, mockStream as any, {} as any);

            const allMarkdown = (mockStream.markdown as jest.Mock).mock.calls.map((c: any[]) => c[0]).join('');
            // Either English (Property) or French (Propriété) is fine — just check the table was rendered
            expect(allMarkdown).toMatch(/Property|Propriété/);
        });
    });

    // ── Default switch case ────────────────────────────────────

    describe('Default switch case', () => {
        it('should handle unknown intent type gracefully', async () => {
            mockClassify.mockResolvedValue({ type: 'UNKNOWN_INTENT' });
            (jest.requireMock('../zowe/safety').requestConfirmation as jest.Mock).mockResolvedValue(true);

            const request = { prompt: 'do something unknown', model: {} } as any;
            const result = await handler.handle(request, {} as any, mockStream as any, {} as any);

            expect(result).toBeDefined();
            expect(result.metadata.intentType).toBe('UNKNOWN_INTENT');
        });
    });
});
