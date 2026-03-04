# Changelog

All notable changes to **z/OS Assistant for Copilot** will be documented in this file.

## [0.1.0] — 2026-02-20

### Added

#### Chat Participant `@zos`
- Natural language interaction with z/OS via GitHub Copilot Chat
- LLM-based intent classification for each command domain

#### `/ds` — Datasets & PDS Members
- `LIST_DATASETS` — List datasets by pattern with attributes (DSORG, RECFM, LRECL, VOL)
- `LIST_MEMBERS` — List PDS members with modification date and user ID
- `READ_MEMBER` — Display member content with syntax highlighting (COBOL, JCL, ASM, PLI auto-detect)
- `WRITE_MEMBER` — Write content to a member
- `CREATE_DATASET` — Create PDS or sequential datasets with configurable attributes
- `CREATE_MEMBER` — Create new members in a PDS
- `DELETE_MEMBER` — Delete a PDS member (with confirmation)
- `DELETE_DATASET` — Delete an entire dataset (with confirmation)
- `SEARCH_CONTENT` — Search text across all members of a PDS
- `DATASET_INFO` — Display detailed dataset characteristics

#### `/jobs` — z/OS Jobs
- `LIST_JOBS` — List jobs by owner, prefix, and status with RC indicators
- `GET_JOB_STATUS` — Detailed job status with spool file listing
- `GET_JOB_OUTPUT` — Intelligent spool display (auto-show JES messages, truncate long output)
- `GET_SPOOL_FILE` — Read specific DD by name and step
- `CANCEL_JOB` — Cancel active jobs (with confirmation)
- `PURGE_JOB` — Purge jobs from JES queue (with confirmation)
- `MONITOR_JOB` — Poll job status until completion with auto-diagnostic on error

#### `/run` — JCL Submission
- `SUBMIT_DATASET` — Submit JCL from a dataset/member
- `SUBMIT_INLINE` — Submit JCL provided directly in chat
- `SUBMIT_AND_MONITOR` — Submit + automatic monitoring + spool display on completion
- `RESUBMIT` — Re-submit JCL from a previous job (retrieved from JESJCL spool)

#### Safety & Security
- Three-tier safety levels: safe / moderate / dangerous
- Automatic production zone detection (PROD, PRD, SYS* patterns)
- Modal confirmation for dangerous operations
- Configurable protected dataset patterns

#### Infrastructure
- Zowe session management via Zowe Explorer API or Team Config
- esbuild bundling for optimized VSIX
- Local telemetry for usage reporting
- Configurable settings (timeout, poll interval, spool truncation)
