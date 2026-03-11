import {
    ZosChatResult,
    ZosFollowup,
    createResult,
    followup,
} from '../types/chat-result';

// ============================================================
// Tests — Chat Result types and helpers
// ============================================================

describe('ZosFollowup', () => {
    it('should create a followup with all properties', () => {
        const f: ZosFollowup = {
            label: '📁 List datasets',
            prompt: 'list datasets HLQ.**',
            command: 'ds',
        };

        expect(f.label).toBe('📁 List datasets');
        expect(f.prompt).toBe('list datasets HLQ.**');
        expect(f.command).toBe('ds');
    });

    it('should allow followup without command property', () => {
        const f: ZosFollowup = {
            label: 'Next step',
            prompt: 'some prompt',
        };

        expect(f.label).toBe('Next step');
        expect(f.prompt).toBe('some prompt');
        expect(f.command).toBeUndefined();
    });

    it('should handle empty strings', () => {
        const f: ZosFollowup = {
            label: '',
            prompt: '',
            command: 'ds',
        };

        expect(f.label).toBe('');
        expect(f.prompt).toBe('');
    });

    it('should handle special characters in label and prompt', () => {
        const f: ZosFollowup = {
            label: '🔍 Chercher "PERFORM" dans les données',
            prompt: 'search "COBOL" in HLQ.PROD.** with options',
            command: 'ds',
        };

        expect(f.label).toContain('🔍');
        expect(f.label).toContain('PERFORM');
        expect(f.prompt).toContain('COBOL');
    });
});

describe('ZosChatResult', () => {
    it('should have correct structure', () => {
        const result: ZosChatResult = {
            metadata: {
                command: 'ds',
                intentType: 'LIST_DATASETS',
                followups: [],
            },
        };

        expect(result.metadata).toBeDefined();
        expect(result.metadata.command).toBe('ds');
        expect(result.metadata.intentType).toBe('LIST_DATASETS');
        expect(result.metadata.followups).toEqual([]);
    });

    it('should support followups array', () => {
        const result: ZosChatResult = {
            metadata: {
                command: 'jobs',
                intentType: 'LIST_JOBS',
                followups: [
                    {
                        label: 'Get job details',
                        prompt: 'show job JOB12345',
                        command: 'jobs',
                    },
                    {
                        label: 'Cancel job',
                        prompt: 'cancel JOB12345',
                        command: 'jobs',
                    },
                ],
            },
        };

        expect(result.metadata.followups).toHaveLength(2);
        expect(result.metadata.followups[0].label).toBe('Get job details');
        expect(result.metadata.followups[1].prompt).toBe('cancel JOB12345');
    });

    it('should allow undefined intentType', () => {
        const result: ZosChatResult = {
            metadata: {
                command: 'ds',
                intentType: undefined,
                followups: [],
            },
        };

        expect(result.metadata.intentType).toBeUndefined();
    });
});

describe('createResult helper', () => {
    it('should create result with all parameters', () => {
        const followups: ZosFollowup[] = [
            { label: 'Next', prompt: 'next prompt', command: 'ds' },
        ];
        const result = createResult('ds', 'LIST_DATASETS', followups);

        expect(result.metadata.command).toBe('ds');
        expect(result.metadata.intentType).toBe('LIST_DATASETS');
        expect(result.metadata.followups).toEqual(followups);
    });

    it('should create result with undefined intentType', () => {
        const result = createResult('jobs', undefined, []);

        expect(result.metadata.command).toBe('jobs');
        expect(result.metadata.intentType).toBeUndefined();
        expect(result.metadata.followups).toEqual([]);
    });

    it('should create result with empty followups', () => {
        const result = createResult('run', 'SUBMIT_DATASET', []);

        expect(result.metadata.followups).toEqual([]);
        expect(result.metadata.followups).toHaveLength(0);
    });

    it('should create result with multiple followups in order', () => {
        const followups = [
            { label: 'First', prompt: 'first' },
            { label: 'Second', prompt: 'second', command: 'ds' },
            { label: 'Third', prompt: 'third' },
        ];
        const result = createResult('ds', 'READ_MEMBER', followups);

        expect(result.metadata.followups).toHaveLength(3);
        expect(result.metadata.followups[0].label).toBe('First');
        expect(result.metadata.followups[1].label).toBe('Second');
        expect(result.metadata.followups[2].label).toBe('Third');
    });

    it('should preserve followup references (not clone)', () => {
        const followups: ZosFollowup[] = [
            { label: 'Test', prompt: 'test' },
        ];
        const result = createResult('ds', 'LIST_MEMBERS', followups);

        // Modify original and verify it affects result
        followups[0].label = 'Modified';
        expect(result.metadata.followups[0].label).toBe('Modified');
    });

    it('should handle commands with special characters', () => {
        const result = createResult('ds', 'LIST_DATASETS', []);
        expect(result.metadata.command).toBe('ds');

        const result2 = createResult('lpar', 'SWITCH_LPAR', []);
        expect(result2.metadata.command).toBe('lpar');
    });
});

describe('followup helper', () => {
    it('should create followup with label and prompt', () => {
        const f = followup('List datasets', 'list HLQ.**');

        expect(f.label).toBe('List datasets');
        expect(f.prompt).toBe('list HLQ.**');
        expect(f.command).toBeUndefined();
    });

    it('should create followup with command', () => {
        const f = followup('📁 Show members', 'show members HLQ.COBOL.SRC', 'ds');

        expect(f.label).toBe('📁 Show members');
        expect(f.prompt).toBe('show members HLQ.COBOL.SRC');
        expect(f.command).toBe('ds');
    });

    it('should create followup with special characters', () => {
        const f = followup(
            '🔍 Chercher "PERFORM"',
            'search "PERFORM" in HLQ.COBOL.SRC',
            'ds'
        );

        expect(f.label).toContain('🔍');
        expect(f.label).toContain('PERFORM');
    });

    it('should create followup with empty strings', () => {
        const f = followup('', '');
        expect(f.label).toBe('');
        expect(f.prompt).toBe('');
    });

    it('should create followup with multiline prompt', () => {
        const multilinePrompt = 'create dataset HLQ.NEW.SRC\nwith LRECL=80\nand BLKSIZE=800';
        const f = followup('Create dataset', multilinePrompt, 'ds');

        expect(f.prompt).toContain('create dataset');
        expect(f.prompt).toContain('LRECL=80');
        expect(f.prompt).toContain('BLKSIZE=800');
    });
});

describe('Integration: Result building workflow', () => {
    it('should build typical dataset operation result', () => {
        const followups = [
            followup('📁 List datasets', 'list datasets HLQ.**', 'ds'),
            followup('📄 List members', 'show members HLQ.COBOL.SRC', 'ds'),
            followup('📝 Read member', 'read HLQ.COBOL.SRC(PGMA)', 'ds'),
        ];
        const result = createResult('ds', 'LIST_DATASETS', followups);

        expect(result.metadata.command).toBe('ds');
        expect(result.metadata.intentType).toBe('LIST_DATASETS');
        expect(result.metadata.followups).toHaveLength(3);
        expect(result.metadata.followups[0].command).toBe('ds');
    });

    it('should build job operation result', () => {
        const followups = [
            followup('📊 Get status', 'status JOB12345', 'jobs'),
            followup('📋 Get output', 'output JOB12345', 'jobs'),
            followup('❌ Cancel job', 'cancel JOB12345', 'jobs'),
        ];
        const result = createResult('jobs', 'LIST_JOBS', followups);

        expect(result.metadata.command).toBe('jobs');
        expect(result.metadata.followups).toHaveLength(3);
    });

    it('should build result with no followups (error case)', () => {
        const result = createResult('ds', undefined, []);

        expect(result.metadata.command).toBe('ds');
        expect(result.metadata.intentType).toBeUndefined();
        expect(result.metadata.followups).toHaveLength(0);
    });
});
