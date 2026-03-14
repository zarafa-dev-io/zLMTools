// ============================================================
// Tests — Tool Registry
// ============================================================

jest.mock('fs');
jest.mock('@zowe/zos-files-for-zowe-sdk', () => ({
    List:     { dataSet: jest.fn(), allMembers: jest.fn() },
    Download: { dataSet: jest.fn(), allMembers: jest.fn(), allDataSets: jest.fn() },
    Upload:   { fileToDataset: jest.fn(), dirToPds: jest.fn() },
    Copy:     { dataSet: jest.fn(), isPDS: jest.fn() },
    Create:   { dataSet: jest.fn(), dataSetLike: jest.fn() },
    Delete:   { dataSet: jest.fn() },
}));
jest.mock('@zowe/zos-jobs-for-zowe-sdk', () => ({
    GetJobs: {
        getJobsCommon: jest.fn(),
        getJob: jest.fn(),
        getSpoolFilesForJob: jest.fn(),
        getSpoolContentById: jest.fn(),
    },
    SubmitJobs: {
        submitJcl: jest.fn(),
        submitJob: jest.fn(),
    },
}));

import * as vscode from 'vscode';
import * as fs from 'fs';
import { List, Download, Upload, Copy, Create, Delete } from '@zowe/zos-files-for-zowe-sdk';
import { GetJobs, SubmitJobs } from '@zowe/zos-jobs-for-zowe-sdk';
import { registerTools } from '../tools/registry';
import { ZoweSessionManager } from '../zowe/session';
import { TelemetryService } from '../utils/telemetry';

// ── Helpers ───────────────────────────────────────────────────

const fakeSession = { _options: { hostname: 'mf.host' } };

const makeCancelToken = (cancelled = false): vscode.CancellationToken => ({
    isCancellationRequested: cancelled,
    onCancellationRequested: jest.fn() as any,
});

function parseResult(result: vscode.LanguageModelToolResult): any {
    return JSON.parse((result.content[0] as vscode.LanguageModelTextPart).value);
}

function textResult(result: vscode.LanguageModelToolResult): string {
    return (result.content[0] as vscode.LanguageModelTextPart).value;
}

// ── Test setup ────────────────────────────────────────────────

const tools = new Map<string, any>();

const mockSessionManager = {
    getSession: jest.fn().mockResolvedValue({ session: fakeSession, profileName: 'DEV1' }),
} as unknown as ZoweSessionManager;

const mockTelemetry = {
    trackSuccess: jest.fn(),
    trackError: jest.fn(),
    trackDuration: jest.fn(),
} as unknown as TelemetryService;

const mockContext = {
    subscriptions: { push: jest.fn() },
} as unknown as vscode.ExtensionContext;

beforeAll(() => {
    (vscode.lm.registerTool as jest.Mock).mockImplementation((name: string, handler: any) => {
        tools.set(name, handler);
        return { dispose: jest.fn() };
    });
    // Set a workspace root so tools don't fall back to os.homedir()
    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
    registerTools(mockContext, mockSessionManager, mockTelemetry);
});

beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply defaults cleared by clearAllMocks
    (mockSessionManager.getSession as jest.Mock).mockResolvedValue({ session: fakeSession, profileName: 'DEV1' });
    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
});

// ============================================================
// Registration
// ============================================================

describe('registerTools — registration', () => {
    const expectedTools = [
        'zos_listDatasets', 'zos_listMembers', 'zos_readMember', 'zos_datasetInfo',
        'zos_searchContent', 'zos_downloadMember', 'zos_downloadAllMembers',
        'zos_downloadAllDatasets', 'zos_uploadFileToPds', 'zos_uploadDirToPds',
        'zos_copyMember', 'zos_copyDataset', 'zos_createDataset',
        'zos_deleteMember', 'zos_deleteDataset',
        'zos_listJobs', 'zos_getJobStatus', 'zos_getJobOutput',
        'zos_submitLocalJcl', 'zos_submitJcl',
    ];

    it('should register all expected tools', () => {
        for (const name of expectedTools) {
            expect(tools.has(name)).toBe(true);
        }
    });

    it(`should register exactly ${expectedTools.length} tools`, () => {
        expect(tools.size).toBe(expectedTools.length);
    });
});

// ============================================================
// pdsExtension — tested via zos_downloadMember localFile path
// ============================================================

describe('pdsExtension (via zos_downloadMember)', () => {
    const cases: [string, string][] = [
        ['HLQ.COBOL.SRC',    '.cbl'],
        ['HLQ.CBL.LIB',      '.cbl'],
        ['HLQ.COB.SRC',      '.cbl'],
        ['HLQ.JCL.LIB',      '.jcl'],
        ['HLQ.CNTL.LIB',     '.jcl'],
        ['HLQ.JCLLIB.SRC',   '.jcl'],
        ['HLQ.PROC.LIB',     '.proc'],
        ['HLQ.PROCLIB.SRC',  '.proc'],
        ['HLQ.ASM.SRC',      '.asm'],
        ['HLQ.ASSEM.LIB',    '.asm'],
        ['HLQ.MACLIB.SRC',   '.asm'],
        ['HLQ.MAC.SRC',      '.asm'],
        ['HLQ.COPY.LIB',     '.cpy'],
        ['HLQ.CPY.SRC',      '.cpy'],
        ['HLQ.COPYBOOK.SRC', '.cpy'],
        ['HLQ.COPYLIB.SRC',  '.cpy'],
        ['HLQ.PLI.SRC',      '.pli'],
        ['HLQ.PL1.SRC',      '.pli'],
        ['HLQ.REXX.LIB',     '.rexx'],
        ['HLQ.EXEC.LIB',     '.rexx'],
        ['HLQ.XML.LIB',      '.xml'],
        ['HLQ.DATA.FILE',    '.txt'],
    ];

    beforeEach(() => {
        (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
        (Download.dataSet as jest.Mock).mockResolvedValue({});
    });

    for (const [dataset, expectedExt] of cases) {
        it(`${dataset} → ${expectedExt}`, async () => {
            const result = await tools.get('zos_downloadMember').invoke(
                { input: { dataset, member: 'MYPGM' } },
                makeCancelToken()
            );
            const parsed = parseResult(result);
            expect(parsed.localFile).toMatch(new RegExp(`\\${expectedExt}$`));
        });
    }
});

// ============================================================
// zos_readMember
// ============================================================

describe('zos_readMember', () => {
    it('should return string content as-is', async () => {
        (Download.dataSet as jest.Mock).mockResolvedValue({ apiResponse: 'HELLO WORLD' });
        const result = await tools.get('zos_readMember').invoke(
            { input: { dataset: 'HLQ.COBOL', member: 'HELLO' } },
            makeCancelToken()
        );
        expect(textResult(result)).toBe('HELLO WORLD');
    });

    it('should decode Buffer content as utf-8', async () => {
        const buf = Buffer.from('BUFFER CONTENT');
        (Download.dataSet as jest.Mock).mockResolvedValue({ apiResponse: buf });
        const result = await tools.get('zos_readMember').invoke(
            { input: { dataset: 'HLQ.COBOL', member: 'HELLO' } },
            makeCancelToken()
        );
        expect(textResult(result)).toBe('BUFFER CONTENT');
    });

    it('should truncate content exceeding 1000 lines', async () => {
        const bigContent = Array.from({ length: 1200 }, (_, i) => `LINE ${i}`).join('\n');
        (Download.dataSet as jest.Mock).mockResolvedValue({ apiResponse: bigContent });
        const result = await tools.get('zos_readMember').invoke(
            { input: { dataset: 'HLQ.COBOL', member: 'BIG' } },
            makeCancelToken()
        );
        const text = textResult(result);
        expect(text).toContain('truncated, 1200 total lines');
        expect(text.split('\n').length).toBeLessThan(1005);
    });

    it('should NOT truncate content with exactly 1000 lines', async () => {
        const content = Array.from({ length: 1000 }, (_, i) => `LINE ${i}`).join('\n');
        (Download.dataSet as jest.Mock).mockResolvedValue({ apiResponse: content });
        const result = await tools.get('zos_readMember').invoke(
            { input: { dataset: 'HLQ.COBOL', member: 'MED' } },
            makeCancelToken()
        );
        expect(textResult(result)).not.toContain('truncated');
    });
});

// ============================================================
// zos_datasetInfo
// ============================================================

describe('zos_datasetInfo', () => {
    it('should return dataset info when found', async () => {
        const ds = { dsname: 'HLQ.DATA', dsorg: 'PO', lrecl: 80 };
        (List.dataSet as jest.Mock).mockResolvedValue({ apiResponse: { items: [ds] } });
        const result = await tools.get('zos_datasetInfo').invoke(
            { input: { dataset: 'HLQ.DATA' } },
            makeCancelToken()
        );
        expect(parseResult(result)).toMatchObject(ds);
    });

    it('should return "Dataset not found" when items is empty', async () => {
        (List.dataSet as jest.Mock).mockResolvedValue({ apiResponse: { items: [] } });
        const result = await tools.get('zos_datasetInfo').invoke(
            { input: { dataset: 'HLQ.MISSING' } },
            makeCancelToken()
        );
        expect(textResult(result)).toBe('Dataset not found');
    });
});

// ============================================================
// zos_uploadFileToPds
// ============================================================

describe('zos_uploadFileToPds', () => {
    it('should return error when file does not exist', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        const result = await tools.get('zos_uploadFileToPds').invoke(
            { input: { localPath: 'missing/file.cbl', dataset: 'HLQ.COBOL', member: 'HELLO' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed.status).toBe('error');
        expect(parsed.message).toContain('File not found');
    });

    it('should resolve relative path against workspace root', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (Upload.fileToDataset as jest.Mock).mockResolvedValue({});
        const result = await tools.get('zos_uploadFileToPds').invoke(
            { input: { localPath: 'src/hello.cbl', dataset: 'HLQ.COBOL', member: 'HELLO' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed.status).toBe('success');
        expect(parsed.localFile).toContain('workspace');
    });

    it('should use absolute path as-is', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (Upload.fileToDataset as jest.Mock).mockResolvedValue({});
        const result = await tools.get('zos_uploadFileToPds').invoke(
            { input: { localPath: '/abs/path/hello.cbl', dataset: 'HLQ.COBOL', member: 'HELLO' } },
            makeCancelToken()
        );
        expect(parseResult(result).localFile).toBe('/abs/path/hello.cbl');
    });
});

// ============================================================
// zos_uploadDirToPds
// ============================================================

describe('zos_uploadDirToPds', () => {
    it('should return error when directory does not exist', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        const result = await tools.get('zos_uploadDirToPds').invoke(
            { input: { localPath: 'missing/dir', dataset: 'HLQ.COBOL' } },
            makeCancelToken()
        );
        expect(parseResult(result).status).toBe('error');
    });

    it('should return error when path exists but is not a directory', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false, isFile: () => true });
        const result = await tools.get('zos_uploadDirToPds').invoke(
            { input: { localPath: 'not-a-dir', dataset: 'HLQ.COBOL' } },
            makeCancelToken()
        );
        expect(parseResult(result).status).toBe('error');
    });

    it('should return success with file count', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        // First call is the directory check, subsequent calls are per-file checks
        (fs.statSync as jest.Mock).mockImplementation((p: string) => {
            if (p === '/abs/src') { return { isDirectory: () => true, isFile: () => false }; }
            return { isDirectory: () => false, isFile: () => true };
        });
        (fs.readdirSync as jest.Mock).mockReturnValue(['HELLO.cbl', 'WORLD.cbl']);
        (Upload.dirToPds as jest.Mock).mockResolvedValue({});
        const result = await tools.get('zos_uploadDirToPds').invoke(
            { input: { localPath: '/abs/src', dataset: 'HLQ.COBOL' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed.status).toBe('success');
        expect(parsed.uploadedFiles).toBe(2);
    });
});

// ============================================================
// zos_downloadAllDatasets
// ============================================================

describe('zos_downloadAllDatasets', () => {
    it('should return no_datasets when pattern matches nothing', async () => {
        (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
        (List.dataSet as jest.Mock).mockResolvedValue({ apiResponse: { items: [] } });
        const result = await tools.get('zos_downloadAllDatasets').invoke(
            { input: { pattern: 'HLQ.NOTHING.*' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed.status).toBe('no_datasets');
        expect(parsed.pattern).toBe('HLQ.NOTHING.*');
    });

    it('should download and return dataset count', async () => {
        (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
        (fs.existsSync as jest.Mock).mockReturnValue(false); // skip rename for simplicity
        (List.dataSet as jest.Mock).mockResolvedValue({
            apiResponse: { items: [
                { dsname: 'HLQ.COBOL.SRC' },
                { dsname: 'HLQ.JCL.LIB' },
            ] },
        });
        (Download.allDataSets as jest.Mock).mockResolvedValue({});
        const result = await tools.get('zos_downloadAllDatasets').invoke(
            { input: { pattern: 'HLQ.*' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed.status).toBe('success');
        expect(parsed.datasetCount).toBe(2);
    });
});

// ============================================================
// zos_getJobStatus
// ============================================================

describe('zos_getJobStatus', () => {
    const fakeJob = { jobname: 'MYJOB', jobid: 'JOB12345', owner: 'USER', status: 'OUTPUT', retcode: 'CC 0000', type: 'JOB', class: 'A', subsystem: 'JES2' };

    it('should look up job by jobId', async () => {
        (GetJobs.getJob as jest.Mock).mockResolvedValue(fakeJob);
        (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([]);
        const result = await tools.get('zos_getJobStatus').invoke(
            { input: { jobId: 'JOB12345' } },
            makeCancelToken()
        );
        expect(GetJobs.getJob).toHaveBeenCalledWith(fakeSession, 'JOB12345');
        expect(parseResult(result).jobid).toBe('JOB12345');
    });

    it('should look up job by jobName when no jobId', async () => {
        (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([fakeJob]);
        (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([]);
        const result = await tools.get('zos_getJobStatus').invoke(
            { input: { jobName: 'MYJOB' } },
            makeCancelToken()
        );
        expect(GetJobs.getJobsCommon).toHaveBeenCalledWith(fakeSession, expect.objectContaining({ prefix: 'MYJOB', maxJobs: 1 }));
        expect(parseResult(result).jobname).toBe('MYJOB');
    });

    it('should return "Job not found" when neither resolves a job', async () => {
        const result = await tools.get('zos_getJobStatus').invoke(
            { input: {} },
            makeCancelToken()
        );
        expect(textResult(result)).toBe('Job not found');
    });

    it('should include spool files in response', async () => {
        (GetJobs.getJob as jest.Mock).mockResolvedValue(fakeJob);
        (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
            { ddname: 'JESMSGLG', stepname: '', procstep: '', 'byte-count': 1024, id: 1 },
        ]);
        const result = await tools.get('zos_getJobStatus').invoke(
            { input: { jobId: 'JOB12345' } },
            makeCancelToken()
        );
        expect(parseResult(result).spoolFiles).toHaveLength(1);
    });

    it('should set spoolFiles to [] when spool fetch fails', async () => {
        (GetJobs.getJob as jest.Mock).mockResolvedValue(fakeJob);
        (GetJobs.getSpoolFilesForJob as jest.Mock).mockRejectedValue(new Error('not available'));
        const result = await tools.get('zos_getJobStatus').invoke(
            { input: { jobId: 'JOB12345' } },
            makeCancelToken()
        );
        expect(parseResult(result).spoolFiles).toEqual([]);
    });
});

// ============================================================
// zos_getJobOutput
// ============================================================

describe('zos_getJobOutput', () => {
    const fakeJob = { jobname: 'MYJOB', jobid: 'JOB12345' };

    it('should return "Job not found" when job cannot be resolved', async () => {
        const result = await tools.get('zos_getJobOutput').invoke(
            { input: {} },
            makeCancelToken()
        );
        expect(textResult(result)).toBe('Job not found');
    });

    it('should filter spool files by ddName when provided', async () => {
        (GetJobs.getJob as jest.Mock).mockResolvedValue(fakeJob);
        (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
            { ddname: 'SYSPRINT', stepname: 'STEP1', id: 1 },
            { ddname: 'SYSOUT',   stepname: 'STEP2', id: 2 },
        ]);
        (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue('OUTPUT CONTENT');
        const result = await tools.get('zos_getJobOutput').invoke(
            { input: { jobId: 'JOB12345', ddName: 'SYSPRINT' } },
            makeCancelToken()
        );
        const output = parseResult(result);
        expect(Object.keys(output)).toContain('SYSPRINT(STEP1)');
        expect(Object.keys(output)).not.toContain('SYSOUT(STEP2)');
    });

    it('should use default DD filter when no ddName provided', async () => {
        (GetJobs.getJob as jest.Mock).mockResolvedValue(fakeJob);
        (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
            { ddname: 'JESMSGLG', stepname: '', id: 1 },
            { ddname: 'CUSTOM',   stepname: '', id: 2 },
        ]);
        (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue('LOG');
        const result = await tools.get('zos_getJobOutput').invoke(
            { input: { jobId: 'JOB12345' } },
            makeCancelToken()
        );
        const output = parseResult(result);
        expect(Object.keys(output)).toContain('JESMSGLG');
        expect(Object.keys(output)).not.toContain('CUSTOM');
    });

    it('should truncate spool content exceeding 500 lines', async () => {
        (GetJobs.getJob as jest.Mock).mockResolvedValue(fakeJob);
        (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
            { ddname: 'SYSPRINT', stepname: '', id: 1 },
        ]);
        const bigContent = Array.from({ length: 600 }, (_, i) => `LINE ${i}`).join('\n');
        (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue(bigContent);
        const result = await tools.get('zos_getJobOutput').invoke(
            { input: { jobId: 'JOB12345', ddName: 'SYSPRINT' } },
            makeCancelToken()
        );
        expect(parseResult(result)['SYSPRINT']).toContain('truncated, 600 total lines');
    });

    it('should use ddname(stepname) as key when stepname is present', async () => {
        (GetJobs.getJob as jest.Mock).mockResolvedValue(fakeJob);
        (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
            { ddname: 'SYSPRINT', stepname: 'COMPILE', id: 1 },
        ]);
        (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue('content');
        const result = await tools.get('zos_getJobOutput').invoke(
            { input: { jobId: 'JOB12345', ddName: 'SYSPRINT' } },
            makeCancelToken()
        );
        expect(Object.keys(parseResult(result))).toContain('SYSPRINT(COMPILE)');
    });
});

// ============================================================
// zos_submitLocalJcl
// ============================================================

describe('zos_submitLocalJcl — prepareInvocation', () => {
    it('should include fileName in invocationMessage', async () => {
        const prep = await tools.get('zos_submitLocalJcl').prepareInvocation(
            { input: { localPath: 'jobs/myjob.jcl' } },
            makeCancelToken()
        );
        expect(prep.invocationMessage).toContain('myjob.jcl');
    });

    it('should include monitoring message when monitor=true', async () => {
        const prep = await tools.get('zos_submitLocalJcl').prepareInvocation(
            { input: { localPath: 'myjob.jcl', monitor: true } },
            makeCancelToken()
        );
        expect(prep.confirmationMessages.message.value).toContain('monitored');
    });

    it('should NOT include monitoring message when monitor=false', async () => {
        const prep = await tools.get('zos_submitLocalJcl').prepareInvocation(
            { input: { localPath: 'myjob.jcl', monitor: false } },
            makeCancelToken()
        );
        expect(prep.confirmationMessages.message.value).not.toContain('monitored');
    });
});

describe('zos_submitLocalJcl — invoke', () => {
    it('should return error when file does not exist', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        const result = await tools.get('zos_submitLocalJcl').invoke(
            { input: { localPath: 'missing.jcl' } },
            makeCancelToken()
        );
        expect(parseResult(result).status).toBe('error');
        expect(parseResult(result).message).toContain('File not found');
    });

    it('should return error for file without JOB card', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue('// THIS IS NOT VALID JCL\n//STEP EXEC PGM=MYPGM');
        const result = await tools.get('zos_submitLocalJcl').invoke(
            { input: { localPath: 'bad.jcl' } },
            makeCancelToken()
        );
        expect(parseResult(result).status).toBe('error');
        expect(parseResult(result).message).toContain('JOB card');
    });

    it('should submit valid JCL and return job info', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue('//MYJOB JOB (ACCT),"USER"\n//STEP EXEC PGM=IEFBR14');
        (SubmitJobs.submitJcl as jest.Mock).mockResolvedValue({
            jobname: 'MYJOB', jobid: 'JOB00001', owner: 'USER', class: 'A', status: 'INPUT',
        });
        const result = await tools.get('zos_submitLocalJcl').invoke(
            { input: { localPath: '/abs/myjob.jcl' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed.status).toBe('success');
        expect(parsed.jobname).toBe('MYJOB');
        expect(parsed.jobid).toBe('JOB00001');
    });
});

// ============================================================
// zos_submitJcl
// ============================================================

describe('zos_submitJcl — prepareInvocation', () => {
    it('should build fullName with member', async () => {
        const prep = await tools.get('zos_submitJcl').prepareInvocation(
            { input: { dataset: 'HLQ.JCL', member: 'MYJOB' } },
            makeCancelToken()
        );
        expect(prep.invocationMessage).toContain('HLQ.JCL(MYJOB)');
    });

    it('should build fullName without member', async () => {
        const prep = await tools.get('zos_submitJcl').prepareInvocation(
            { input: { dataset: 'HLQ.JCL.SEQ' } },
            makeCancelToken()
        );
        expect(prep.invocationMessage).toContain('HLQ.JCL.SEQ');
        expect(prep.invocationMessage).not.toContain('(');
    });

    it('should show PRODUCTION warning for protected dataset', async () => {
        const prep = await tools.get('zos_submitJcl').prepareInvocation(
            { input: { dataset: 'HLQ.PROD.JCL', member: 'MYJOB' } },
            makeCancelToken()
        );
        expect(prep.confirmationMessages.title).toContain('PRODUCTION');
        expect(prep.confirmationMessages.message.value).toContain('PRODUCTION DATASET');
    });

    it('should show simple title for non-protected dataset', async () => {
        const prep = await tools.get('zos_submitJcl').prepareInvocation(
            { input: { dataset: 'HLQ.DEV.JCL', member: 'MYJOB' } },
            makeCancelToken()
        );
        expect(prep.confirmationMessages.title).toBe('Submit JCL');
        expect(prep.confirmationMessages.message.value).not.toContain('PRODUCTION');
    });
});

describe('zos_submitJcl — invoke', () => {
    it('should submit with member and return job info', async () => {
        (SubmitJobs.submitJob as jest.Mock).mockResolvedValue({
            jobname: 'MYJOB', jobid: 'JOB00001', owner: 'USER', status: 'INPUT', class: 'A',
        });
        const result = await tools.get('zos_submitJcl').invoke(
            { input: { dataset: 'HLQ.JCL', member: 'MYJOB' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed.jobname).toBe('MYJOB');
        expect(parsed.source).toBe('HLQ.JCL(MYJOB)');
    });

    it('should submit without member', async () => {
        (SubmitJobs.submitJob as jest.Mock).mockResolvedValue({
            jobname: 'SEQJOB', jobid: 'JOB00002', owner: 'USER', status: 'INPUT', class: 'A',
        });
        const result = await tools.get('zos_submitJcl').invoke(
            { input: { dataset: 'HLQ.JCL.SEQ' } },
            makeCancelToken()
        );
        expect(parseResult(result).source).toBe('HLQ.JCL.SEQ');
    });
});

// ============================================================
// zos_copyDataset
// ============================================================

describe('zos_copyDataset', () => {
    it('should copy PDS member by member', async () => {
        (Copy.isPDS as jest.Mock).mockResolvedValue(true);
        (List.allMembers as jest.Mock).mockResolvedValue({
            apiResponse: { items: [{ member: 'MEM1' }, { member: 'MEM2' }] },
        });
        (Copy.dataSet as jest.Mock).mockResolvedValue({});
        const result = await tools.get('zos_copyDataset').invoke(
            { input: { fromDataset: 'HLQ.SRC', toDataset: 'HLQ.DST' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed.status).toBe('success');
        expect(parsed.copied).toBe(2);
        expect(parsed.totalMembers).toBe(2);
    });

    it('should report partial status when some members fail', async () => {
        (Copy.isPDS as jest.Mock).mockResolvedValue(true);
        (List.allMembers as jest.Mock).mockResolvedValue({
            apiResponse: { items: [{ member: 'OK' }, { member: 'BAD' }] },
        });
        (Copy.dataSet as jest.Mock)
            .mockResolvedValueOnce({})
            .mockRejectedValueOnce(new Error('member locked'));
        const result = await tools.get('zos_copyDataset').invoke(
            { input: { fromDataset: 'HLQ.SRC', toDataset: 'HLQ.DST' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed.status).toBe('partial');
        expect(parsed.copied).toBe(1);
        expect(parsed.errors).toHaveLength(1);
    });

    it('should copy sequential dataset directly', async () => {
        (Copy.isPDS as jest.Mock).mockResolvedValue(false);
        (Copy.dataSet as jest.Mock).mockResolvedValue({});
        const result = await tools.get('zos_copyDataset').invoke(
            { input: { fromDataset: 'HLQ.SEQ.A', toDataset: 'HLQ.SEQ.B' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed.status).toBe('success');
        expect(parsed.copied).toBe(1);
    });

    it('should stop early on cancellation', async () => {
        (Copy.isPDS as jest.Mock).mockResolvedValue(true);
        (List.allMembers as jest.Mock).mockResolvedValue({
            apiResponse: { items: [{ member: 'MEM1' }, { member: 'MEM2' }] },
        });
        const result = await tools.get('zos_copyDataset').invoke(
            { input: { fromDataset: 'HLQ.SRC', toDataset: 'HLQ.DST' } },
            makeCancelToken(true) // cancelled
        );
        expect(Copy.dataSet).not.toHaveBeenCalled();
        expect(parseResult(result).copied).toBe(0);
    });
});

// ============================================================
// zos_createDataset
// ============================================================

describe('zos_createDataset', () => {
    it('should use dataSetLike when likeDataset is provided', async () => {
        (Create.dataSetLike as jest.Mock).mockResolvedValue({});
        const result = await tools.get('zos_createDataset').invoke(
            { input: { name: 'HLQ.NEW', likeDataset: 'HLQ.MODEL' } },
            makeCancelToken()
        );
        expect(Create.dataSetLike).toHaveBeenCalledWith(fakeSession, 'HLQ.NEW', 'HLQ.MODEL', expect.any(Object));
        expect(parseResult(result).likeDataset).toBe('HLQ.MODEL');
    });

    it('should create PO dataset with default PARTITIONED type', async () => {
        (Create.dataSet as jest.Mock).mockResolvedValue({});
        const result = await tools.get('zos_createDataset').invoke(
            { input: { name: 'HLQ.NEW.PO' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed.dstype).toBe('PARTITIONED');
        expect(parsed.dsorg).toBe('PO');
    });

    it('should create PS dataset for SEQUENTIAL type', async () => {
        (Create.dataSet as jest.Mock).mockResolvedValue({});
        const result = await tools.get('zos_createDataset').invoke(
            { input: { name: 'HLQ.NEW.PS', dstype: 'SEQUENTIAL' } },
            makeCancelToken()
        );
        expect(parseResult(result).dsorg).toBe('PS');
    });

    it('should NOT set recfm/lrecl/blksize for BINARY type', async () => {
        (Create.dataSet as jest.Mock).mockResolvedValue({});
        await tools.get('zos_createDataset').invoke(
            { input: { name: 'HLQ.NEW.BIN', dstype: 'BINARY' } },
            makeCancelToken()
        );
        const callOpts = (Create.dataSet as jest.Mock).mock.calls[0][2];
        expect(callOpts.recfm).toBeUndefined();
        expect(callOpts.lrecl).toBeUndefined();
    });

    it('should NOT set recfm/lrecl/blksize for C type', async () => {
        (Create.dataSet as jest.Mock).mockResolvedValue({});
        await tools.get('zos_createDataset').invoke(
            { input: { name: 'HLQ.NEW.C', dstype: 'C' } },
            makeCancelToken()
        );
        const callOpts = (Create.dataSet as jest.Mock).mock.calls[0][2];
        expect(callOpts.recfm).toBeUndefined();
        expect(callOpts.lrecl).toBeUndefined();
    });
});

// ============================================================
// zos_listDatasets
// ============================================================

describe('zos_listDatasets', () => {
    it('should return mapped dataset list', async () => {
        (List.dataSet as jest.Mock).mockResolvedValue({
            apiResponse: { items: [
                { dsname: 'HLQ.DATA', dsorg: 'PO', recfm: 'FB', lrecl: 80, vol: 'VOL001' },
            ] },
        });
        const result = await tools.get('zos_listDatasets').invoke(
            { input: { pattern: 'HLQ.*' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed).toHaveLength(1);
        expect(parsed[0].dsname).toBe('HLQ.DATA');
        expect(parsed[0].lrecl).toBe(80);
    });

    it('should return empty array when no datasets found', async () => {
        (List.dataSet as jest.Mock).mockResolvedValue({ apiResponse: { items: [] } });
        const result = await tools.get('zos_listDatasets').invoke(
            { input: { pattern: 'NOTHING.*' } },
            makeCancelToken()
        );
        expect(parseResult(result)).toEqual([]);
    });

    it('should handle null apiResponse items', async () => {
        (List.dataSet as jest.Mock).mockResolvedValue({ apiResponse: {} });
        const result = await tools.get('zos_listDatasets').invoke(
            { input: { pattern: 'HLQ.*' } },
            makeCancelToken()
        );
        expect(parseResult(result)).toEqual([]);
    });
});

// ============================================================
// zos_listMembers
// ============================================================

describe('zos_listMembers', () => {
    it('should return mapped member list', async () => {
        (List.allMembers as jest.Mock).mockResolvedValue({
            apiResponse: { items: [
                { member: 'HELLO', changed: '2024-01-01', user: 'Z79863', init: 1 },
                { member: 'WORLD', m4date: '2024-01-02', user: 'Z79863', init: 2 },
            ] },
        });
        const result = await tools.get('zos_listMembers').invoke(
            { input: { dataset: 'HLQ.COBOL' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed).toHaveLength(2);
        expect(parsed[0].member).toBe('HELLO');
        expect(parsed[0].changed).toBe('2024-01-01');
        // m4date used as fallback when changed is undefined
        expect(parsed[1].changed).toBe('2024-01-02');
    });

    it('should pass optional pattern to allMembers', async () => {
        (List.allMembers as jest.Mock).mockResolvedValue({ apiResponse: { items: [] } });
        await tools.get('zos_listMembers').invoke(
            { input: { dataset: 'HLQ.COBOL', pattern: 'PROG*' } },
            makeCancelToken()
        );
        expect(List.allMembers).toHaveBeenCalledWith(
            fakeSession,
            'HLQ.COBOL',
            expect.objectContaining({ pattern: 'PROG*' })
        );
    });
});

// ============================================================
// zos_searchContent
// ============================================================

describe('zos_searchContent', () => {
    const makeMembers = (count: number) =>
        Array.from({ length: count }, (_, i) => ({ member: `MEM${i}` }));

    beforeEach(() => {
        (List.allMembers as jest.Mock).mockResolvedValue({
            apiResponse: { items: makeMembers(3) },
        });
    });

    it('should return members with matches', async () => {
        (Download.dataSet as jest.Mock).mockResolvedValue({
            apiResponse: 'LINE 1\nCALL SOMETHING\nLINE 3',
        });
        const result = await tools.get('zos_searchContent').invoke(
            { input: { dataset: 'HLQ.COBOL', searchTerm: 'CALL' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed.matchingMembers).toBeGreaterThan(0);
        expect(parsed.results[0].hitCount).toBeGreaterThan(0);
    });

    it('should return no results when term not found', async () => {
        (Download.dataSet as jest.Mock).mockResolvedValue({
            apiResponse: 'NO MATCH HERE AT ALL',
        });
        const result = await tools.get('zos_searchContent').invoke(
            { input: { dataset: 'HLQ.COBOL', searchTerm: 'ZZZNOMATCH' } },
            makeCancelToken()
        );
        expect(parseResult(result).matchingMembers).toBe(0);
    });

    it('should handle Buffer apiResponse in member content', async () => {
        (Download.dataSet as jest.Mock).mockResolvedValue({
            apiResponse: Buffer.from('CALL SUBPGM'),
        });
        const result = await tools.get('zos_searchContent').invoke(
            { input: { dataset: 'HLQ.COBOL', searchTerm: 'CALL' } },
            makeCancelToken()
        );
        expect(parseResult(result).matchingMembers).toBe(3);
    });

    it('should stop on cancellation', async () => {
        (Download.dataSet as jest.Mock).mockResolvedValue({ apiResponse: 'CALL x' });
        const result = await tools.get('zos_searchContent').invoke(
            { input: { dataset: 'HLQ.COBOL', searchTerm: 'CALL' } },
            makeCancelToken(true) // cancelled immediately
        );
        // No downloads should occur after the cancel check
        expect(Download.dataSet).not.toHaveBeenCalled();
        expect(parseResult(result).matchingMembers).toBe(0);
    });

    it('should cap scan at 30 members', async () => {
        (List.allMembers as jest.Mock).mockResolvedValue({
            apiResponse: { items: makeMembers(50) },
        });
        (Download.dataSet as jest.Mock).mockResolvedValue({ apiResponse: 'no match' });
        const result = await tools.get('zos_searchContent').invoke(
            { input: { dataset: 'HLQ.COBOL', searchTerm: 'CALL' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed.scannedMembers).toBe(30);
        expect(parsed.totalMembers).toBe(50);
        expect(Download.dataSet).toHaveBeenCalledTimes(30);
    });

    it('should skip members that fail to download', async () => {
        (Download.dataSet as jest.Mock)
            .mockResolvedValueOnce({ apiResponse: 'CALL x' })
            .mockRejectedValueOnce(new Error('unreadable'))
            .mockResolvedValueOnce({ apiResponse: 'CALL y' });
        const result = await tools.get('zos_searchContent').invoke(
            { input: { dataset: 'HLQ.COBOL', searchTerm: 'CALL' } },
            makeCancelToken()
        );
        // 2 out of 3 members matched (1 failed silently)
        expect(parseResult(result).matchingMembers).toBe(2);
    });

    it('should limit hits to 5 per member', async () => {
        const manyHits = Array.from({ length: 10 }, (_, i) => `CALL PROG${i}`).join('\n');
        (Download.dataSet as jest.Mock).mockResolvedValue({ apiResponse: manyHits });
        const result = await tools.get('zos_searchContent').invoke(
            { input: { dataset: 'HLQ.COBOL', searchTerm: 'CALL' } },
            makeCancelToken()
        );
        const firstResult = parseResult(result).results[0];
        expect(firstResult.hitCount).toBe(10);
        expect(firstResult.hits).toHaveLength(5);
    });
});

// ============================================================
// zos_downloadAllMembers + renameDownloadedFiles
// ============================================================

describe('zos_downloadAllMembers', () => {
    beforeEach(() => {
        (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
        (Download.allMembers as jest.Mock).mockResolvedValue({});
    });

    it('should return file list when dir exists after download', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readdirSync as jest.Mock).mockReturnValue([
            { isFile: () => true, name: 'program1.cbl' },
            { isFile: () => true, name: 'program2.cbl' },
        ]);
        (fs.renameSync as jest.Mock).mockReturnValue(undefined);
        const result = await tools.get('zos_downloadAllMembers').invoke(
            { input: { dataset: 'HLQ.COBOL.SRC' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed.status).toBe('success');
        expect(parsed.fileCount).toBe(2);
        // Files should be renamed to UPPERCASE.cbl
        expect(parsed.files[0]).toMatch(/^PROGRAM1\.cbl$/);
    });

    it('should return empty file list when dir does not exist after download', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        const result = await tools.get('zos_downloadAllMembers').invoke(
            { input: { dataset: 'HLQ.COBOL.SRC' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed.fileCount).toBe(0);
        expect(parsed.files).toEqual([]);
    });

    it('should skip non-file entries in renameDownloadedFiles', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readdirSync as jest.Mock).mockReturnValue([
            { isFile: () => true,  name: 'PROG.cbl' },
            { isFile: () => false, name: 'subdir' }, // directory entry — skipped
        ]);
        (fs.renameSync as jest.Mock).mockReturnValue(undefined);
        const result = await tools.get('zos_downloadAllMembers').invoke(
            { input: { dataset: 'HLQ.COBOL.SRC' } },
            makeCancelToken()
        );
        expect(parseResult(result).fileCount).toBe(1);
    });

    it('should use custom targetDir', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        await tools.get('zos_downloadAllMembers').invoke(
            { input: { dataset: 'HLQ.COBOL', targetDir: '/custom/dir' } },
            makeCancelToken()
        );
        expect(fs.mkdirSync).toHaveBeenCalledWith(
            expect.stringContaining('custom'),
            expect.any(Object)
        );
    });
});

// ============================================================
// zos_copyMember
// ============================================================

describe('zos_copyMember', () => {
    it('should copy member and return from/to info', async () => {
        (Copy.dataSet as jest.Mock).mockResolvedValue({});
        const result = await tools.get('zos_copyMember').invoke(
            { input: {
                fromDataset: 'HLQ.SRC', fromMember: 'ORIG',
                toDataset: 'HLQ.DST', toMember: 'COPY',
            } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed.status).toBe('success');
        expect(parsed.from).toBe('HLQ.SRC(ORIG)');
        expect(parsed.to).toBe('HLQ.DST(COPY)');
    });

    it('should pass replace flag to Copy.dataSet', async () => {
        (Copy.dataSet as jest.Mock).mockResolvedValue({});
        await tools.get('zos_copyMember').invoke(
            { input: {
                fromDataset: 'HLQ.SRC', fromMember: 'ORIG',
                toDataset: 'HLQ.DST', toMember: 'COPY', replace: true,
            } },
            makeCancelToken()
        );
        expect(Copy.dataSet).toHaveBeenCalledWith(
            fakeSession,
            expect.any(Object),
            expect.objectContaining({ replace: true })
        );
    });
});

// ============================================================
// zos_deleteMember
// ============================================================

describe('zos_deleteMember', () => {
    it('should delete member and confirm deletion', async () => {
        (Delete.dataSet as jest.Mock).mockResolvedValue({});
        const result = await tools.get('zos_deleteMember').invoke(
            { input: { dataset: 'HLQ.COBOL', member: 'OLDPGM' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed.status).toBe('success');
        expect(parsed.deleted).toBe('HLQ.COBOL(OLDPGM)');
        expect(Delete.dataSet).toHaveBeenCalledWith(fakeSession, 'HLQ.COBOL(OLDPGM)');
    });
});

// ============================================================
// zos_deleteDataset
// ============================================================

describe('zos_deleteDataset', () => {
    it('should delete dataset without volume', async () => {
        (Delete.dataSet as jest.Mock).mockResolvedValue({});
        const result = await tools.get('zos_deleteDataset').invoke(
            { input: { dataset: 'HLQ.OLD.DATA' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed.status).toBe('success');
        expect(parsed.deleted).toBe('HLQ.OLD.DATA');
        expect(Delete.dataSet).toHaveBeenCalledWith(fakeSession, 'HLQ.OLD.DATA', undefined);
    });

    it('should delete dataset with volume', async () => {
        (Delete.dataSet as jest.Mock).mockResolvedValue({});
        const result = await tools.get('zos_deleteDataset').invoke(
            { input: { dataset: 'HLQ.OLD.DATA', volume: 'VOL001' } },
            makeCancelToken()
        );
        expect(Delete.dataSet).toHaveBeenCalledWith(
            fakeSession, 'HLQ.OLD.DATA', { volume: 'VOL001' }
        );
        expect(parseResult(result).volume).toBe('VOL001');
    });
});

// ============================================================
// zos_listJobs
// ============================================================

describe('zos_listJobs', () => {
    it('should return mapped job list', async () => {
        (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([
            { jobname: 'BATCH01', jobid: 'JOB00001', owner: 'USER', status: 'OUTPUT', retcode: 'CC 0000', class: 'A' },
            { jobname: 'BATCH02', jobid: 'JOB00002', owner: 'USER', status: 'ACTIVE',  retcode: null,      class: 'B' },
        ]);
        const result = await tools.get('zos_listJobs').invoke(
            { input: { owner: 'USER', prefix: 'BATCH*' } },
            makeCancelToken()
        );
        const parsed = parseResult(result);
        expect(parsed).toHaveLength(2);
        expect(parsed[0].jobname).toBe('BATCH01');
        expect(parsed[1].status).toBe('ACTIVE');
    });

    it('should pass filter params to getJobsCommon', async () => {
        (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([]);
        await tools.get('zos_listJobs').invoke(
            { input: { owner: 'MYUSER', prefix: 'JOB*', status: 'OUTPUT' } },
            makeCancelToken()
        );
        expect(GetJobs.getJobsCommon).toHaveBeenCalledWith(
            fakeSession,
            expect.objectContaining({ owner: 'MYUSER', prefix: 'JOB*', status: 'OUTPUT', maxJobs: 20 })
        );
    });
});

// ============================================================
// zos_getJobOutput — jobName lookup
// ============================================================

describe('zos_getJobOutput — jobName lookup', () => {
    it('should look up job by jobName when no jobId provided', async () => {
        const fakeJob = { jobname: 'MYJOB', jobid: 'JOB12345' };
        (GetJobs.getJobsCommon as jest.Mock).mockResolvedValue([fakeJob]);
        (GetJobs.getSpoolFilesForJob as jest.Mock).mockResolvedValue([
            { ddname: 'SYSPRINT', stepname: '', id: 1 },
        ]);
        (GetJobs.getSpoolContentById as jest.Mock).mockResolvedValue('OUTPUT');
        const result = await tools.get('zos_getJobOutput').invoke(
            { input: { jobName: 'MYJOB', ddName: 'SYSPRINT' } },
            makeCancelToken()
        );
        expect(GetJobs.getJobsCommon).toHaveBeenCalledWith(
            fakeSession, expect.objectContaining({ prefix: 'MYJOB', maxJobs: 1 })
        );
        expect(parseResult(result)['SYSPRINT']).toBe('OUTPUT');
    });
});

// ============================================================
// zos_downloadAllDatasets — rename logic
// ============================================================

describe('zos_downloadAllDatasets — rename logic', () => {
    beforeEach(() => {
        (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
        (Download.allDataSets as jest.Mock).mockResolvedValue({});
    });

    it('should rename files in PDS subdirectory', async () => {
        (List.dataSet as jest.Mock).mockResolvedValue({
            apiResponse: { items: [{ dsname: 'HLQ.COBOL.SRC' }] },
        });
        // The PDS path exists and is a directory
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true });
        (fs.readdirSync as jest.Mock).mockReturnValue([
            { isFile: () => true, name: 'prog.txt' },
        ]);
        (fs.renameSync as jest.Mock).mockReturnValue(undefined);
        const result = await tools.get('zos_downloadAllDatasets').invoke(
            { input: { pattern: 'HLQ.COBOL.SRC' } },
            makeCancelToken()
        );
        expect(fs.readdirSync).toHaveBeenCalled();
        expect(parseResult(result).status).toBe('success');
    });

    it('should rename sequential dataset file', async () => {
        (List.dataSet as jest.Mock).mockResolvedValue({
            apiResponse: { items: [{ dsname: 'HLQ.DATA.FILE' }] },
        });
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
        (fs.renameSync as jest.Mock).mockReturnValue(undefined);
        const result = await tools.get('zos_downloadAllDatasets').invoke(
            { input: { pattern: 'HLQ.DATA.FILE' } },
            makeCancelToken()
        );
        expect(fs.renameSync).toHaveBeenCalled();
        expect(parseResult(result).status).toBe('success');
    });
});
