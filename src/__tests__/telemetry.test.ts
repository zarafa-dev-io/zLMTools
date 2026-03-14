import { TelemetryService } from '../utils/telemetry';
import * as vscode from 'vscode';

// ============================================================
// Tests — Telemetry Service
// ============================================================

function makeContext(initialEvents: any[] = []): Partial<vscode.ExtensionContext> {
    return {
        globalState: {
            get: jest.fn().mockReturnValue(initialEvents),
            update: jest.fn(),
            keys: jest.fn(() => []),
            setKeysForSync: jest.fn(),
        },
    };
}

describe('TelemetryService', () => {
    let telemetry: TelemetryService;
    let mockContext: Partial<vscode.ExtensionContext>;

    beforeEach(() => {
        mockContext = makeContext();
        telemetry = new TelemetryService(mockContext as vscode.ExtensionContext);
    });

    describe('Instantiation', () => {
        it('should create TelemetryService instance', () => {
            expect(telemetry).toBeDefined();
            expect(telemetry).toBeInstanceOf(TelemetryService);
        });
    });

    describe('trackSuccess', () => {
        it('should track successful operation', () => {
            telemetry.trackSuccess('ds', 'LIST_DATASETS');
            expect(telemetry).toBeDefined();
        });

        it('should track with command and intentType', () => {
            telemetry.trackSuccess('jobs', 'GET_JOB_STATUS');
            telemetry.trackSuccess('run', 'SUBMIT_DATASET');
            expect(telemetry).toBeDefined();
        });

        it('should support profileName parameter', () => {
            telemetry.trackSuccess('ds', 'LIST_DATASETS', 'DEV1');
            telemetry.trackSuccess('jobs', 'GET_JOB_STATUS', 'PROD');
            expect(telemetry).toBeDefined();
        });

        it('should handle various commands', () => {
            const commands = ['ds', 'jobs', 'run', 'lpar'];
            
            for (const cmd of commands) {
                telemetry.trackSuccess(cmd, 'SOME_INTENT');
            }
            
            expect(telemetry).toBeDefined();
        });

        it('should handle various intent types', () => {
            const intents = [
                'LIST_DATASETS', 'READ_MEMBER', 'DELETE_DATASET',
                'LIST_JOBS', 'CANCEL_JOB',
                'SUBMIT_DATASET', 'RESUBMIT'
            ];
            
            for (const intent of intents) {
                telemetry.trackSuccess('ds', intent);
            }
            
            expect(telemetry).toBeDefined();
        });
    });

    describe('trackError', () => {
        it('should track error with message', () => {
            const error = new Error('Connection failed');
            telemetry.trackError('ds', error);
            expect(telemetry).toBeDefined();
        });

        it('should handle Error objects', () => {
            telemetry.trackError('jobs', new Error('Timeout'));
            telemetry.trackError('run', new Error('Invalid JCL'));
            expect(telemetry).toBeDefined();
        });

        it('should handle string errors', () => {
            telemetry.trackError('ds', 'Dataset not found');
            telemetry.trackError('jobs', 'Job cancelled');
            expect(telemetry).toBeDefined();
        });

        it('should handle null/undefined gracefully', () => {
            telemetry.trackError('ds', null);
            telemetry.trackError('jobs', undefined);
            expect(telemetry).toBeDefined();
        });

        it('should handle objects without message', () => {
            telemetry.trackError('run', { code: 'ERR_001', details: 'Unknown error' });
            expect(telemetry).toBeDefined();
        });
    });

    describe('trackDuration', () => {
        it('should track operation duration', () => {
            telemetry.trackSuccess('ds', 'LIST_DATASETS');
            telemetry.trackDuration('ds', 1500);
            expect(telemetry).toBeDefined();
        });

        it('should handle various duration values', () => {
            const durations = [100, 500, 1000, 2500, 5000, 10000];
            
            for (const duration of durations) {
                telemetry.trackSuccess('jobs', 'LIST_JOBS');
                telemetry.trackDuration('jobs', duration);
            }
            
            expect(telemetry).toBeDefined();
        });

        it('should handle rapid tracking', () => {
            telemetry.trackSuccess('ds', 'READ_MEMBER');
            telemetry.trackDuration('ds', 750);
            
            telemetry.trackSuccess('ds', 'WRITE_MEMBER');
            telemetry.trackDuration('ds', 1200);
            
            expect(telemetry).toBeDefined();
        });
    });

    describe('Event tracking workflow', () => {
        it('should track complete operation lifecycle', () => {
            // User initiates operation
            telemetry.trackSuccess('ds', 'LIST_DATASETS', 'DEV1');
            
            // Operation duration is recorded
            telemetry.trackDuration('ds', 1250);
            
            expect(telemetry).toBeDefined();
        });

        it('should track operation with error', () => {
            // User initiates operation
            telemetry.trackSuccess('jobs', 'CANCEL_JOB');
            
            // Operation fails
            telemetry.trackError('jobs', 'Cannot cancel completed job');
            
            expect(telemetry).toBeDefined();
        });

        it('should track multiple sequential operations', () => {
            // First operation
            telemetry.trackSuccess('ds', 'LIST_DATASETS');
            telemetry.trackDuration('ds', 800);
            
            // Second operation
            telemetry.trackSuccess('jobs', 'GET_JOB_STATUS');
            telemetry.trackDuration('jobs', 600);
            
            // Third operation
            telemetry.trackSuccess('run', 'SUBMIT_DATASET', 'PROD');
            telemetry.trackDuration('run', 3000);
            
            expect(telemetry).toBeDefined();
        });

        it('should track operations with mixed success/failure', () => {
            telemetry.trackSuccess('ds', 'READ_MEMBER');
            telemetry.trackDuration('ds', 500);
            
            telemetry.trackError('jobs', new Error('Connection timeout'));
            
            telemetry.trackSuccess('run', 'SUBMIT_DATASET');
            telemetry.trackDuration('run', 2000);
            
            expect(telemetry).toBeDefined();
        });
    });

    describe('Data persistence', () => {
        it('should load existing events from globalState', () => {
            const existingEvents = [
                {
                    timestamp: '2025-01-01T10:00:00Z',
                    command: 'ds',
                    intentType: 'LIST_DATASETS',
                    success: true,
                },
            ];

            const tel = new TelemetryService(makeContext(existingEvents) as vscode.ExtensionContext);
            expect(tel).toBeDefined();
        });

        it('should call globalState.update after trackSuccess', () => {
            telemetry.trackSuccess('ds', 'LIST_DATASETS');
            expect(mockContext.globalState!.update).toHaveBeenCalledWith('zos.telemetry', expect.any(Array));
        });

        it('should call globalState.update after trackError', () => {
            telemetry.trackError('ds', new Error('fail'));
            expect(mockContext.globalState!.update).toHaveBeenCalledWith('zos.telemetry', expect.any(Array));
        });

        it('should call globalState.update after trackDuration', () => {
            telemetry.trackSuccess('ds', 'LIST_DATASETS');
            (mockContext.globalState!.update as jest.Mock).mockClear();
            telemetry.trackDuration('ds', 500);
            expect(mockContext.globalState!.update).toHaveBeenCalledWith('zos.telemetry', expect.any(Array));
        });

        it('should NOT call globalState.update when trackDuration finds no matching event', () => {
            telemetry.trackDuration('ds', 500);
            expect(mockContext.globalState!.update).not.toHaveBeenCalled();
        });

        it('should NOT update duration when last event is from a different command', () => {
            telemetry.trackSuccess('jobs', 'LIST_JOBS');
            (mockContext.globalState!.update as jest.Mock).mockClear();
            telemetry.trackDuration('ds', 500);
            expect(mockContext.globalState!.update).not.toHaveBeenCalled();
        });

        it('should NOT overwrite an already-set duration', () => {
            telemetry.trackSuccess('ds', 'LIST_DATASETS');
            telemetry.trackDuration('ds', 500);
            (mockContext.globalState!.update as jest.Mock).mockClear();
            telemetry.trackDuration('ds', 999);
            // Second call should not trigger persist
            expect(mockContext.globalState!.update).not.toHaveBeenCalled();
        });

        it('should cap events at 1000 and keep the most recent', () => {
            for (let i = 0; i < 1005; i++) {
                telemetry.trackSuccess('ds', `INTENT_${i}`);
            }
            // After 1005 inserts the internal array should be capped at 1000
            // We verify by checking that the update was called with an array of length 1000
            const lastCall = (mockContext.globalState!.update as jest.Mock).mock.calls.at(-1);
            expect(lastCall[1]).toHaveLength(1000);
        });

        it('should log to outputChannel on trackSuccess', () => {
            const results = (vscode.window.createOutputChannel as jest.Mock).mock.results;
            const mockChannel = results[results.length - 1].value;
            telemetry.trackSuccess('ds', 'LIST_DATASETS');
            expect(mockChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('✅'));
            expect(mockChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('/ds'));
            expect(mockChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('LIST_DATASETS'));
        });

        it('should log to outputChannel on trackError', () => {
            const results = (vscode.window.createOutputChannel as jest.Mock).mock.results;
            const mockChannel = results[results.length - 1].value;
            telemetry.trackError('jobs', new Error('timeout'));
            expect(mockChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('❌'));
        });
    });

    describe('Profile tracking', () => {
        it('should track operations by profile', () => {
            telemetry.trackSuccess('ds', 'LIST_DATASETS', 'DEV1');
            telemetry.trackSuccess('ds', 'READ_MEMBER', 'PROD');
            telemetry.trackSuccess('jobs', 'LIST_JOBS', 'STAGING');
            
            expect(telemetry).toBeDefined();
        });

        it('should track operations without profile', () => {
            telemetry.trackSuccess('lpar', 'LIST');
            telemetry.trackSuccess('ds', 'LIST_DATASETS');
            
            expect(telemetry).toBeDefined();
        });
    });

    describe('Command and intent variety', () => {
        it('should handle all command types', () => {
            const commands = ['ds', 'jobs', 'run', 'lpar', 'tso', 'uss'];
            
            for (const cmd of commands) {
                telemetry.trackSuccess(cmd, 'SOME_INTENT');
            }
            
            expect(telemetry).toBeDefined();
        });

        it('should handle all dataset intents', () => {
            const intents = [
                'LIST_DATASETS', 'LIST_MEMBERS', 'READ_MEMBER', 'WRITE_MEMBER',
                'CREATE_DATASET', 'CREATE_MEMBER', 'DELETE_MEMBER', 'DELETE_DATASET',
                'SEARCH_CONTENT', 'DATASET_INFO',
            ];
            
            for (const intent of intents) {
                telemetry.trackSuccess('ds', intent);
            }
            
            expect(telemetry).toBeDefined();
        });

        it('should handle all job intents', () => {
            const intents = [
                'LIST_JOBS', 'GET_JOB_STATUS', 'GET_JOB_OUTPUT',
                'CANCEL_JOB', 'PURGE_JOB', 'MONITOR_JOB',
            ];
            
            for (const intent of intents) {
                telemetry.trackSuccess('jobs', intent);
            }
            
            expect(telemetry).toBeDefined();
        });

        it('should handle all run intents', () => {
            const intents = [
                'SUBMIT_DATASET', 'SUBMIT_INLINE', 'SUBMIT_AND_MONITOR', 'RESUBMIT',
            ];
            
            for (const intent of intents) {
                telemetry.trackSuccess('run', intent);
            }
            
            expect(telemetry).toBeDefined();
        });
    });

    describe('Timestamp handling', () => {
        it('should record operations with timestamps', () => {
            const before = Date.now();
            telemetry.trackSuccess('ds', 'LIST_DATASETS');
            const after = Date.now();
            
            expect(telemetry).toBeDefined();
            expect(before).toBeLessThanOrEqual(after);
        });

        it('should track operations across time', () => {
            telemetry.trackSuccess('ds', 'READ_MEMBER', 'DEV1');
            
            // Simulate time passing
            jest.useFakeTimers();
            jest.advanceTimersByTime(1000);
            
            telemetry.trackSuccess('jobs', 'GET_JOB_STATUS', 'PROD');
            
            jest.useRealTimers();
            
            expect(telemetry).toBeDefined();
        });
    });

    describe('generateReport', () => {
        it('should return N/A for success rate and duration when no events', async () => {
            const report = await telemetry.generateReport();
            expect(report).toContain('N/A%');
            expect(report).toContain('N/A');
            expect(report).toContain('Total opérations | 0');
        });

        it('should compute correct success rate', async () => {
            telemetry.trackSuccess('ds', 'LIST_DATASETS');
            telemetry.trackSuccess('ds', 'READ_MEMBER');
            telemetry.trackError('ds', new Error('fail'));
            // 2 successes out of 3 = 66.7%
            const report = await telemetry.generateReport();
            expect(report).toContain('66.7%');
            expect(report).toContain('Total opérations | 3');
        });

        it('should compute 100% success rate when no errors', async () => {
            telemetry.trackSuccess('ds', 'LIST_DATASETS');
            telemetry.trackSuccess('jobs', 'LIST_JOBS');
            const report = await telemetry.generateReport();
            expect(report).toContain('100.0%');
        });

        it('should compute average duration', async () => {
            telemetry.trackSuccess('ds', 'LIST_DATASETS');
            telemetry.trackDuration('ds', 2000); // 2s
            telemetry.trackSuccess('jobs', 'LIST_JOBS');
            telemetry.trackDuration('jobs', 4000); // 4s => avg = 3s
            const report = await telemetry.generateReport();
            expect(report).toContain('3.00s');
        });

        it('should show N/A for duration when no event has duration', async () => {
            telemetry.trackSuccess('ds', 'LIST_DATASETS');
            const report = await telemetry.generateReport();
            expect(report).toContain('N/As');
        });

        it('should list commands sorted by usage', async () => {
            telemetry.trackSuccess('jobs', 'LIST_JOBS');
            telemetry.trackSuccess('jobs', 'GET_JOB_STATUS');
            telemetry.trackSuccess('ds', 'LIST_DATASETS');
            const report = await telemetry.generateReport();
            const jobsIdx = report.indexOf('/jobs');
            const dsIdx = report.indexOf('/ds');
            // jobs (2) should appear before ds (1)
            expect(jobsIdx).toBeLessThan(dsIdx);
        });

        it('should list intents sorted by usage', async () => {
            telemetry.trackSuccess('ds', 'LIST_DATASETS');
            telemetry.trackSuccess('ds', 'LIST_DATASETS');
            telemetry.trackSuccess('ds', 'READ_MEMBER');
            const report = await telemetry.generateReport();
            const listIdx = report.indexOf('LIST_DATASETS');
            const readIdx = report.indexOf('READ_MEMBER');
            expect(listIdx).toBeLessThan(readIdx);
        });

        it('should exclude events older than 30 days', async () => {
            // Inject an old event directly via constructor
            const oldTimestamp = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
            const ctx = makeContext([
                { timestamp: oldTimestamp, command: 'ds', intentType: 'OLD_INTENT', success: true },
            ]);
            const tel = new TelemetryService(ctx as vscode.ExtensionContext);
            const report = await tel.generateReport();
            expect(report).toContain('Total opérations | 0');
            expect(report).not.toContain('OLD_INTENT');
        });

        it('should include events from exactly 30 days ago', async () => {
            // Event just inside the 30-day window
            const recentTimestamp = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
            const ctx = makeContext([
                { timestamp: recentTimestamp, command: 'ds', intentType: 'RECENT_INTENT', success: true },
            ]);
            const tel = new TelemetryService(ctx as vscode.ExtensionContext);
            const report = await tel.generateReport();
            expect(report).toContain('RECENT_INTENT');
        });

        it('should not include intent line when event has no intentType', async () => {
            telemetry.trackError('ds', 'some error'); // trackError does not set intentType
            const report = await telemetry.generateReport();
            // The "Par opération" section should have no entries
            const intentSectionIdx = report.indexOf('## Par opération');
            const afterSection = report.slice(intentSectionIdx + '## Par opération'.length).trim();
            expect(afterSection).toBe('');
        });
    });

    describe('Integration scenarios', () => {
        it('should track typical user session', () => {
            // User switches to PROD
            telemetry.trackSuccess('lpar', 'USE', 'PROD');
            
            // User lists datasets
            telemetry.trackSuccess('ds', 'LIST_DATASETS', 'PROD');
            telemetry.trackDuration('ds', 1500);
            
            // User reads a member
            telemetry.trackSuccess('ds', 'READ_MEMBER', 'PROD');
            telemetry.trackDuration('ds', 450);
            
            // User checks job status
            telemetry.trackSuccess('jobs', 'GET_JOB_STATUS', 'PROD');
            telemetry.trackDuration('jobs', 800);
            
            expect(telemetry).toBeDefined();
        });

        it('should track session with errors', () => {
            telemetry.trackSuccess('ds', 'LIST_DATASETS');
            
            telemetry.trackError('ds', 'Connection timeout');
            
            telemetry.trackSuccess('jobs', 'LIST_JOBS');
            telemetry.trackDuration('jobs', 2000);
            
            expect(telemetry).toBeDefined();
        });

        it('should track high-volume operations', () => {
            for (let i = 0; i < 50; i++) {
                const command = ['ds', 'jobs', 'run'][i % 3];
                const succeeded = Math.random() > 0.1; // 90% success rate
                
                if (succeeded) {
                    telemetry.trackSuccess(command, 'INTENT_' + i);
                    telemetry.trackDuration(command, Math.random() * 5000);
                } else {
                    telemetry.trackError(command, `Error ${i}`);
                }
            }
            
            expect(telemetry).toBeDefined();
        });
    });
});
