# z/OS Assistant for Copilot

[![Version](https://img.shields.io/visual-studio-marketplace/v/zarafa-dev-io.zos-copilot-assistant)](https://marketplace.visualstudio.com/items?itemName=zarafa-dev-io.zos-copilot-assistant)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/zarafa-dev-io.zos-copilot-assistant)](https://marketplace.visualstudio.com/items?itemName=zarafa-dev-io.zos-copilot-assistant)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Talk to your mainframe in natural language — directly from GitHub Copilot Chat.

**z/OS Assistant** is a VS Code Chat Participant that bridges GitHub Copilot and z/OS via the Zowe SDK. Manage datasets, monitor jobs, submit JCL — all through conversational commands, in plain English or French.

---

## Requirements

| Requirement | Version |
|---|---|
| VS Code | ≥ 1.105 |
| GitHub Copilot Chat | Latest |
| Zowe Explorer *(recommended)* | ≥ 3.x |
| Zowe Team Config *(alternative)* | `zowe.config.json` in workspace |
| z/OSMF | Accessible from your network |

The extension automatically connects using:
1. **Zowe Explorer's active profile** (if installed)
2. **`zowe.config.json`** in your workspace (fallback)

No additional credential configuration needed.

---

## Features

### `@zos /ds` — Datasets & PDS Members

Browse, read, write, search and manage z/OS datasets and PDS members.

```
@zos /ds list datasets HLQ.COBOL.**
@zos /ds show members of HLQ.COBOL.SRC
@zos /ds display HLQ.COBOL.SRC(PGMA)
@zos /ds search PERFORM in HLQ.COBOL.SRC
@zos /ds info about HLQ.COBOL.LOAD
```

**10 operations:** list, read, write, create, delete, search, info — with auto-detected syntax highlighting for COBOL, JCL, and ASM.

---

### `@zos /jobs` — z/OS Jobs

Monitor and manage your batch jobs with visual status indicators.

```
@zos /jobs list my jobs
@zos /jobs status of JOB12345
@zos /jobs show output of JOB12345
@zos /jobs monitor JOB12345 BATCH01
@zos /jobs cancel JOB12345 BATCH01
```

**7 operations:** list, status, spool output, cancel, purge, monitor — with visual RC indicators (✅ 🟡 🔴) and automatic error diagnosis.

---

### `@zos /run` — JCL Submission

Submit JCL from datasets, inline, or resubmit previous jobs.

```
@zos /run submit HLQ.JCL(BATCH01)
@zos /run launch HLQ.JCL(COMPILE) and monitor
@zos /run resubmit job JOB12345
```

**4 operations:** submit from dataset, submit inline JCL, submit + auto-monitor with spool display, resubmit from previous job.

---

### Safety System

Destructive operations are protected by a three-tier confirmation system:

| Tier | Examples | Behavior |
|---|---|---|
| Safe | list, read, status | No confirmation |
| Moderate | write, create | Simple confirmation |
| Dangerous | delete, cancel, purge | Modal confirmation dialog |

**Production detection:** datasets matching `*.PROD.*`, `*.PRD.*`, `SYS*.**` are automatically flagged. Configurable via settings.

---

## Getting Started

1. Install [GitHub Copilot Chat](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat) and [Zowe Explorer](https://marketplace.visualstudio.com/items?itemName=Zowe.vscode-extension-for-zowe)
2. Install **z/OS Assistant for Copilot** from the Marketplace
3. Open the Copilot Chat panel (`Ctrl+Alt+I`)
4. Type `@zos` to start interacting with your mainframe

---

## Configuration

Open **Settings** (`Ctrl+,`) and search for `z/OS Assistant`:

| Setting | Default | Description |
|---|---|---|
| `zosAssistant.defaultProfile` | `""` | Zowe profile name (empty = use Zowe Explorer's active profile) |
| `zosAssistant.confirmDangerousOperations` | `true` | Require confirmation for delete, cancel, purge |
| `zosAssistant.protectedDatasetPatterns` | `["*.PROD.*", ...]` | Patterns for production datasets |
| `zosAssistant.monitorTimeoutSeconds` | `300` | Maximum wait time for job monitoring (seconds) |
| `zosAssistant.monitorPollIntervalSeconds` | `5` | Polling interval for job monitoring (seconds) |
| `zosAssistant.maxSpoolLines` | `200` | Spool lines displayed inline before truncation |
| `zosAssistant.telemetryEnabled` | `true` | Local usage tracking (data stays on your machine) |

---

## Commands

| Command | Description |
|---|---|
| `z/OS: Open member in editor` | Open a PDS member in a VS Code editor tab |
| `z/OS: Usage report (last 30 days)` | Display a local usage report |
| `z/OS: Clear Zowe session cache` | Force session re-authentication |
| `z/OS: Select LPAR / partition` | Switch between z/OS profiles |

---

## Language Model Tools

In addition to chat commands, z/OS Assistant exposes the following tools that Copilot can invoke automatically during conversations:

- **`#zos_listDatasets`** — List datasets matching a pattern
- **`#zos_listMembers`** — List PDS members
- **`#zos_readMember`** — Read a PDS member's content
- **`#zos_datasetInfo`** — Get dataset attributes (DSORG, RECFM, LRECL…)
- **`#zos_searchContent`** — Search text across a PDS
- **`#zos_listJobs`** — List jobs by owner, prefix, or status
- **`#zos_getJobStatus`** — Get detailed job status and return code
- **`#zos_getJobOutput`** — Retrieve spool output (SYSPRINT, JESMSGLG…)
- **`#zos_submitJcl`** — Submit JCL from a dataset member

---

## Telemetry

All telemetry data is **stored locally** on your machine (VS Code `globalState`). Nothing is sent externally. Run `z/OS: Usage report (last 30 days)` to view your usage statistics.

To disable telemetry, set `zosAssistant.telemetryEnabled` to `false` in settings.

---

## Roadmap

- [ ] `/tso` — TSO and console commands
- [ ] `/uss` — USS filesystem operations
- [ ] Multi-profile support (switch between LPAR environments)
- [ ] Copilot instruction file for enhanced COBOL assistance
- [ ] Dataset content caching for faster repeated reads

---

## Known Issues

- `/tso` and `/uss` commands are not yet implemented (placeholders)
- Multi-LPAR profile switching is in progress

Report issues at [github.com/zarafa-dev-io/zLMTools/issues](https://github.com/zarafa-dev-io/zLMTools/issues).

---

## License

MIT — see [LICENSE](LICENSE).
