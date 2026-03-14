import * as vscode from 'vscode';
import { INTENT_SAFETY } from '../intents/ds.schemas';
import { JOBS_INTENT_SAFETY } from '../intents/jobs.schemas';
import { RUN_INTENT_SAFETY } from '../intents/run.schemas';
import {
    isProtectedDataset,
    getEffectiveSafetyLevel,
    describeOperation,
    requestConfirmation,
} from '../zowe/safety';

// ============================================================
// Tests — Safety module
// ============================================================

describe('isProtectedDataset', () => {
    it('should detect PROD datasets', () => {
        expect(isProtectedDataset('HLQ.PROD.COBOL')).toBe(true);
        expect(isProtectedDataset('APP.PROD.JCL')).toBe(true);
    });

    it('should detect PRD datasets', () => {
        expect(isProtectedDataset('HLQ.PRD.LOAD')).toBe(true);
    });

    it('should detect PRODUCTION datasets', () => {
        expect(isProtectedDataset('HLQ.PRODUCTION.DATA')).toBe(true);
    });

    it('should detect SYS datasets', () => {
        expect(isProtectedDataset('SYS1.LINKLIB')).toBe(true);
        expect(isProtectedDataset('SYS2.PARMLIB')).toBe(true);
    });

    it('should NOT flag dev/test datasets', () => {
        expect(isProtectedDataset('HLQ.DEV.COBOL')).toBe(false);
        expect(isProtectedDataset('HLQ.TEST.SRC')).toBe(false);
        expect(isProtectedDataset('USER.PERSONAL.DATA')).toBe(false);
    });
});

describe('getEffectiveSafetyLevel', () => {
    it('should keep safe operations as safe in non-prod', () => {
        expect(getEffectiveSafetyLevel('safe', 'HLQ.DEV.SRC')).toBe('safe');
    });

    it('should keep safe operations as safe even in prod', () => {
        expect(getEffectiveSafetyLevel('safe', 'HLQ.PROD.SRC')).toBe('safe');
    });

    it('should escalate moderate to dangerous in prod', () => {
        expect(getEffectiveSafetyLevel('moderate', 'HLQ.PROD.JCL')).toBe('dangerous');
    });

    it('should keep moderate as moderate in non-prod', () => {
        expect(getEffectiveSafetyLevel('moderate', 'HLQ.DEV.JCL')).toBe('moderate');
    });

    it('should keep dangerous as dangerous everywhere', () => {
        expect(getEffectiveSafetyLevel('dangerous', 'HLQ.DEV.SRC')).toBe('dangerous');
        expect(getEffectiveSafetyLevel('dangerous', 'HLQ.PROD.SRC')).toBe('dangerous');
    });
});

describe('describeOperation', () => {
    it('should describe DELETE_MEMBER', () => {
        const desc = describeOperation('DELETE_MEMBER', {
            dataset: 'HLQ.COBOL.SRC',
            member: 'OLDPGM',
        });
        expect(desc).toContain('OLDPGM');
        expect(desc).toContain('HLQ.COBOL.SRC');
    });

    it('should describe DELETE_DATASET with IRRÉVERSIBLE', () => {
        const desc = describeOperation('DELETE_DATASET', {
            dataset: 'HLQ.OLD.DATA',
        });
        expect(desc).toContain('HLQ.OLD.DATA');
        expect(desc).toContain('IRRÉVERSIBLE');
    });

    it('should describe WRITE_MEMBER', () => {
        const desc = describeOperation('WRITE_MEMBER', {
            dataset: 'HLQ.COBOL.SRC',
            member: 'MYPGM',
        });
        expect(desc).toContain('HLQ.COBOL.SRC');
        expect(desc).toContain('MYPGM');
    });

    it('should describe CREATE_DATASET', () => {
        const desc = describeOperation('CREATE_DATASET', {
            name: 'HLQ.NEW.DATA',
            dsorg: 'PO',
        });
        expect(desc).toContain('HLQ.NEW.DATA');
        expect(desc).toContain('PO');
    });

    it('should describe CREATE_MEMBER', () => {
        const desc = describeOperation('CREATE_MEMBER', {
            dataset: 'HLQ.COBOL.SRC',
            member: 'NEWPGM',
        });
        expect(desc).toContain('HLQ.COBOL.SRC');
        expect(desc).toContain('NEWPGM');
    });

    it('should describe unknown intent using dataset fallback', () => {
        const desc = describeOperation('UNKNOWN_OP', { dataset: 'HLQ.SOME.DATA' });
        expect(desc).toContain('UNKNOWN_OP');
        expect(desc).toContain('HLQ.SOME.DATA');
    });

    it('should describe unknown intent using name fallback', () => {
        const desc = describeOperation('UNKNOWN_OP', { name: 'HLQ.SOME.DATA' });
        expect(desc).toContain('HLQ.SOME.DATA');
    });

    it('should describe unknown intent with no dataset/name using ?', () => {
        const desc = describeOperation('UNKNOWN_OP', {});
        expect(desc).toContain('?');
    });
});

// ============================================================
// Tests — requestConfirmation
// ============================================================

describe('requestConfirmation', () => {
    const makeStream = () => ({
        markdown: jest.fn(),
        button: jest.fn(),
        progress: jest.fn(),
        anchor: jest.fn(),
    } as unknown as vscode.ChatResponseStream);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return true immediately for safe operations', async () => {
        const stream = makeStream();
        const result = await requestConfirmation(stream, 'Read dataset', 'safe', 'HLQ.DEV.SRC');
        expect(result).toBe(true);
        expect(stream.markdown).not.toHaveBeenCalled();
    });

    it('should return true for moderate operations without modal', async () => {
        const stream = makeStream();
        const result = await requestConfirmation(stream, 'Write dataset', 'moderate', 'HLQ.DEV.SRC');
        expect(result).toBe(true);
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('Write dataset'));
    });

    it('should return true when user confirms dangerous operation', async () => {
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Confirmer');
        const stream = makeStream();
        const result = await requestConfirmation(stream, 'Delete dataset', 'dangerous', 'HLQ.DEV.SRC');
        expect(result).toBe(true);
        expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('✅'));
    });

    it('should return false when user cancels dangerous operation', async () => {
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Annuler');
        const stream = makeStream();
        const result = await requestConfirmation(stream, 'Delete dataset', 'dangerous', 'HLQ.DEV.SRC');
        expect(result).toBe(false);
        expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('❌'));
    });

    it('should return false when user dismisses the modal', async () => {
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
        const stream = makeStream();
        const result = await requestConfirmation(stream, 'Delete dataset', 'dangerous', 'HLQ.DEV.SRC');
        expect(result).toBe(false);
    });

    it('should show PROD prefix and zone warning for protected datasets', async () => {
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Confirmer');
        const stream = makeStream();
        await requestConfirmation(stream, 'Delete dataset', 'dangerous', 'HLQ.PROD.SRC');
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('[PROD]'),
            expect.anything(),
            'Confirmer',
            'Annuler'
        );
        expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('ZONE PROTÉGÉE'));
    });

    it('should use orange emoji for non-protected dangerous datasets', async () => {
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Confirmer');
        const stream = makeStream();
        await requestConfirmation(stream, 'Delete dataset', 'dangerous', 'HLQ.DEV.SRC');
        expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('🟠'));
    });

    it('should use red emoji for protected dangerous datasets', async () => {
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Confirmer');
        const stream = makeStream();
        await requestConfirmation(stream, 'Delete dataset', 'dangerous', 'HLQ.PROD.SRC');
        expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('🔴'));
    });
});

// ============================================================
// Tests — Intent safety mappings completeness
// ============================================================

describe('Intent safety mappings', () => {
    it('DS intents should all have a safety level', () => {
        const dsTypes = [
            'LIST_DATASETS', 'LIST_MEMBERS', 'READ_MEMBER', 'WRITE_MEMBER',
            'CREATE_DATASET', 'CREATE_MEMBER', 'DELETE_MEMBER', 'DELETE_DATASET',
            'SEARCH_CONTENT', 'DATASET_INFO',
        ];
        for (const type of dsTypes) {
            expect(INTENT_SAFETY).toHaveProperty(type);
        }
    });

    it('Jobs intents should all have a safety level', () => {
        const jobsTypes = [
            'LIST_JOBS', 'GET_JOB_STATUS', 'GET_JOB_OUTPUT', 'GET_SPOOL_FILE',
            'CANCEL_JOB', 'PURGE_JOB', 'MONITOR_JOB',
        ];
        for (const type of jobsTypes) {
            expect(JOBS_INTENT_SAFETY).toHaveProperty(type);
        }
    });

    it('Run intents should all have a safety level', () => {
        const runTypes = [
            'SUBMIT_DATASET', 'SUBMIT_INLINE', 'SUBMIT_AND_MONITOR', 'RESUBMIT',
        ];
        for (const type of runTypes) {
            expect(RUN_INTENT_SAFETY).toHaveProperty(type);
        }
    });

    it('Read operations should be safe', () => {
        expect(INTENT_SAFETY['LIST_DATASETS']).toBe('safe');
        expect(INTENT_SAFETY['READ_MEMBER']).toBe('safe');
        expect(JOBS_INTENT_SAFETY['LIST_JOBS']).toBe('safe');
        expect(JOBS_INTENT_SAFETY['GET_JOB_STATUS']).toBe('safe');
    });

    it('Delete operations should be dangerous', () => {
        expect(INTENT_SAFETY['DELETE_MEMBER']).toBe('dangerous');
        expect(INTENT_SAFETY['DELETE_DATASET']).toBe('dangerous');
        expect(JOBS_INTENT_SAFETY['CANCEL_JOB']).toBe('dangerous');
        expect(JOBS_INTENT_SAFETY['PURGE_JOB']).toBe('dangerous');
    });

    it('Submit operations should be at least moderate', () => {
        expect(['moderate', 'dangerous']).toContain(RUN_INTENT_SAFETY['SUBMIT_DATASET']);
        expect(['moderate', 'dangerous']).toContain(RUN_INTENT_SAFETY['SUBMIT_INLINE']);
    });
});
