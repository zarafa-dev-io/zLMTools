// ============================================================
// Tests — Intent Classifiers
// ============================================================

import * as vscode from 'vscode';
import { DsIntentClassifier } from '../intents/ds.classifier';
import { JobsIntentClassifier } from '../intents/jobs.classifier';
import { RunIntentClassifier } from '../intents/run.classifier';

// ── Helpers ───────────────────────────────────────────────────

const noCancel: vscode.CancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: jest.fn() as any,
};

/** Create a mock LLM model that streams the given text */
function makeModel(text: string): vscode.LanguageModelChat {
    return {
        sendRequest: jest.fn().mockResolvedValue({
            text: (async function* () { yield text; })(),
        }),
    } as unknown as vscode.LanguageModelChat;
}

/** Create a model that streams text in multiple fragments */
function makeFragmentedModel(fragments: string[]): vscode.LanguageModelChat {
    return {
        sendRequest: jest.fn().mockResolvedValue({
            text: (async function* () {
                for (const f of fragments) { yield f; }
            })(),
        }),
    } as unknown as vscode.LanguageModelChat;
}

// ============================================================
// DsIntentClassifier
// ============================================================

describe('DsIntentClassifier', () => {
    let classifier: DsIntentClassifier;

    beforeEach(() => {
        classifier = new DsIntentClassifier();
    });

    it('should return parsed intent for valid JSON response', async () => {
        const intent = { type: 'LIST_DATASETS', pattern: 'HLQ.*' };
        const model = makeModel(JSON.stringify(intent));
        const result = await classifier.classify('liste mes datasets HLQ', noCancel, model);
        expect(result).toMatchObject(intent);
    });

    it('should return null when type is UNKNOWN', async () => {
        const model = makeModel(JSON.stringify({ type: 'UNKNOWN', reason: 'unclear request' }));
        const result = await classifier.classify('quelque chose bizarre', noCancel, model);
        expect(result).toBeNull();
    });

    it('should return null when response is not valid JSON', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const model = makeModel('NOT JSON AT ALL');
        const result = await classifier.classify('requête', noCancel, model);
        expect(result).toBeNull();
        consoleSpy.mockRestore();
    });

    it('should clean backtick-wrapped JSON before parsing', async () => {
        const intent = { type: 'READ_MEMBER', dataset: 'HLQ.COBOL', member: 'HELLO' };
        const wrapped = '```json\n' + JSON.stringify(intent) + '\n```';
        const model = makeModel(wrapped);
        const result = await classifier.classify('lire HELLO dans HLQ.COBOL', noCancel, model);
        expect(result).toMatchObject(intent);
    });

    it('should clean plain backtick blocks', async () => {
        const intent = { type: 'DELETE_DATASET', dataset: 'HLQ.OLD' };
        const wrapped = '```' + JSON.stringify(intent) + '```';
        const model = makeModel(wrapped);
        const result = await classifier.classify('supprimer HLQ.OLD', noCancel, model);
        expect(result).toMatchObject(intent);
    });

    it('should accumulate multiple response fragments', async () => {
        const intent = { type: 'LIST_MEMBERS', dataset: 'HLQ.COBOL' };
        const json = JSON.stringify(intent);
        // Split the JSON into 3 fragments
        const model = makeFragmentedModel([
            json.slice(0, 10),
            json.slice(10, 20),
            json.slice(20),
        ]);
        const result = await classifier.classify('liste les membres', noCancel, model);
        expect(result).toMatchObject(intent);
    });

    it('should include the user prompt in the message sent to the model', async () => {
        const model = makeModel(JSON.stringify({ type: 'UNKNOWN' }));
        await classifier.classify('ma requête spéciale', noCancel, model);
        const [messages] = (model.sendRequest as jest.Mock).mock.calls[0];
        expect(messages[0].content).toContain('ma requête spéciale');
    });

    it('should pass cancellation token to model.sendRequest', async () => {
        const model = makeModel(JSON.stringify({ type: 'UNKNOWN' }));
        await classifier.classify('test', noCancel, model);
        expect(model.sendRequest).toHaveBeenCalledWith(
            expect.any(Array),
            {},
            noCancel
        );
    });

    it('should handle various intent types correctly', async () => {
        const intents = [
            { type: 'LIST_DATASETS', pattern: 'HLQ.*' },
            { type: 'LIST_MEMBERS', dataset: 'HLQ.COBOL' },
            { type: 'WRITE_MEMBER', dataset: 'HLQ.COBOL', member: 'PROG', content: 'CODE' },
            { type: 'CREATE_DATASET', name: 'HLQ.NEW', dsorg: 'PO' },
            { type: 'DELETE_MEMBER', dataset: 'HLQ.COBOL', member: 'OLD' },
            { type: 'SEARCH_CONTENT', dataset: 'HLQ.COBOL', searchTerm: 'CALL' },
        ];
        for (const intent of intents) {
            const model = makeModel(JSON.stringify(intent));
            const result = await classifier.classify('test', noCancel, model);
            expect(result?.type).toBe(intent.type);
        }
    });
});

// ============================================================
// JobsIntentClassifier
// ============================================================

describe('JobsIntentClassifier', () => {
    let classifier: JobsIntentClassifier;

    beforeEach(() => {
        classifier = new JobsIntentClassifier();
    });

    it('should return parsed intent for valid JSON', async () => {
        const intent = { type: 'LIST_JOBS', owner: 'USER', prefix: 'BATCH*' };
        const model = makeModel(JSON.stringify(intent));
        const result = await classifier.classify('liste mes jobs BATCH', noCancel, model);
        expect(result).toMatchObject(intent);
    });

    it('should return null when type is UNKNOWN', async () => {
        const model = makeModel(JSON.stringify({ type: 'UNKNOWN', reason: 'unclear' }));
        const result = await classifier.classify('blabla', noCancel, model);
        expect(result).toBeNull();
    });

    it('should return null for invalid JSON', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const model = makeModel('INVALID');
        const result = await classifier.classify('test', noCancel, model);
        expect(result).toBeNull();
        consoleSpy.mockRestore();
    });

    it('should clean backtick-wrapped JSON', async () => {
        const intent = { type: 'GET_JOB_STATUS', jobId: 'JOB12345' };
        const model = makeModel('```json\n' + JSON.stringify(intent) + '\n```');
        const result = await classifier.classify('statut JOB12345', noCancel, model);
        expect(result).toMatchObject(intent);
    });

    it('should accumulate multiple fragments', async () => {
        const intent = { type: 'CANCEL_JOB', jobId: 'JOB99999' };
        const json = JSON.stringify(intent);
        const model = makeFragmentedModel([json.slice(0, 8), json.slice(8)]);
        const result = await classifier.classify('annuler job', noCancel, model);
        expect(result).toMatchObject(intent);
    });

    it('should handle all jobs intent types', async () => {
        const intents = [
            { type: 'LIST_JOBS', owner: '*' },
            { type: 'GET_JOB_STATUS', jobId: 'JOB12345' },
            { type: 'GET_JOB_OUTPUT', jobId: 'JOB12345' },
            { type: 'CANCEL_JOB', jobId: 'JOB12345' },
            { type: 'PURGE_JOB', jobId: 'JOB12345' },
            { type: 'MONITOR_JOB', jobId: 'JOB12345' },
        ];
        for (const intent of intents) {
            const model = makeModel(JSON.stringify(intent));
            const result = await classifier.classify('test', noCancel, model);
            expect(result?.type).toBe(intent.type);
        }
    });
});

// ============================================================
// RunIntentClassifier
// ============================================================

describe('RunIntentClassifier', () => {
    let classifier: RunIntentClassifier;

    beforeEach(() => {
        classifier = new RunIntentClassifier();
    });

    it('should return parsed intent for valid JSON', async () => {
        const intent = { type: 'SUBMIT_DATASET', dataset: 'HLQ.JCL', member: 'MYJOB' };
        const model = makeModel(JSON.stringify(intent));
        const result = await classifier.classify('soumettre MYJOB', noCancel, model);
        expect(result).toMatchObject(intent);
    });

    it('should return null when type is UNKNOWN', async () => {
        const model = makeModel(JSON.stringify({ type: 'UNKNOWN', reason: 'unclear' }));
        const result = await classifier.classify('?', noCancel, model);
        expect(result).toBeNull();
    });

    it('should return null for invalid JSON', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const model = makeModel('not json');
        const result = await classifier.classify('test', noCancel, model);
        expect(result).toBeNull();
        consoleSpy.mockRestore();
    });

    it('should clean backtick-wrapped JSON', async () => {
        const intent = { type: 'SUBMIT_AND_MONITOR', dataset: 'HLQ.JCL', member: 'BATCH' };
        const model = makeModel('```json\n' + JSON.stringify(intent) + '\n```');
        const result = await classifier.classify('soumettre et suivre', noCancel, model);
        expect(result).toMatchObject(intent);
    });

    it('should accumulate multiple fragments', async () => {
        const intent = { type: 'RESUBMIT', jobId: 'JOB11111' };
        const json = JSON.stringify(intent);
        const model = makeFragmentedModel([json.slice(0, 5), json.slice(5, 15), json.slice(15)]);
        const result = await classifier.classify('resoumettre', noCancel, model);
        expect(result).toMatchObject(intent);
    });

    it('should handle all run intent types', async () => {
        const intents = [
            { type: 'SUBMIT_DATASET', dataset: 'HLQ.JCL', member: 'MYJOB' },
            { type: 'SUBMIT_INLINE', jcl: '//JOB JOB ...' },
            { type: 'SUBMIT_AND_MONITOR', dataset: 'HLQ.JCL', member: 'MYJOB' },
            { type: 'RESUBMIT', jobId: 'JOB12345' },
        ];
        for (const intent of intents) {
            const model = makeModel(JSON.stringify(intent));
            const result = await classifier.classify('test', noCancel, model);
            expect(result?.type).toBe(intent.type);
        }
    });
});
