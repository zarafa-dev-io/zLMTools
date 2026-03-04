# Changelog

All notable changes to **z/OS Assistant for Copilot** are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-03-04

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
- `LIST_JOBS` — List jobs by owner, prefix, and status with RC indicators (✅ 🟡 🔴)
- `GET_JOB_STATUS` — Detailed job status with spool file listing
- `GET_JOB_OUTPUT` — Intelligent spool display (auto-show JES messages, truncate long output)
- `GET_SPOOL_FILE` — Read specific DD by name and step
- `CANCEL_JOB` — Cancel active jobs (with confirmation)
- `PURGE_JOB` — Purge jobs from JES queue (with confirmation)
- `MONITOR_JOB` — Poll job status until completion with auto-diagnostic on error

#### `/run` — JCL Submission
- `SUBMIT_DATASET` — Submit JCL from a dataset or PDS member
- `SUBMIT_INLINE` — Submit JCL provided directly in chat
- `SUBMIT_AND_MONITOR` — Submit + automatic monitoring + spool display on completion
- `RESUBMIT` — Re-submit JCL from a previous job (retrieved from JESJCL spool)

#### Language Model Tools
- `#zos_listDatasets` — List datasets matching a pattern
- `#zos_listMembers` — List PDS members
- `#zos_readMember` — Read a PDS member's content
- `#zos_datasetInfo` — Get dataset attributes (DSORG, RECFM, LRECL, BLKSIZE…)
- `#zos_searchContent` — Search text across a PDS
- `#zos_listJobs` — List jobs by owner, prefix, or status
- `#zos_getJobStatus` — Get detailed job status and return code
- `#zos_getJobOutput` — Retrieve spool output (SYSPRINT, JESMSGLG…)
- `#zos_submitJcl` — Submit JCL from a dataset member

#### Safety & Security
- Three-tier safety levels: safe / moderate / dangerous
- Automatic production zone detection (`*.PROD.*`, `*.PRD.*`, `SYS*.**` patterns)
- Modal confirmation dialogs for dangerous operations
- Configurable protected dataset patterns via settings

#### Infrastructure
- Zowe session management via Zowe Explorer API or Team Config (`zowe.config.json`)
- esbuild bundling for optimized VSIX packaging
- Local telemetry stored in VS Code `globalState` (no external data transmission)
- Configurable settings: timeout, poll interval, spool truncation, protected patterns
