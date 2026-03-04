# z/OS Assistant for Copilot

> Talk to your mainframe in natural language — directly from GitHub Copilot Chat.

**z/OS Assistant** is a VS Code Chat Participant that bridges GitHub Copilot and z/OS via the Zowe SDK. Manage datasets, monitor jobs, submit JCL — all through conversational commands.

---

## Features

### `/ds` — Datasets & PDS Members

```
@zos /ds liste les datasets HLQ.COBOL.**
@zos /ds montre les membres de HLQ.COBOL.SRC
@zos /ds affiche HLQ.COBOL.SRC(PGMA)
@zos /ds cherche PERFORM dans HLQ.COBOL.SRC
@zos /ds info sur HLQ.COBOL.LOAD
```

10 operations: list, read, write, create, delete, search, info — with auto-detected syntax highlighting for COBOL, JCL, ASM.

### `/jobs` — z/OS Jobs

```
@zos /jobs liste mes jobs
@zos /jobs statut de JOB12345
@zos /jobs montre la sortie de JOB12345
@zos /jobs surveille JOB12345 BATCH01
@zos /jobs annule JOB12345 BATCH01
```

7 operations: list, status, spool output, cancel, purge, monitor — with visual RC indicators (✅ 🟡 🔴) and automatic error diagnosis.

### `/run` — JCL Submission

```
@zos /run soumets HLQ.JCL(BATCH01)
@zos /run lance HLQ.JCL(COMPILE) et surveille
@zos /run relance le job JOB12345
```

4 operations: submit from dataset, submit inline JCL, submit + auto-monitor with spool display, resubmit from previous job.

### Safety

- **Three-tier safety**: safe → moderate → dangerous with modal confirmations
- **Production detection**: datasets matching `*.PROD.*`, `*.PRD.*`, `SYS*.**` are automatically flagged
- **Configurable patterns**: add your own protected dataset patterns in settings

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| VS Code | ≥ 1.93 |
| GitHub Copilot Chat | Latest |
| Zowe Explorer *(recommended)* | ≥ 3.x |
| Zowe Team Config *(alternative)* | `zowe.config.json` in workspace |
| z/OSMF | Accessible from your network |

The extension automatically connects using:
1. **Zowe Explorer's active profile** (if installed)
2. **`zowe.config.json`** in your workspace (fallback)

No additional credential configuration needed.

---

## Installation

### From VSIX (internal distribution)

```bash
code --install-extension zos-chat-participant-0.1.0.vsix
```

### Build from source

```bash
git clone https://github.com/zdevops/zos-chat-participant.git
cd zos-chat-participant
npm install
npm run vsix:pre
# → produces zos-chat-participant-0.1.0.vsix
```

---

## Configuration

Open **Settings** → search for `z/OS Assistant`:

| Setting | Default | Description |
|---------|---------|-------------|
| `zosAssistant.defaultProfile` | `""` | Zowe profile name (empty = use Zowe Explorer) |
| `zosAssistant.confirmDangerousOperations` | `true` | Require confirmation for delete/cancel/purge |
| `zosAssistant.protectedDatasetPatterns` | `["*.PROD.*", ...]` | Patterns for production datasets |
| `zosAssistant.monitorTimeoutSeconds` | `300` | Max wait for job monitoring |
| `zosAssistant.monitorPollIntervalSeconds` | `5` | Polling interval for monitoring |
| `zosAssistant.maxSpoolLines` | `200` | Spool lines before truncation |
| `zosAssistant.telemetryEnabled` | `true` | Local usage tracking |

---

## Development

```bash
# Install dependencies
npm install

# Bundle & watch (for development)
npm run bundle:watch

# In VS Code: press F5 to launch Extension Host

# Run tests
npm test

# Lint
npm run lint

# Package VSIX
npm run vsix:pre
```

### Project Structure

```
src/
├── participant.ts              # Entry point & command router
├── handlers/
│   ├── datasets.handler.ts     # /ds — 10 operations
│   ├── jobs.handler.ts         # /jobs — 7 operations
│   ├── run.handler.ts          # /run — 4 operations
│   └── stubs.ts                # /tso, /uss — placeholders
├── intents/
│   ├── ds.classifier.ts        # LLM classification for /ds
│   ├── ds.schemas.ts           # Intent types & safety levels
│   ├── jobs.classifier.ts      # LLM classification for /jobs
│   ├── jobs.schemas.ts
│   ├── run.classifier.ts       # LLM classification for /run
│   └── run.schemas.ts
├── zowe/
│   ├── session.ts              # Zowe profile & session management
│   └── safety.ts               # Confirmation & production detection
├── utils/
│   └── telemetry.ts            # Local usage tracking
└── __tests__/
    └── safety.test.ts          # Unit tests
```

---

## Telemetry

All telemetry data is **stored locally** on your machine (VS Code `globalState`). Nothing is sent externally.

Run the command `z/OS: Usage report (last 30 days)` to generate a usage report for your team.

---

## Roadmap

- [ ] `/tso` — TSO and console commands
- [ ] `/uss` — USS filesystem operations
- [ ] Multi-profile support (switch between LPAR environments)
- [ ] Copilot instruction file for enhanced COBOL assistance
- [ ] Dataset content caching for faster repeated reads

---

## License

MIT — see [LICENSE](LICENSE).
