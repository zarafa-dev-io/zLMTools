# Changelog

All notable changes to **z/OS Assistant for Copilot** are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.6.0] - 2026-03-10

### Added

#### Automatic response language detection

- All responses are now automatically delivered in the **same language as the user's prompt** — French or English, detected per request with no configuration required
- Language detection uses a lightweight heuristic (no extra LLM call): French accented characters count double, common FR/EN keywords are scored, default falls back to French
- New utility module `src/utils/i18n.ts`:
  - `detectLanguage(prompt): Lang` — returns `'fr'` or `'en'`
  - `tr(fr, en, lang)` — inline translation helper used in `participant.ts`
- Each handler (`DatasetsHandler`, `JobsHandler`, `RunHandler`) exposes a private `t(fr, en)` shorthand method and detects language once at the start of `handle()`
- **Full coverage** across all three handlers and `participant.ts`:
  - Progress messages (`stream.progress`)
  - Markdown responses — headers, tables, status messages, error messages
  - Clickable followup button labels and their prompt text
  - VS Code button titles
  - Free-form help message and default followups

---

## [0.5.0] - 2026-03-09

### Changed

#### `/ds` — Dataset creation reworked

- `CREATE_DATASET` now supports five Zowe SDK preset types instead of a binary PO/PS choice:
  - **PARTITIONED** — standard PDS (PO, FB/80, 5 dirblks) — keyword: "PDS", "partitioned", "bibliothèque"
  - **SEQUENTIAL** — flat file (PS, FB/80) — keyword: "séquentiel", "PS", "fichier plat"
  - **CLASSIC** — PDS with 25 dirblks (legacy style) — keyword: "classic"
  - **BINARY** — binary PDS (U, blksize=27998) — keyword: "binaire", "load library", "LIB"
  - **C** — C-language PDS (VB, lrecl=260, dirblk=25) — keyword: "C dataset"
- New `likeDataset` mode: `Create.dataSetLike()` copies all attributes from an existing dataset; additional overrides (e.g. `primary`) can still be specified
- Attribute priority (type preset mode): intent-specified values > VS Code settings defaults > Zowe SDK preset defaults
- Fixed: PDS type was previously mapped to `DATA_SET_C` (enum 1) instead of `DATA_SET_PARTITIONED` (enum 3)
- Output table now shows all effective attributes including SMS classes and volume

### Added

#### `/ds` — Delete member and dataset

- `DELETE_MEMBER` — Delete a PDS member via `Delete.dataSet(session, "DATASET(MEMBER)")`
- `DELETE_DATASET` — Delete an entire dataset via `Delete.dataSet()`; accepts optional `volume` parameter for non-SMS-managed datasets

#### Language Model Tools

- `#zos_createDataset` — Create a z/OS dataset; two modes: type preset (PARTITIONED/SEQUENTIAL/CLASSIC/BINARY/C) or allocate-like an existing dataset (`likeDataset`); per-call attribute overrides; defaults from VS Code settings
- `#zos_deleteMember` — Permanently delete a PDS member (irreversible)
- `#zos_deleteDataset` — Permanently delete an entire dataset, with optional `volume` for non-SMS datasets (irreversible)

#### Settings — Dataset creation defaults (`zosAssistant.createDefaults.*`)

New settings group to configure site-wide defaults used for every `CREATE_DATASET` operation:

| Setting | Default | Description |
|---|---|---|
| `alcunit` | `TRK` | Space allocation unit (TRK or CYL) |
| `primary` | `10` | Primary space allocation |
| `secondary` | `5` | Secondary space allocation |
| `recfm` | `FB` | Record format (PARTITIONED and SEQUENTIAL types only) |
| `lrecl` | `80` | Logical record length |
| `blksize` | `0` | Block size (0 = let z/OS determine) |
| `dirblkPds` | `20` | Directory blocks for PDS |
| `volser` | `""` | Volume serial (empty = SMS-managed) |
| `storclass` | `""` | SMS storage class |
| `mgntclass` | `""` | SMS management class |
| `dataclass` | `""` | SMS data class |

---

## [0.4.0] - 2026-03-06

### Added

#### `/ds` — Copy members and datasets

- `COPY_MEMBER` — Copy a PDS member to another dataset/member via `Copy.dataSet()`; supports renaming (source member ≠ target member) and `replace` flag
- `COPY_DATASET` — Copy an entire PDS or sequential dataset:
  - **PDS**: iterates over all members and copies each one individually using `Copy.dataSet()`
  - **Sequential**: single `Copy.dataSet()` call without member names
  - Detailed progress with per-member error reporting

#### Language Model Tools

- `#zos_copyMember` — Copy a PDS member to another dataset (with optional rename and replace)
- `#zos_copyDataset` — Copy an entire PDS or sequential dataset to a new target

---

## [0.3.0] - 2026-03-06

### Added

#### `/run` — Submit local JCL file

- `SUBMIT_LOCAL_FILE` — Read a local JCL file and submit it via `SubmitJobs.submitJcl()` (absolute or workspace-relative path); displays a 10-line preview before submission
- `SUBMIT_LOCAL_FILE_AND_MONITOR` — Submit a local JCL file then monitor until completion with automatic spool display on finish
- JCL validation: checks for `//` and `JOB` card before submitting; returns a clear error message if the file is invalid or missing
- Automatic path resolution: relative paths are resolved from the workspace root (enables seamless use with files downloaded by `DOWNLOAD_ALL_MEMBERS`)

#### Language Model Tools

- `#zos_submitLocalJcl` — Submit a local JCL file to z/OS with confirmation dialog; returns jobname, jobid, owner and status

#### Internal refactoring

- Extracted `monitorSubmittedJob()` helper in `RunHandler` — shared by `SUBMIT_AND_MONITOR` and `SUBMIT_LOCAL_FILE_AND_MONITOR` to avoid code duplication

---

## [0.2.0] - 2026-03-05

### Added

#### `/ds` — Dataset & member download

- `DOWNLOAD_MEMBER` — Download a PDS member to the local workspace (`downloads/<DATASET>/<MEMBER>.ext`)
- `DOWNLOAD_ALL_MEMBERS` — Download all members of a PDS in a single operation via `Download.allMembers()`
- `DOWNLOAD_ALL_DATASETS` — Download all datasets matching a pattern via `List.dataSet()` + `Download.allDataSets()`
- Contextual "Open file" / "Open folder" buttons after each download
- Local filenames in uppercase, extension derived from PDS qualifiers (`.cbl`, `.jcl`, `.asm`, `.cpy`, `.pli`, `.rexx`…)
- Configurable target directory per request (`targetDir`), defaults to `<workspace>/downloads/`

#### `/ds` — Local → mainframe upload

- `UPLOAD_FILE_TO_MEMBER` — Upload a local file to a PDS member via `Upload.fileToDataset()` (absolute or workspace-relative path)
- `UPLOAD_DIR_TO_PDS` — Upload all files from a local directory to a PDS via `Upload.dirToPds()` (each file becomes a member, name truncated to 8 characters)
- Upload report: source files, size, created members
- Automatic resolution of relative paths from the workspace root

#### Language Model Tools

- `#zos_downloadMember` — Download a PDS member to the local workspace
- `#zos_downloadAllMembers` — Download all members of a PDS
- `#zos_downloadAllDatasets` — Download all datasets matching a pattern
- `#zos_uploadFileToPds` — Upload a local file to a PDS member
- `#zos_uploadDirToPds` — Upload a local directory to a PDS

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
