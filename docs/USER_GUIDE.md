# User Guide — z/OS Assistant for Copilot

> Talk to your mainframe in natural language, directly from GitHub Copilot Chat.

---

## Table of Contents

1. [Introduction](#introduction)
2. [Requirements and Installation](#requirements-and-installation)
3. [Getting Started](#getting-started)
4. [Available Commands](#available-commands)
   - [`@zos /ds` — Dataset Management](#zos-ds--dataset-management)
   - [`@zos /jobs` — Job Management](#zos-jobs--job-management)
   - [`@zos /run` — JCL Submission](#zos-run--jcl-submission)
   - [`@zos /lpar` — LPAR Management](#zos-lpar--lpar-management)
5. [Automatic Tools (Language Model Tools)](#automatic-tools-language-model-tools)
6. [Safety System](#safety-system)
7. [Configuration](#configuration)
8. [Complete Usage Scenarios](#complete-usage-scenarios)
9. [Tips and Best Practices](#tips-and-best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Introduction

**z/OS Assistant for Copilot** is a VS Code extension that connects GitHub Copilot Chat to your IBM z/OS mainframe via the Zowe SDK. It allows you to:

- Browse, read, write, and manage z/OS datasets
- Monitor and manage your batch jobs
- Submit JCL from a dataset, a local file, or directly inline
- Switch between multiple z/OS environments (DEV, TEST, PROD)

All of this **in natural language**, in English or French, without leaving your editor.

> **Automatic language detection** — just write naturally in English or French and the assistant responds in kind. No configuration required.

---

## Requirements and Installation

### Requirements

| Component | Minimum Version |
|-----------|----------------|
| VS Code | ≥ 1.105 |
| GitHub Copilot Chat | Latest |
| Zowe Explorer *(recommended)* | ≥ 3.x |
| z/OSMF | Accessible from your network |

### Installation

1. Install [GitHub Copilot Chat](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat) in VS Code
2. Install [Zowe Explorer](https://marketplace.visualstudio.com/items?itemName=Zowe.vscode-extension-for-zowe) and configure your z/OS profile
3. Install **z/OS Assistant for Copilot** from the VS Code Marketplace
4. Open the Copilot Chat panel (`Ctrl+Alt+I`)
5. Type `@zos` to get started

> The extension connects automatically using Zowe Explorer's active profile. No additional configuration is needed if Zowe Explorer is already set up.

**Alternative without Zowe Explorer:** place a `zowe.config.json` file at the root of your workspace.

---

## Getting Started

### Verify the Connection

```
@zos /lpar list
```

This command displays the available z/OS partitions and the currently active profile (also visible in the VS Code status bar at the bottom).

### Your First Example

```
@zos /ds list datasets MY.HLQ.**
```

If you see your dataset list, you are connected and ready to go.

---

## Available Commands

### `@zos /ds` — Dataset Management

The `/ds` command covers 17 operations on z/OS datasets and PDS members.

#### List and Explore

```
# List datasets matching a pattern
@zos /ds list datasets HLQ.COBOL.**
@zos /ds show me all datasets matching HLQ.DATA.*
@zos /ds liste les datasets de MON.PROJET.*

# List members of a PDS
@zos /ds show members of HLQ.COBOL.SRC
@zos /ds list members in HLQ.COBOL.SRC
@zos /ds liste les membres de HLQ.JCL.CNTL

# Get dataset attributes
@zos /ds info about HLQ.COBOL.SRC
@zos /ds dataset info HLQ.WORK.DATA
@zos /ds what are the attributes of HLQ.COBOL.LOAD
```

#### Read Content

```
# Read a PDS member (with automatic COBOL/JCL/ASM syntax highlighting)
@zos /ds read HLQ.COBOL.SRC(PGMA)
@zos /ds display HLQ.JCL.CNTL(BATCH01)
@zos /ds show content of HLQ.COBOL.SRC(UTILS)
```

#### Search Content

```
# Search a string across all members of a PDS
@zos /ds search PERFORM in HLQ.COBOL.SRC
@zos /ds search CALL 'DBUTIL' in HLQ.COBOL.SRC
@zos /ds find TODO in HLQ.COBOL.SRC
```

#### Write and Create

```
# Write the content of a VS Code editor to a PDS member
@zos /ds write to HLQ.COBOL.SRC(PGMA)
@zos /ds save to HLQ.COBOL.SRC(NEWPGM)

# Upload a local file to a PDS member
@zos /ds upload PGMA.cbl to HLQ.COBOL.SRC(PGMA)
@zos /ds upload directory ./cobol to HLQ.COBOL.SRC
@zos /ds upload ./src/BATCH01.jcl to HLQ.JCL.CNTL(BATCH01)

# Create a new dataset
@zos /ds create PDS HLQ.NEW.SRC lrecl 80
@zos /ds create sequential dataset HLQ.WORK.DATA recfm VB lrecl 256
@zos /ds create classic PDS HLQ.COBOL.SRC primary 5 CYL
@zos /ds create binary library HLQ.LOAD.LIB
@zos /ds create HLQ.NEW.SRC like HLQ.COBOL.SRC
```

**Available dataset types at creation:**

| Type | Typical Use |
|------|-------------|
| `PARTITIONED` | Standard PDS (COBOL sources, JCL…) |
| `SEQUENTIAL` | Sequential file (data, reports…) |
| `CLASSIC` | Classic PDS with custom parameters |
| `BINARY` | Binary library (load modules) |
| `C` | PDS for C/C++ source code |

#### Download

```
# Download a member to the local workspace
@zos /ds download member PGMA from HLQ.COBOL.SRC
@zos /ds download HLQ.COBOL.SRC(UTILS) locally

# Download all members of a PDS
@zos /ds download all members of HLQ.COBOL.SRC

# Download all datasets matching a pattern
@zos /ds download all datasets HLQ.COBOL.**
```

#### Copy

```
# Copy a member to another dataset
@zos /ds copy member PGMA from HLQ.COBOL.SRC to HLQ.COBOL.BAK(PGMA)
@zos /ds copy PGMA from HLQ.COBOL.SRC to HLQ.BACKUP.SRC(PGMA)

# Copy an entire dataset
@zos /ds copy dataset HLQ.COBOL.SRC to HLQ.COBOL.BAK
```

#### Delete

```
# Delete a member (confirmation required)
@zos /ds delete member OLDPGM from HLQ.COBOL.SRC

# Delete an entire dataset (modal confirmation required)
@zos /ds delete dataset HLQ.WORK.DATA
```

> **Important:** Deletions trigger a confirmation dialog. Datasets matching production patterns (e.g. `*.PROD.*`) are flagged with an additional warning.

---

### `@zos /jobs` — Job Management

#### List Jobs

```
# List your own jobs
@zos /jobs list my jobs

# Filter by status
@zos /jobs list active jobs
@zos /jobs list jobs with status OUTPUT
@zos /jobs show failed jobs

# Filter by prefix
@zos /jobs list jobs starting with BATCH
@zos /jobs show jobs with prefix NIGHTLY
```

#### Check Status

```
# Status of a specific job
@zos /jobs status of JOB12345
@zos /jobs check JOB12345 BATCHJOB status

# Visual indicators displayed:
# ✅ CC 0000  — Completed with RC 0 (success)
# 🟡 CC 0004  — Completed with warning
# 🔴 CC 0008  — Completed with error
# ⚠️  ABEND   — Abnormal termination
# ⏳ ACTIVE   — Currently running
```

#### View Spool Output

```
# Display the full output of a job
@zos /jobs show output of JOB12345

# Get a specific spool file
@zos /jobs get SYSPRINT of JOB12345
@zos /jobs show JESMSGLG for JOB12345
```

#### Monitor a Job in Real Time

```
# Monitor until completion (automatic polling every 5 seconds)
@zos /jobs monitor JOB12345
@zos /jobs monitor JOB12345 BATCHJOB
```

> Monitoring stops automatically when the job completes or after the configured timeout (`monitorTimeoutSeconds`, default 300s). The spool output is automatically displayed when the job finishes.

#### Cancel and Purge

```
# Cancel an active job (confirmation required)
@zos /jobs cancel JOB12345
@zos /jobs cancel JOB12345 BATCHJOB

# Purge a job from the JES queue (confirmation required)
@zos /jobs purge JOB12345
```

---

### `@zos /run` — JCL Submission

#### Submit from a z/OS Dataset

```
# Simple submission
@zos /run submit HLQ.JCL.CNTL(BATCH01)
@zos /run launch HLQ.JCL.CNTL(COMPILE)

# Submit with automatic monitoring
@zos /run launch HLQ.JCL.CNTL(COMPILE) and monitor
@zos /run submit HLQ.JCL.CNTL(BATCH01) and wait
```

#### Submit from a Local File

```
# Path relative to the workspace
@zos /run submit local file ./downloads/HLQ/JCL/CNTL/BATCH01.jcl
@zos /run submit and monitor downloads/HLQ/JCL/CNTL/NIGHTLY.jcl

# Absolute path
@zos /run submit local file /home/user/projects/jcl/COMPILE.jcl
```

#### Resubmit a Previous Job

```
@zos /run resubmit job JOB12345
```

---

### `@zos /lpar` — LPAR Management

```
# List available partitions
@zos /lpar list

# Switch to another environment
@zos /lpar use DEV1
@zos /lpar switch to TEST

# Show the active partition
@zos /lpar current

# Refresh the profile cache
@zos /lpar refresh
```

> The active partition is permanently displayed in the VS Code status bar as `🖥️ z/OS: DEV1`. Click it to open the partition selector.

---

## Automatic Tools (Language Model Tools)

In addition to explicit commands, the extension exposes **20+ tools** that Copilot can invoke **automatically** during a conversation. You don't need to call them yourself — Copilot uses them at the right moment.

**Examples of conversations that trigger these tools:**

```
# Copilot will automatically read the member when you ask for an analysis
"Analyze the PGMA program in HLQ.COBOL.SRC and explain what it does"

# Copilot will list datasets to answer your question
"Which datasets contain my COBOL programs?"

# Copilot will use dataset info to help you
"Help me create a dataset with the same attributes as HLQ.COBOL.SRC"
```

**Available tools:**

| Tool | Description |
|------|-------------|
| `#zos_listDatasets` | List datasets by pattern |
| `#zos_listMembers` | List PDS members |
| `#zos_readMember` | Read a member's content |
| `#zos_datasetInfo` | Dataset attributes (DSORG, RECFM, LRECL…) |
| `#zos_searchContent` | Search text across a PDS |
| `#zos_downloadMember` | Download a member locally |
| `#zos_downloadAllMembers` | Download all members of a PDS |
| `#zos_downloadAllDatasets` | Download all datasets matching a pattern |
| `#zos_uploadFileToPds` | Upload a local file to a PDS member |
| `#zos_uploadDirToPds` | Upload an entire directory to a PDS |
| `#zos_copyMember` | Copy a member to another dataset |
| `#zos_copyDataset` | Copy an entire dataset |
| `#zos_createDataset` | Create a dataset with full attribute control |
| `#zos_deleteMember` | Delete a PDS member |
| `#zos_deleteDataset` | Delete an entire dataset |
| `#zos_listJobs` | List jobs |
| `#zos_getJobStatus` | Job status and return code |
| `#zos_getJobOutput` | Job spool output |
| `#zos_submitJcl` | Submit JCL from a dataset |
| `#zos_submitLocalJcl` | Submit a local JCL file |

---

## Safety System

The extension includes a three-tier confirmation system to protect your data.

### Safety Levels

| Level | Operations | Behavior |
|-------|------------|----------|
| **Safe** | list, read, status, info, search | No confirmation |
| **Moderate** | write, create, upload | Simple notification |
| **Dangerous** | delete, cancel, purge | Blocking modal dialog |

### Production Detection

Datasets matching the following patterns are **automatically flagged** as production:

- `*.PROD.*`
- `*.PRD.*`
- `*.PRODUCTION.*`
- `SYS*.**`

A moderate operation on a production dataset is **escalated to dangerous**. The confirmation dialog displays a `[PROD]` prefix to draw attention.

**Example:**
```
@zos /ds delete dataset HLQ.PROD.OLD.DATA
→ [PROD] Permanently delete HLQ.PROD.OLD.DATA?
→ Buttons: Cancel / Confirm
```

Production patterns are configurable via the `zosAssistant.protectedDatasetPatterns` setting.

---

## Configuration

Open VS Code settings (`Ctrl+,`) and search for `z/OS Assistant`.

### General Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `zosAssistant.defaultProfile` | `""` | Zowe profile to use (empty = Zowe Explorer's active profile) |
| `zosAssistant.confirmDangerousOperations` | `true` | Require confirmation for delete/cancel/purge |
| `zosAssistant.protectedDatasetPatterns` | `["*.PROD.*", "*.PRD.*", "*.PRODUCTION.*", "SYS*.**"]` | Patterns for production datasets |
| `zosAssistant.monitorTimeoutSeconds` | `300` | Maximum wait time for job monitoring (seconds) |
| `zosAssistant.monitorPollIntervalSeconds` | `5` | Polling frequency during monitoring (seconds) |
| `zosAssistant.maxSpoolLines` | `200` | Number of spool lines displayed before truncation |
| `zosAssistant.telemetryEnabled` | `true` | Local usage tracking (data stays on your machine only) |

### Dataset Creation Defaults (`zosAssistant.createDefaults.*`)

| Setting | Default | Description |
|---------|---------|-------------|
| `alcunit` | `TRK` | Allocation unit (TRK or CYL) |
| `primary` | `10` | Primary space |
| `secondary` | `5` | Secondary space |
| `recfm` | `FB` | Record format |
| `lrecl` | `80` | Logical record length |
| `blksize` | `0` | Block size (0 = z/OS-determined) |
| `dirblkPds` | `20` | Directory blocks for PDS |
| `volser` | `""` | Volume serial (empty = SMS-managed) |
| `storclass` | `""` | SMS storage class |
| `mgntclass` | `""` | SMS management class |
| `dataclass` | `""` | SMS data class |

### Available VS Code Commands

| Command | Description |
|---------|-------------|
| `z/OS: Open member in editor` | Open a PDS member in a VS Code editor tab |
| `z/OS: Usage report (last 30 days)` | Display a local usage report |
| `z/OS: Clear Zowe session cache` | Force re-authentication |
| `z/OS: Select LPAR / partition` | Switch between z/OS profiles |

---

## Complete Usage Scenarios

### Scenario 1: COBOL Code Review

You want to analyze a COBOL program and identify optimizations.

```
# 1. List the available programs
@zos /ds list members in HLQ.COBOL.SRC

# 2. Read the program you are interested in
@zos /ds read HLQ.COBOL.SRC(CALCUL)

# 3. Ask Copilot for an analysis (automatically uses #zos_readMember)
"Analyze the CALCUL program in HLQ.COBOL.SRC, identify inefficient
sections and suggest optimizations"

# 4. Search for all occurrences of a problematic pattern
@zos /ds search PERFORM VARYING in HLQ.COBOL.SRC

# 5. Download to work locally
@zos /ds download all members of HLQ.COBOL.SRC
```

---

### Scenario 2: Debugging a Failed Job

A batch job has failed and you need to understand the cause.

```
# 1. List recent failed jobs
@zos /jobs list failed jobs

# 2. Check the status and return code
@zos /jobs status of JOB12345

# 3. Display the spool output (SYSPRINT, JESMSGLG)
@zos /jobs show output of JOB12345

# 4. Ask Copilot to analyze the error
"Analyze the output of job JOB12345 and explain why it failed"

# 5. Fix the JCL and resubmit
@zos /ds read HLQ.JCL.CNTL(BATCH01)
# (edit the JCL in the editor)
@zos /ds write to HLQ.JCL.CNTL(BATCH01)
@zos /run submit HLQ.JCL.CNTL(BATCH01) and monitor
```

---

### Scenario 3: Local ↔ z/OS Synchronization

You are working on COBOL sources locally and want to synchronize them with z/OS.

```
# 1. Download all sources to work locally
@zos /ds download all members of HLQ.COBOL.SRC

# Files arrive in: workspace/downloads/HLQ.COBOL.SRC/

# 2. Edit the sources locally in VS Code...

# 3. Upload the changes back to z/OS
@zos /ds upload directory ./downloads/HLQ.COBOL.SRC to HLQ.COBOL.SRC

# 4. Or upload a single modified file
@zos /ds upload CALCUL.cbl to HLQ.COBOL.SRC(CALCUL)
```

---

### Scenario 4: Backup Before Modification

Before modifying a production dataset, you want to back it up.

```
# 1. Copy the dataset to a backup
@zos /ds copy dataset HLQ.COBOL.SRC to HLQ.BACKUP.SRC

# 2. Verify the copy is there
@zos /ds list members in HLQ.BACKUP.SRC

# 3. Make your modifications...

# 4. If something goes wrong, restore from the backup
@zos /ds copy dataset HLQ.BACKUP.SRC to HLQ.COBOL.SRC
```

---

### Scenario 5: Setting Up a New Project

You are starting a new project and need to create the dataset structure.

```
# 1. Create the PDS for COBOL sources
@zos /ds create PDS HLQ.NEWPROJ.COBOL lrecl 80

# 2. Create the PDS for JCL
@zos /ds create PDS HLQ.NEWPROJ.JCL lrecl 80

# 3. Create a sequential dataset for data
@zos /ds create sequential dataset HLQ.NEWPROJ.DATA recfm VB lrecl 256

# 4. Create a load module library
@zos /ds create binary library HLQ.NEWPROJ.LOAD

# 5. Verify the creation
@zos /ds list datasets HLQ.NEWPROJ.**
```

---

### Scenario 6: Cleaning Up Temporary Datasets

At the end of a sprint, you want to clean up your working datasets.

```
# 1. List temporary datasets
@zos /ds list datasets HLQ.TEMP.**
@zos /ds list datasets HLQ.WORK.**

# 2. Check contents before deleting
@zos /ds info about HLQ.TEMP.DATA1

# 3. Delete obsolete datasets (confirmation required for each)
@zos /ds delete dataset HLQ.TEMP.DATA1
@zos /ds delete dataset HLQ.WORK.OLD
```

---

### Scenario 7: Submit and Monitor a Compilation Job

You have modified a COBOL program and want to compile and monitor the result.

```
# 1. Verify the JCL is ready
@zos /ds read HLQ.JCL.CNTL(COMPILE)

# 2. Submit and automatically wait for completion
@zos /run launch HLQ.JCL.CNTL(COMPILE) and monitor

# The extension will:
# - Submit the JCL
# - Poll the status every 5 seconds
# - Display the final result with a visual return code indicator
# - Automatically present the SYSPRINT output

# 3. In case of error, analyze the output with Copilot
"Analyze the compilation job output and identify the COBOL errors"
```

---

## Tips and Best Practices

### Writing Prompts

- **Be precise with names:** Use exact dataset and member names. The assistant recognizes the `HLQ.LLQ.LLLLQ(MEMBER)` pattern.
- **Natural language works:** You don't need to memorize an exact syntax. "list my COBOL datasets" and "liste mes datasets COBOL" give the same result.
- **Combine operations:** "Submit HLQ.JCL.CNTL(COMPILE) and monitor until completion" does both in a single command.
- **Use the suggestions:** After each response, the assistant offers contextual follow-up actions. Click them to chain operations.

### Environment Management

- Always check the active partition (status bar) before performing operations on production.
- Use `/lpar use` to explicitly switch between DEV, TEST, and PROD.
- Configure `protectedDatasetPatterns` with your organization-specific patterns.

### Performance

- Batch download (`download all members`) is more efficient than individual downloads for large PDS.
- Job monitoring uses configurable polling: increase `monitorPollIntervalSeconds` for long-running jobs to reduce network load.
- The session cache is maintained automatically; use "Clear Zowe session cache" only if you experience authentication issues.

### Local Telemetry

View your usage report to identify your most frequently used commands and optimize your workflow:

```
# Via the command palette (Ctrl+Shift+P)
> z/OS: Usage report (last 30 days)
```

Data stays on your machine. Nothing is sent externally.

---

## Troubleshooting

### The Extension Does Not Connect

**Symptom:** Commands fail with a connection error.

**Solutions:**
1. Verify that Zowe Explorer is installed and a profile is configured
2. Make sure z/OSMF is accessible from your network
3. Run `z/OS: Clear Zowe session cache` and try again
4. Check your Zowe credentials (`zowe.config.json` or Zowe Explorer profile)

---

### `@zos` Is Not Recognized in Copilot Chat

**Symptom:** Copilot does not recognize `@zos`.

**Solutions:**
1. Verify the extension is installed (`Extensions` → search "z/OS Assistant")
2. Reload VS Code (`Ctrl+Shift+P` → `Developer: Reload Window`)
3. Verify that GitHub Copilot Chat is active and connected

---

### Job Monitoring Never Ends

**Symptom:** The `/jobs monitor` command waits indefinitely.

**Solutions:**
1. The default timeout is 300 seconds. Increase `zosAssistant.monitorTimeoutSeconds` if your jobs take longer.
2. Check the job status directly: `@zos /jobs status of JOBXXXXX`
3. If the job is stuck on z/OS, cancel it: `@zos /jobs cancel JOBXXXXX`

---

### Spool Output Is Truncated

**Symptom:** The job output is cut off after a few lines.

**Solution:** Increase `zosAssistant.maxSpoolLines` in settings (default: 200). For large outputs, prefer downloading the output member locally.

---

### Error Creating a Dataset

**Symptom:** Dataset creation fails with a z/OS error.

**Checks:**
- Does the HLQ exist and do you have the rights to create datasets under it?
- Are the space parameters (primary/secondary) consistent with the available capacity?
- If you are using SMS, are the classes (storclass, mgntclass, dataclass) valid on your system?
- Check `zosAssistant.createDefaults.*` for your site's default values.

---

### Reporting an Issue

Open a ticket at: [github.com/zarafa-dev-io/zLMTools/issues](https://github.com/zarafa-dev-io/zLMTools/issues)

Include:
- The extension version (visible in `Extensions`)
- The prompt you used
- The full error message
- Your VS Code and Zowe Explorer versions

---

*Documentation for z/OS Assistant for Copilot v0.6.0 — March 2026*
