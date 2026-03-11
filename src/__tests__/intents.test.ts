import {
    DsIntent,
    ListDatasetsIntent,
    ListMembersIntent,
    ReadMemberIntent,
    CreateDatasetIntent,
    DeleteMemberIntent,
    DeleteDatasetIntent,
    SearchContentIntent,
    DatasetInfoIntent,
    INTENT_SAFETY,
} from '../intents/ds.schemas';
import {
    JobsIntent,
    ListJobsIntent,
    GetJobStatusIntent,
    GetJobOutputIntent,
    GetSpoolFileIntent,
    CancelJobIntent,
    PurgeJobIntent,
    MonitorJobIntent,
    JOBS_INTENT_SAFETY,
} from '../intents/jobs.schemas';
import {
    RunIntent,
    SubmitDatasetIntent,
    SubmitInlineIntent,
    SubmitAndMonitorIntent,
    ResubmitIntent,
    SubmitLocalFileIntent,
    RUN_INTENT_SAFETY,
} from '../intents/run.schemas';

// ============================================================
// Tests — Intent Schemas Completeness & Type Safety
// ============================================================

describe('Dataset Intent Schemas', () => {
    describe('ListDatasetsIntent', () => {
        it('should create valid LIST_DATASETS intent', () => {
            const intent: ListDatasetsIntent = {
                type: 'LIST_DATASETS',
                pattern: 'HLQ.COBOL.**',
            };

            expect(intent.type).toBe('LIST_DATASETS');
            expect(intent.pattern).toBe('HLQ.COBOL.**');
        });

        it('should handle various dataset patterns', () => {
            const patterns = [
                'HLQ.**',
                'HLQ.COBOL.*',
                'HLQ.*.SRC',
                'SYS1.*',
                'USER.DATA.**',
            ];

            for (const pattern of patterns) {
                const intent: ListDatasetsIntent = {
                    type: 'LIST_DATASETS',
                    pattern,
                };
                expect(intent.pattern).toBe(pattern);
            }
        });
    });

    describe('ListMembersIntent', () => {
        it('should create valid LIST_MEMBERS intent', () => {
            const intent: ListMembersIntent = {
                type: 'LIST_MEMBERS',
                dataset: 'HLQ.COBOL.SRC',
            };

            expect(intent.type).toBe('LIST_MEMBERS');
            expect(intent.dataset).toBe('HLQ.COBOL.SRC');
        });

        it('should support optional pattern', () => {
            const intent: ListMembersIntent = {
                type: 'LIST_MEMBERS',
                dataset: 'HLQ.COBOL.SRC',
                pattern: 'PG*',
            };

            expect(intent.pattern).toBe('PG*');
        });
    });

    describe('ReadMemberIntent', () => {
        it('should create valid READ_MEMBER intent', () => {
            const intent: ReadMemberIntent = {
                type: 'READ_MEMBER',
                dataset: 'HLQ.COBOL.SRC',
                member: 'PGMA',
            };

            expect(intent.type).toBe('READ_MEMBER');
            expect(intent.dataset).toBe('HLQ.COBOL.SRC');
            expect(intent.member).toBe('PGMA');
        });
    });

    describe('CreateDatasetIntent', () => {
        it('should create simple PARTITIONED dataset intent', () => {
            const intent: CreateDatasetIntent = {
                type: 'CREATE_DATASET',
                name: 'HLQ.NEW.SRC',
                dstype: 'PARTITIONED',
            };

            expect(intent.type).toBe('CREATE_DATASET');
            expect(intent.dstype).toBe('PARTITIONED');
        });

        it('should create SEQUENTIAL dataset with attributes', () => {
            const intent: CreateDatasetIntent = {
                type: 'CREATE_DATASET',
                name: 'HLQ.WORK.DATA',
                dstype: 'SEQUENTIAL',
                lrecl: 256,
                recfm: 'VB',
                primary: 10,
                alcunit: 'TRK',
            };

            expect(intent.dstype).toBe('SEQUENTIAL');
            expect(intent.lrecl).toBe(256);
            expect(intent.recfm).toBe('VB');
        });

        it('should create dataset using likeDataset', () => {
            const intent: CreateDatasetIntent = {
                type: 'CREATE_DATASET',
                name: 'HLQ.COPY.SRC',
                likeDataset: 'HLQ.ORIG.SRC',
            };

            expect(intent.likeDataset).toBe('HLQ.ORIG.SRC');
        });

        it('should support all dstype variants', () => {
            const types: ('PARTITIONED' | 'SEQUENTIAL' | 'CLASSIC' | 'BINARY' | 'C')[] = [
                'PARTITIONED', 'SEQUENTIAL', 'CLASSIC', 'BINARY', 'C'
            ];

            for (const dstype of types) {
                const intent: CreateDatasetIntent = {
                    type: 'CREATE_DATASET',
                    name: `HLQ.TEST.${dstype}`,
                    dstype,
                };
                expect(intent.dstype).toBe(dstype);
            }
        });

        it('should support SMS attributes', () => {
            const intent: CreateDatasetIntent = {
                type: 'CREATE_DATASET',
                name: 'HLQ.SMS.DATA',
                volser: 'VOL001',
                storclass: 'STORCLS1',
                mgntclass: 'MGNTCLS1',
                dataclass: 'DATACLS1',
            };

            expect(intent.volser).toBe('VOL001');
            expect(intent.storclass).toBe('STORCLS1');
        });
    });

    describe('DeleteMemberIntent', () => {
        it('should create valid DELETE_MEMBER intent', () => {
            const intent: DeleteMemberIntent = {
                type: 'DELETE_MEMBER',
                dataset: 'HLQ.COBOL.SRC',
                member: 'OLDPGM',
            };

            expect(intent.type).toBe('DELETE_MEMBER');
            expect(intent.member).toBe('OLDPGM');
        });
    });

    describe('DeleteDatasetIntent', () => {
        it('should create DELETE_DATASET intent', () => {
            const intent: DeleteDatasetIntent = {
                type: 'DELETE_DATASET',
                dataset: 'HLQ.OLD.DATA',
            };

            expect(intent.type).toBe('DELETE_DATASET');
        });

        it('should support optional volume parameter', () => {
            const intent: DeleteDatasetIntent = {
                type: 'DELETE_DATASET',
                dataset: 'HLQ.OLD.DATA',
                volume: 'VOL001',
            };

            expect(intent.volume).toBe('VOL001');
        });
    });

    describe('SearchContentIntent', () => {
        it('should create valid SEARCH_CONTENT intent', () => {
            const intent: SearchContentIntent = {
                type: 'SEARCH_CONTENT',
                dataset: 'HLQ.COBOL.SRC',
                searchTerm: 'PERFORM',
            };

            expect(intent.type).toBe('SEARCH_CONTENT');
            expect(intent.searchTerm).toBe('PERFORM');
        });

        it('should support optional memberPattern', () => {
            const intent: SearchContentIntent = {
                type: 'SEARCH_CONTENT',
                dataset: 'HLQ.COBOL.SRC',
                searchTerm: 'MOVE',
                memberPattern: 'PG*',
            };

            expect(intent.memberPattern).toBe('PG*');
        });
    });

    describe('DatasetInfoIntent', () => {
        it('should create valid DATASET_INFO intent', () => {
            const intent: DatasetInfoIntent = {
                type: 'DATASET_INFO',
                dataset: 'HLQ.COBOL.LOAD',
            };

            expect(intent.type).toBe('DATASET_INFO');
        });
    });
});

describe('Jobs Intent Schemas', () => {
    describe('ListJobsIntent', () => {
        it('should create simple LIST_JOBS intent', () => {
            const intent: ListJobsIntent = {
                type: 'LIST_JOBS',
            };

            expect(intent.type).toBe('LIST_JOBS');
        });

        it('should support all filter options', () => {
            const intent: ListJobsIntent = {
                type: 'LIST_JOBS',
                owner: 'USERID',
                prefix: 'PAYROLL*',
                status: 'ACTIVE',
                maxJobs: 50,
            };

            expect(intent.owner).toBe('USERID');
            expect(intent.prefix).toBe('PAYROLL*');
            expect(intent.status).toBe('ACTIVE');
            expect(intent.maxJobs).toBe(50);
        });

        it('should support various status values', () => {
            const statuses: ('ACTIVE' | 'OUTPUT' | 'INPUT')[] = ['ACTIVE', 'OUTPUT', 'INPUT'];

            for (const status of statuses) {
                const intent: ListJobsIntent = {
                    type: 'LIST_JOBS',
                    status,
                };
                expect(intent.status).toBe(status);
            }
        });
    });

    describe('GetJobStatusIntent', () => {
        it('should create intent with jobId', () => {
            const intent: GetJobStatusIntent = {
                type: 'GET_JOB_STATUS',
                jobId: 'JOB12345',
            };

            expect(intent.jobId).toBe('JOB12345');
        });

        it('should create intent with jobName', () => {
            const intent: GetJobStatusIntent = {
                type: 'GET_JOB_STATUS',
                jobName: 'PAYROLL',
            };

            expect(intent.jobName).toBe('PAYROLL');
        });

        it('should support both jobId and jobName', () => {
            const intent: GetJobStatusIntent = {
                type: 'GET_JOB_STATUS',
                jobId: 'JOB12345',
                jobName: 'PAYROLL',
            };

            expect(intent.jobId).toBe('JOB12345');
            expect(intent.jobName).toBe('PAYROLL');
        });
    });

    describe('GetJobOutputIntent', () => {
        it('should create basic intent', () => {
            const intent: GetJobOutputIntent = {
                type: 'GET_JOB_OUTPUT',
                jobId: 'JOB12345',
            };

            expect(intent.type).toBe('GET_JOB_OUTPUT');
        });

        it('should support spool filtering', () => {
            const intent: GetJobOutputIntent = {
                type: 'GET_JOB_OUTPUT',
                jobId: 'JOB12345',
                spoolFilter: 'SYSPRINT',
            };

            expect(intent.spoolFilter).toBe('SYSPRINT');
        });

        it('should support last job flag', () => {
            const intent: GetJobOutputIntent = {
                type: 'GET_JOB_OUTPUT',
                jobName: 'PAYROLL',
                last: true,
            };

            expect(intent.last).toBe(true);
        });
    });

    describe('GetSpoolFileIntent', () => {
        it('should require jobId, jobName, and ddName', () => {
            const intent: GetSpoolFileIntent = {
                type: 'GET_SPOOL_FILE',
                jobId: 'JOB12345',
                jobName: 'PAYROLL',
                ddName: 'SYSPRINT',
            };

            expect(intent.jobId).toBe('JOB12345');
            expect(intent.jobName).toBe('PAYROLL');
            expect(intent.ddName).toBe('SYSPRINT');
        });

        it('should support optional stepName', () => {
            const intent: GetSpoolFileIntent = {
                type: 'GET_SPOOL_FILE',
                jobId: 'JOB12345',
                jobName: 'PAYROLL',
                ddName: 'SYSPRINT',
                stepName: 'STEP02',
            };

            expect(intent.stepName).toBe('STEP02');
        });
    });

    describe('CancelJobIntent', () => {
        it('should require jobId and jobName', () => {
            const intent: CancelJobIntent = {
                type: 'CANCEL_JOB',
                jobId: 'JOB12345',
                jobName: 'BATCH01',
            };

            expect(intent.jobId).toBe('JOB12345');
            expect(intent.jobName).toBe('BATCH01');
        });
    });

    describe('PurgeJobIntent', () => {
        it('should require jobId and jobName', () => {
            const intent: PurgeJobIntent = {
                type: 'PURGE_JOB',
                jobId: 'JOB12345',
                jobName: 'BATCH01',
            };

            expect(intent.jobId).toBe('JOB12345');
            expect(intent.jobName).toBe('BATCH01');
        });
    });

    describe('MonitorJobIntent', () => {
        it('should require jobId and jobName', () => {
            const intent: MonitorJobIntent = {
                type: 'MONITOR_JOB',
                jobId: 'JOB12345',
                jobName: 'BATCH01',
            };

            expect(intent.jobId).toBe('JOB12345');
            expect(intent.jobName).toBe('BATCH01');
        });
    });
});

describe('Run Intent Schemas', () => {
    describe('SubmitDatasetIntent', () => {
        it('should create intent with dataset only', () => {
            const intent: SubmitDatasetIntent = {
                type: 'SUBMIT_DATASET',
                dataset: 'HLQ.JCL.CNTL',
            };

            expect(intent.type).toBe('SUBMIT_DATASET');
            expect(intent.dataset).toBe('HLQ.JCL.CNTL');
        });

        it('should support optional member', () => {
            const intent: SubmitDatasetIntent = {
                type: 'SUBMIT_DATASET',
                dataset: 'HLQ.JCL.CNTL',
                member: 'BATCH01',
            };

            expect(intent.member).toBe('BATCH01');
        });
    });

    describe('SubmitInlineIntent', () => {
        it('should accept raw JCL', () => {
            const jcl = `//MYJOB JOB (001,CLASS=M),MSGCLASS=X
//STEP1 EXEC COBOL
`;
            const intent: SubmitInlineIntent = {
                type: 'SUBMIT_INLINE',
                jcl,
            };

            expect(intent.jcl).toBe(jcl);
        });
    });

    describe('SubmitAndMonitorIntent', () => {
        it('should create intent with dataset', () => {
            const intent: SubmitAndMonitorIntent = {
                type: 'SUBMIT_AND_MONITOR',
                dataset: 'HLQ.JCL.CNTL',
                member: 'NIGHTLY',
            };

            expect(intent.type).toBe('SUBMIT_AND_MONITOR');
        });

        it('should support autoDisplay flag', () => {
            const intent: SubmitAndMonitorIntent = {
                type: 'SUBMIT_AND_MONITOR',
                dataset: 'HLQ.JCL.CNTL',
                member: 'BATCH01',
                autoDisplay: true,
            };

            expect(intent.autoDisplay).toBe(true);
        });
    });

    describe('ResubmitIntent', () => {
        it('should support jobId', () => {
            const intent: ResubmitIntent = {
                type: 'RESUBMIT',
                jobId: 'JOB12345',
            };

            expect(intent.jobId).toBe('JOB12345');
        });

        it('should support jobName', () => {
            const intent: ResubmitIntent = {
                type: 'RESUBMIT',
                jobName: 'PAYROLL',
            };

            expect(intent.jobName).toBe('PAYROLL');
        });
    });

    describe('SubmitLocalFileIntent', () => {
        it('should require localPath', () => {
            const intent: SubmitLocalFileIntent = {
                type: 'SUBMIT_LOCAL_FILE',
                localPath: './jcl/BATCH01.jcl',
            };

            expect(intent.localPath).toBe('./jcl/BATCH01.jcl');
        });

        it('should handle absolute paths', () => {
            const intent: SubmitLocalFileIntent = {
                type: 'SUBMIT_LOCAL_FILE',
                localPath: 'C:/code/jcl/NIGHTLY.jcl',
            };

            expect(intent.localPath).toBe('C:/code/jcl/NIGHTLY.jcl');
        });
    });
});

describe('Safety levels configuration', () => {
    describe('INTENT_SAFETY (Dataset operations)', () => {
        it('should define safety for all dataset intent types', () => {
            const expectedTypes = [
                'LIST_DATASETS', 'LIST_MEMBERS', 'READ_MEMBER', 'WRITE_MEMBER',
                'CREATE_DATASET', 'CREATE_MEMBER', 'DELETE_MEMBER', 'DELETE_DATASET',
                'SEARCH_CONTENT', 'DATASET_INFO', 'DOWNLOAD_MEMBER', 'DOWNLOAD_ALL_MEMBERS',
                'DOWNLOAD_ALL_DATASETS', 'UPLOAD_FILE_TO_MEMBER', 'UPLOAD_DIR_TO_PDS',
                'COPY_MEMBER', 'COPY_DATASET'
            ];

            for (const type of expectedTypes) {
                expect(INTENT_SAFETY).toHaveProperty(type);
            }
        });

        it('should mark read operations as safe', () => {
            expect(INTENT_SAFETY['LIST_DATASETS']).toBe('safe');
            expect(INTENT_SAFETY['LIST_MEMBERS']).toBe('safe');
            expect(INTENT_SAFETY['READ_MEMBER']).toBe('safe');
            expect(INTENT_SAFETY['SEARCH_CONTENT']).toBe('safe');
            expect(INTENT_SAFETY['DATASET_INFO']).toBe('safe');
        });

        it('should mark delete operations as dangerous', () => {
            expect(INTENT_SAFETY['DELETE_MEMBER']).toBe('dangerous');
            expect(INTENT_SAFETY['DELETE_DATASET']).toBe('dangerous');
        });
    });

    describe('JOBS_INTENT_SAFETY', () => {
        it('should define safety for all job intent types', () => {
            const expectedTypes = [
                'LIST_JOBS', 'GET_JOB_STATUS', 'GET_JOB_OUTPUT',
                'GET_SPOOL_FILE', 'CANCEL_JOB', 'PURGE_JOB', 'MONITOR_JOB'
            ];

            for (const type of expectedTypes) {
                expect(JOBS_INTENT_SAFETY).toHaveProperty(type);
            }
        });

        it('should mark read operations as safe', () => {
            expect(JOBS_INTENT_SAFETY['LIST_JOBS']).toBe('safe');
            expect(JOBS_INTENT_SAFETY['GET_JOB_STATUS']).toBe('safe');
            expect(JOBS_INTENT_SAFETY['GET_JOB_OUTPUT']).toBe('safe');
            expect(JOBS_INTENT_SAFETY['GET_SPOOL_FILE']).toBe('safe');
            expect(JOBS_INTENT_SAFETY['MONITOR_JOB']).toBe('safe');
        });

        it('should mark cancel/purge operations as dangerous', () => {
            expect(JOBS_INTENT_SAFETY['CANCEL_JOB']).toBe('dangerous');
            expect(JOBS_INTENT_SAFETY['PURGE_JOB']).toBe('dangerous');
        });
    });

    describe('RUN_INTENT_SAFETY', () => {
        it('should define safety for all run intent types', () => {
            const expectedTypes = [
                'SUBMIT_DATASET', 'SUBMIT_INLINE', 'SUBMIT_AND_MONITOR',
                'RESUBMIT', 'SUBMIT_LOCAL_FILE', 'SUBMIT_LOCAL_FILE_AND_MONITOR'
            ];

            for (const type of expectedTypes) {
                expect(RUN_INTENT_SAFETY).toHaveProperty(type);
            }
        });

        it('should mark all submit operations as at least moderate', () => {
            Object.values(RUN_INTENT_SAFETY).forEach((level) => {
                expect(['moderate', 'dangerous']).toContain(level);
            });
        });
    });
});
