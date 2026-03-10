# Developer Documentation — z/OS Assistant for Copilot

> Version 0.6.0 — VS Code Extension (TypeScript)
> Last updated: March 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [General Architecture](#2-general-architecture)
3. [Project Structure](#3-project-structure)
4. [Technologies and Dependencies](#4-technologies-and-dependencies)
5. [Extension Entry Point](#5-extension-entry-point)
6. [Handlers](#6-handlers)
7. [Intent Classifiers](#7-intent-classifiers)
8. [Language Model Tools (LM Tools)](#8-language-model-tools-lm-tools)
9. [Zowe Session Management](#9-zowe-session-management)
10. [Safety System](#10-safety-system)
11. [Telemetry](#11-telemetry)
12. [Configuration](#12-configuration)
13. [Build and Packaging Scripts](#13-build-and-packaging-scripts)
14. [Unit Tests](#14-unit-tests)
15. [Data Flow — Complete Example](#15-data-flow--complete-example)
16. [Adding a New Feature](#16-adding-a-new-feature)
17. [Code Conventions](#17-code-conventions)

---

## 1. Project Overview

**z/OS Assistant for Copilot** is a VS Code extension that integrates GitHub Copilot Chat with z/OS mainframe systems via the Zowe SDK. It allows developers to interact in natural language (English or French) with z/OS directly from their editor.

> **Automatic language detection** — responses are automatically delivered in the same language as the user's prompt. French or English, detected per request with no configuration required.

### Main Features

| Command | Description | Status |
|---------|-------------|--------|
| `@zos /ds` | Dataset and PDS member operations | Implemented |
| `@zos /jobs` | Job monitoring and spool output | Implemented |
| `@zos /run` | JCL submission and monitoring | Implemented |
| `@zos /lpar` | Multi-LPAR profile management | Implemented |
| `@zos /tso` | TSO commands | Stub (placeholder) |
| `@zos /uss` | USS operations | Stub (placeholder) |

---

## 2. General Architecture

```
┌──────────────────────────────────────────────┐
│   VS Code + GitHub Copilot Chat              │
│   (@zos participant)                         │
└──────────────┬───────────────────────────────┘
               │ User commands
        ┌──────▼────────┐   ┌──────────────────┐
        │   Handlers    │   │   LM Tools        │
        │  (src/handlers│   │  (src/tools/      │
        │   /*.ts)      │   │   registry.ts)    │
        └──────┬────────┘   └────────┬──────────┘
               │                     │
        ┌──────▼─────────────────────▼──────────┐
        │   Intent Classifiers                  │
        │   (src/intents/*.classifier.ts)       │
        │   → Claude API calls via LLM request  │
        └──────┬────────────────────────────────┘
               │
        ┌──────▼──────────────────────────────┐
        │   Safety Module                     │
        │   (src/zowe/safety.ts)              │
        │   → Verification + confirmation     │
        └──────┬──────────────────────────────┘
               │
        ┌──────▼──────────────────────────────┐
        │   Zowe SDK                          │
        │   (@zowe/zos-files, zos-jobs, etc.) │
        └──────┬──────────────────────────────┘
               │ REST z/OSMF
        ┌──────▼──────────────────────────────┐
        │   z/OS System                       │
        └─────────────────────────────────────┘
```

---

## 3. Project Structure

```
zLMTools/
├── src/
│   ├── participant.ts              # Extension activation, main dispatch
│   ├── handlers/
│   │   ├── datasets.handler.ts     # 17 dataset operations
│   │   ├── jobs.handler.ts         # 7 job operations
│   │   ├── run.handler.ts          # 6 JCL submission operations
│   │   ├── lpar.handler.ts         # LPAR profile management
│   │   ├── stubs.ts                # TSO/USS handlers (not yet implemented)
│   │   └── index.ts                # Handler exports
│   ├── intents/
│   │   ├── ds.classifier.ts        # /ds intent classifier
│   │   ├── ds.schemas.ts           # TypeScript interfaces for /ds intents
│   │   ├── jobs.classifier.ts      # /jobs intent classifier
│   │   ├── jobs.schemas.ts
│   │   ├── run.classifier.ts       # /run intent classifier
│   │   └── run.schemas.ts
│   ├── tools/
│   │   └── registry.ts             # LM Tools registration (20+ tools)
│   ├── zowe/
│   │   ├── session.ts              # Zowe session management and cache
│   │   └── safety.ts               # Three-tier safety system
│   ├── utils/
│   │   ├── i18n.ts                 # Language detection and translation helpers
│   │   └── telemetry.ts            # Local telemetry
│   ├── types/
│   │   └── chat-result.ts          # Types for results and followups
│   ├── __tests__/
│   │   └── safety.test.ts          # Unit tests for the safety module
│   └── __mocks__/
│       └── vscode.ts               # VS Code API mock for tests
├── docs/
│   ├── GUIDE_UTILISATEUR.md        # User guide (French)
│   ├── DOCUMENTATION_DEVELOPPEUR.md  # Developer documentation (French)
│   └── DEVELOPER_DOCUMENTATION.md   # This file
├── downloads/                      # Locally downloaded datasets
├── assets/                         # Extension icon
├── dist/                           # Compiled files (git-ignored)
├── package.json                    # VS Code manifest + dependencies
├── tsconfig.json                   # TypeScript configuration
├── jest.config.js                  # Jest configuration
├── .eslintrc.json                  # ESLint rules
├── Makefile                        # Build automation
└── zapp.yaml                       # Z Open Editor property groups
```

---

## 4. Technologies and Dependencies

### Runtime

| Technology | Version | Role |
|------------|---------|------|
| TypeScript | 5.5.0 | Primary language (strict mode) |
| Node.js | 20+ | Runtime |
| VS Code API | 1.105+ | Extension API |

### Production Dependencies

| Package | Version | Role |
|---------|---------|------|
| `@zowe/zos-files-for-zowe-sdk` | 8.0.0 | Dataset operations |
| `@zowe/zos-jobs-for-zowe-sdk` | 8.0.0 | JES job management |
| `@zowe/zos-tso-for-zowe-sdk` | 8.0.0 | TSO commands (stubbed) |
| `@zowe/zosmf-for-zowe-sdk` | 8.0.0 | z/OSMF REST API |
| `@zowe/zowe-explorer-api` | 3.0.0 | Zowe Explorer integration |

### Development Dependencies

| Package | Version | Role |
|---------|---------|------|
| `esbuild` | 0.24.0 | Fast bundling |
| `jest` | 29.7.0 | Test framework |
| `ts-jest` | — | TypeScript transpilation for Jest |
| `@vscode/vsce` | — | `.vsix` packaging |
| `eslint` | 8.57.1 | Linting |
| `@typescript-eslint` | — | TypeScript rules for ESLint |

---

## 5. Extension Entry Point

**File:** [src/participant.ts](../src/participant.ts)

### Activation

The `activate(context)` function is called by VS Code on startup. It:

1. **Registers the Copilot participant** `@zos` via `vscode.chat.createChatParticipant()`
2. **Configures the main handler** that dispatches to specialized handlers based on the command
3. **Registers VS Code commands**:
   - `zos.openMember` — Opens a PDS member in an editor tab
   - `zos.telemetryReport` — Displays the telemetry report (30 days)
   - `zos.clearSessionCache` — Clears the Zowe session cache
   - `zos.selectLpar` — Switches the active z/OS partition
4. **Creates the status bar** showing the active LPAR profile

### Command Dispatch

```typescript
// Simplified dispatch logic
switch (request.command) {
  case 'ds':    return await DatasetsHandler.handle(request, context, stream, token);
  case 'jobs':  return await JobsHandler.handle(request, context, stream, token);
  case 'run':   return await RunHandler.handle(request, context, stream, token);
  case 'lpar':  return await LparHandler.handle(request, context, stream, token);
  case 'tso':   return await stubs.tsoStub(stream);
  case 'uss':   return await stubs.ussStub(stream);
}
```

### Language Detection

At the start of each `handle()` call, the prompt language is detected once using a lightweight heuristic (no extra LLM call):

```typescript
// src/utils/i18n.ts
this.lang = detectLanguage(request.prompt);  // returns 'fr' | 'en'
```

All response strings are then selected via the `t(fr, en)` shorthand:

```typescript
stream.progress(this.t('Analyse de la requête...', 'Analyzing request...'));
```

---

## 6. Handlers

### 6.1 DatasetsHandler — `src/handlers/datasets.handler.ts`

Handles all z/OS dataset operations (17 operations).

#### Implemented Operations

| Intent | Description | Safety Level |
|--------|-------------|--------------|
| `LIST_DATASETS` | List datasets by HLQ pattern | Safe |
| `LIST_MEMBERS` | List PDS members | Safe |
| `READ_MEMBER` | Display member content | Safe |
| `DATASET_INFO` | Display dataset attributes | Safe |
| `SEARCH_CONTENT` | Search a string within a PDS | Safe |
| `DOWNLOAD_MEMBER` | Download a member locally | Moderate |
| `DOWNLOAD_ALL_MEMBERS` | Download all members | Moderate |
| `DOWNLOAD_ALL_DATASETS` | Download all matching datasets | Moderate |
| `UPLOAD_FILE` | Upload a local file to a PDS | Moderate |
| `UPLOAD_DIR` | Upload an entire directory to a PDS | Moderate |
| `COPY_MEMBER` | Copy a member to a destination | Moderate |
| `COPY_DATASET` | Copy a dataset | Moderate |
| `CREATE_DATASET` | Create a dataset (5 preset types) | Moderate |
| `WRITE_MEMBER` | Write content to a member | Moderate |
| `CREATE_MEMBER` | Create a new member in a PDS | Moderate |
| `DELETE_MEMBER` | Delete a PDS member | Dangerous |
| `DELETE_DATASET` | Delete an entire dataset | Dangerous |

#### Dataset Types for CREATE_DATASET

```typescript
type DatasetPreset =
  | 'PARTITIONED'  // Standard PDS (RECFM=FB, LRECL=80)
  | 'SEQUENTIAL'   // Sequential dataset (flat file)
  | 'CLASSIC'      // PDS with 25 directory blocks (legacy style)
  | 'BINARY'       // Binary dataset (RECFM=U, blksize=27998)
  | 'C';           // C-language PDS (RECFM=VB, LRECL=260)
```

The `likeDataset` mode is mutually exclusive with `dstype`: it copies all attributes from an existing dataset.

---

### 6.2 JobsHandler — `src/handlers/jobs.handler.ts`

Handles JES job monitoring.

| Intent | Description | Safety Level |
|--------|-------------|--------------|
| `LIST_JOBS` | List jobs by filter | Safe |
| `GET_JOB_STATUS` | Status of a specific job | Safe |
| `GET_JOB_OUTPUT` | Retrieve spool output | Safe |
| `GET_SPOOL_FILE` | Read a specific DD from spool | Safe |
| `CANCEL_JOB` | Cancel an active job | Dangerous |
| `PURGE_JOB` | Purge a job from JES | Dangerous |
| `MONITOR_JOB` | Monitor a job until completion | Safe |

Visual RC indicators are automatically applied: ✅ RC=0, 🟡 RC≤4, 🔴 RC>4 or ABEND.

---

### 6.3 RunHandler — `src/handlers/run.handler.ts`

Handles JCL submission.

| Intent | Description |
|--------|-------------|
| `SUBMIT_DATASET` | Submit JCL from a z/OS dataset |
| `SUBMIT_INLINE` | Submit JCL provided inline in chat |
| `SUBMIT_LOCAL_FILE` | Submit a local JCL file |
| `RESUBMIT` | Resubmit JCL from a previous job (via JESJCL spool) |
| `SUBMIT_AND_MONITOR` | Submit and monitor until completion |
| `SUBMIT_LOCAL_FILE_AND_MONITOR` | Submit local file and monitor |

JCL validation checks for `//` and `JOB` card before submission.

---

### 6.4 LparHandler — `src/handlers/lpar.handler.ts`

Manages switching between Zowe profiles (multi-LPAR).

- Lists available profiles from `zowe.config.json`
- Allows selecting the active profile via VS Code quick pick
- Persists the selected profile in settings

---

### 6.5 Stubs — `src/handlers/stubs.ts`

Placeholders for `/tso` and `/uss`. Return a message indicating the feature is under development.

---

## 7. Intent Classifiers

### Principle

Each handler uses an **intent classifier** to interpret natural language into structured actions.

**Flow:**
```
User text → LLM (model from Copilot Chat) → Structured JSON → Zowe SDK action
```

The model used is the one selected by the user in the Copilot Chat UI (`request.model`), passed directly to the classifier — no hardcoded model selection.

### Classifier Structure

```typescript
// Example: src/intents/ds.classifier.ts
export class DsIntentClassifier {
  async classify(
    prompt: string,
    token: vscode.CancellationToken,
    model: vscode.LanguageModelChat   // passed from the handler
  ): Promise<DsIntent | null> {
    // 1. Build a system prompt describing the available intents
    // 2. Send to the language model via model.sendRequest()
    // 3. Parse the JSON response
    // 4. Return a typed object (e.g. { type: "LIST_MEMBERS", dataset: "HLQ.SRC" })
  }
}
```

### Intent Schemas

Each `*.schemas.ts` module defines the TypeScript interfaces for the intents:

```typescript
// src/intents/ds.schemas.ts (excerpt)
export type DsIntent =
  | { type: 'LIST_DATASETS'; pattern: string }
  | { type: 'LIST_MEMBERS'; dataset: string; pattern?: string }
  | { type: 'READ_MEMBER'; dataset: string; member: string }
  | { type: 'CREATE_DATASET'; name: string; dstype?: DatasetPreset; likeDataset?: string }
  | { type: 'DELETE_MEMBER'; dataset: string; member: string }
  // ... 17 types total
```

### Classifier Prompt Design

The system prompt for each classifier:
- Enumerates all possible intent types with their parameters
- Provides worked examples (prompt → JSON)
- Instructs the LLM to respond **only** with a valid JSON object, no markdown
- Handles edge cases (uppercase conversion, ambiguous input)

---

## 8. Language Model Tools (LM Tools)

**File:** [src/tools/registry.ts](../src/tools/registry.ts)

### Overview

LM Tools are tools that GitHub Copilot can invoke automatically during a conversation (without an explicit `@zos` command). They are registered via `vscode.lm.registerTool()`.

### Available Tools

#### Datasets
| Tool Name | Description |
|-----------|-------------|
| `zos_listDatasets` | List datasets matching a pattern |
| `zos_listMembers` | List PDS members |
| `zos_readMember` | Read a member's content |
| `zos_datasetInfo` | Dataset attributes (DSORG, RECFM, LRECL…) |
| `zos_searchContent` | Search text across a PDS |
| `zos_downloadMember` | Download a single member |
| `zos_downloadAllMembers` | Download all members of a PDS |
| `zos_downloadAllDatasets` | Bulk download datasets by pattern |
| `zos_uploadFileToPds` | Upload a local file to a PDS member |
| `zos_uploadDirToPds` | Upload a local directory to a PDS |
| `zos_copyMember` | Copy a PDS member (with optional rename and replace) |
| `zos_copyDataset` | Copy an entire PDS or sequential dataset |
| `zos_createDataset` | Create a z/OS dataset |
| `zos_deleteMember` | Permanently delete a PDS member |
| `zos_deleteDataset` | Permanently delete an entire dataset |

#### Jobs
| Tool Name | Description |
|-----------|-------------|
| `zos_listJobs` | List jobs by owner, prefix, or status |
| `zos_getJobStatus` | Get detailed job status and return code |
| `zos_getJobOutput` | Retrieve spool output |

#### JCL
| Tool Name | Description |
|-----------|-------------|
| `zos_submitLocalJcl` | Submit a local JCL file to z/OS |
| `zos_submitJcl` | Submit JCL from a dataset member |

### LM Tool Structure

```typescript
vscode.lm.registerTool('zos_listMembers', {
  // JSON schema for input parameters
  inputSchema: {
    type: 'object',
    properties: {
      dataset: { type: 'string', description: 'PDS name' }
    },
    required: ['dataset']
  },
  // Execution logic
  async invoke(input, token) {
    const session = await ZoweSessionManager.getSession();
    const members = await List.allMembers(session, input.dataset);
    return { content: [{ type: 'text', value: formatMembers(members) }] };
  }
});
```

---

## 9. Zowe Session Management

**File:** [src/zowe/session.ts](../src/zowe/session.ts)

### ZoweSessionManager

Singleton class that manages connections to z/OS systems.

#### Session Resolution Strategy

```
1. Check in-memory cache (avoids re-auth)
         ↓
2. Read the active profile from VS Code settings
         ↓
3. Attempt via Zowe Explorer API (if the extension is installed)
         ↓
4. Fallback: direct read from zowe.config.json
         ↓
5. Create the Zowe AbstractSession
```

#### Main Methods

```typescript
class ZoweSessionManager {
  // Get (or create) the active session
  static async getSession(): Promise<AbstractSession>

  // Clear the cache (useful after a profile change)
  static clearCache(): void

  // List available z/OSMF profiles
  static async listProfiles(): Promise<string[]>

  // Set the active profile
  static async setActiveProfile(name: string): Promise<void>
}
```

---

## 10. Safety System

**File:** [src/zowe/safety.ts](../src/zowe/safety.ts)

### Safety Levels

```typescript
type SafetyLevel = 'safe' | 'moderate' | 'dangerous';
```

| Level | Example Operations | Behavior |
|-------|-------------------|----------|
| `safe` | list, read, status, info, search | Direct execution, no confirmation |
| `moderate` | write, create, download, upload, copy | Informational notification |
| `dangerous` | delete, cancel, purge | Mandatory modal confirmation dialog |

### Production Detection

Datasets matching the following patterns are automatically flagged as "production":

```typescript
const DEFAULT_PRODUCTION_PATTERNS = [
  '*.PROD.*',
  '*.PRD.*',
  '*.PRODUCTION.*',
  'SYS*.**'
];
```

**Safety escalation:** A `moderate` operation on a production dataset is automatically treated as `dangerous`.

Configurable via `zosAssistant.protectedDatasetPatterns` in VS Code settings.

### Main Functions

```typescript
async function getEffectiveSafetyLevel(
  operation: SafetyLevel,
  resourceName: string,
  config: vscode.WorkspaceConfiguration
): Promise<SafetyLevel>
```

```typescript
async function requestDangerousConfirmation(
  operationDescription: string
): Promise<boolean>
// → Displays a VS Code modal dialog with "Confirm" / "Cancel" buttons
```

---

## 11. Telemetry

**File:** [src/utils/telemetry.ts](../src/utils/telemetry.ts)

Telemetry is **100% local** — no data is sent externally.

### Tracked Events

- Number of calls per command (`/ds`, `/jobs`, `/run`, `/lpar`)
- Most frequently used operations
- Errors encountered (no personal data)

### Storage

Events are stored in `vscode.globalState` (VS Code's local database).

### Enable/Disable

Configurable via `zosAssistant.telemetryEnabled` (default: `true`).

### Viewing the Report

```bash
# Via the VS Code command palette
> z/OS: Usage report (last 30 days)
```

---

## 12. Configuration

All options are defined in [package.json](../package.json) under `contributes.configuration`.

### General Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `zosAssistant.defaultProfile` | `string` | `""` | Default Zowe profile |
| `zosAssistant.confirmDangerousOperations` | `boolean` | `true` | Enable confirmations |
| `zosAssistant.protectedDatasetPatterns` | `string[]` | PROD patterns | Protected dataset patterns |
| `zosAssistant.monitorTimeoutSeconds` | `number` | `300` | Job monitoring timeout |
| `zosAssistant.monitorPollIntervalSeconds` | `number` | `5` | Polling interval |
| `zosAssistant.maxSpoolLines` | `number` | `200` | Max inline spool lines |
| `zosAssistant.telemetryEnabled` | `boolean` | `true` | Enable local telemetry |

### Dataset Creation Defaults

| Key | Type | Default | Possible Values |
|-----|------|---------|-----------------|
| `zosAssistant.createDefaults.alcunit` | `string` | `TRK` | `TRK`, `CYL` |
| `zosAssistant.createDefaults.primary` | `number` | `10` | — |
| `zosAssistant.createDefaults.secondary` | `number` | `5` | — |
| `zosAssistant.createDefaults.recfm` | `string` | `FB` | `FB`, `VB`, `F`, `V`, `U`, `FBA`, `VBA` |
| `zosAssistant.createDefaults.lrecl` | `number` | `80` | — |
| `zosAssistant.createDefaults.blksize` | `number` | `0` | 0 = z/OS-determined |
| `zosAssistant.createDefaults.dirblkPds` | `number` | `20` | — |
| `zosAssistant.createDefaults.volser` | `string` | `""` | — |
| `zosAssistant.createDefaults.storclass` | `string` | `""` | — |
| `zosAssistant.createDefaults.mgntclass` | `string` | `""` | — |
| `zosAssistant.createDefaults.dataclass` | `string` | `""` | — |

---

## 13. Build and Packaging Scripts

### Main Commands

```bash
# TypeScript compilation
npm run compile

# Development mode (watch)
npm run watch

# esbuild bundle (non-minified)
npm run bundle

# Production bundle (minified)
npm run package

# Create the .vsix package
npm run vsix

# ESLint linting
npm run lint

# Jest unit tests
npm run test
```

### Output File

The extension entry point is `dist/participant.js` — a single bundle generated by esbuild from `src/participant.ts`.

### Packaging

```bash
npm run vsix
# → Generates zLMTools-0.6.0.vsix at the project root
```

Local installation of the `.vsix`:
```bash
code --install-extension zLMTools-0.6.0.vsix
```

---

## 14. Unit Tests

### Configuration

**File:** [jest.config.js](../jest.config.js)

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^vscode$': '<rootDir>/src/__mocks__/vscode.ts'
  }
};
```

### VS Code Mock

The file [src/__mocks__/vscode.ts](../src/__mocks__/vscode.ts) provides a mock of the VS Code API, enabling tests to run without a real VS Code instance.

### Existing Tests

**[src/__tests__/safety.test.ts](../src/__tests__/safety.test.ts)** — Safety module tests:
- Production pattern detection
- Safety level escalation
- Behavior with `confirmDangerousOperations: false`

### Running Tests

```bash
npm run test
# or
npx jest --coverage
```

---

## 15. Data Flow — Complete Example

### Scenario: `@zos /ds list members of HLQ.COBOL.SRC`

```
1. USER
   └─ Types: "@zos /ds list members of HLQ.COBOL.SRC"

2. VS CODE
   └─ Calls participant.ts → handler 'ds'

3. DATASETS HANDLER (datasets.handler.ts)
   ├─ detectLanguage(prompt) → 'en'
   └─ Calls DsIntentClassifier.classify(prompt, token, request.model)

4. INTENT CLASSIFIER (ds.classifier.ts)
   ├─ Builds a system prompt with all 17 intent types
   ├─ Sends to the LLM via model.sendRequest()
   └─ Receives: { type: "LIST_MEMBERS", dataset: "HLQ.COBOL.SRC" }

5. SAFETY CHECK (safety.ts)
   ├─ LIST_MEMBERS operation → 'safe' level
   ├─ Pattern "HLQ.COBOL.SRC" → not production
   └─ → No confirmation required

6. ZOWE SESSION (session.ts)
   └─ Retrieves session from cache (or creates a new one)

7. ZOWE SDK
   └─ List.allMembers(session, "HLQ.COBOL.SRC")
   └─ Returns: ["PROG1", "PROG2", "UTIL01", ...]

8. FORMATTING AND RESPONSE
   ├─ stream.markdown("### Members of HLQ.COBOL.SRC\n...")
   └─ Returns followups:
       - "Read the content of PROG1"
       - "Download all members"
       - "Search for a string in the PDS"

9. TELEMETRY
   └─ Records the event { command: 'ds', operation: 'LIST_MEMBERS' }
```

---

## 16. Adding a New Feature

### Example: Adding a `RENAME_MEMBER` Operation

#### Step 1 — Define the Intent Schema

In [src/intents/ds.schemas.ts](../src/intents/ds.schemas.ts):

```typescript
export type DsIntent =
  | ... // existing intents
  | { type: 'RENAME_MEMBER'; dataset: string; oldName: string; newName: string };
```

#### Step 2 — Update the Classifier

In [src/intents/ds.classifier.ts](../src/intents/ds.classifier.ts), add the new intent description to the system prompt:

```typescript
const DS_CLASSIFICATION_PROMPT = `
  ...existing intents...

  | RENAME_MEMBER | Rename a PDS member | dataset (string), oldName (string), newName (string) |

  Example:
  Request: "rename PROG1 to PROG1_OLD in HLQ.COBOL.SRC"
  → { "type": "RENAME_MEMBER", "dataset": "HLQ.COBOL.SRC", "oldName": "PROG1", "newName": "PROG1_OLD" }
`;
```

#### Step 3 — Implement in the Handler

In [src/handlers/datasets.handler.ts](../src/handlers/datasets.handler.ts):

```typescript
case 'RENAME_MEMBER': {
  const { dataset, oldName, newName } = intent;

  // Safety check
  const safetyLevel = await getEffectiveSafetyLevel('moderate', dataset, config);
  if (safetyLevel === 'dangerous') {
    const confirmed = await requestDangerousConfirmation(
      `Rename ${dataset}(${oldName}) → ${dataset}(${newName})`
    );
    if (!confirmed) return { metadata: { command: 'ds' } };
  }

  // Execute via Zowe SDK
  const session = await ZoweSessionManager.getSession();
  await Copy.dataSet(session, { dsn: dataset, member: oldName }, { dsn: dataset, member: newName });
  await Delete.dataSet(session, `${dataset}(${oldName})`);

  stream.markdown(
    this.t(
      `Membre **${oldName}** renommé en **${newName}** dans \`${dataset}\`.`,
      `Member **${oldName}** renamed to **${newName}** in \`${dataset}\`.`
    )
  );
  break;
}
```

#### Step 4 — Register the LM Tool (optional)

In [src/tools/registry.ts](../src/tools/registry.ts):

```typescript
vscode.lm.registerTool('zos_renameMember', {
  inputSchema: {
    type: 'object',
    properties: {
      dataset: { type: 'string' },
      oldName: { type: 'string' },
      newName: { type: 'string' }
    },
    required: ['dataset', 'oldName', 'newName']
  },
  async invoke(input, token) {
    // Same logic as the handler
  }
});
```

#### Step 5 — Add Tests

In [src/__tests__/](../src/__tests__/):

```typescript
describe('RENAME_MEMBER', () => {
  it('should escalate to "dangerous" on a production dataset', async () => {
    const level = await getEffectiveSafetyLevel('moderate', 'HLQ.PROD.SRC', config);
    expect(level).toBe('dangerous');
  });
});
```

---

## 17. Code Conventions

### TypeScript

- **Strict mode** enabled (`"strict": true` in `tsconfig.json`)
- Explicit typing for all function parameters
- No implicit `any`
- Prefer `const` over `let`

### Naming

| Element | Convention | Example |
|---------|------------|---------|
| Classes | PascalCase | `DatasetsHandler` |
| Interfaces/Types | PascalCase | `DsIntent` |
| Functions/methods | camelCase | `getEffectiveSafetyLevel` |
| Variables | camelCase | `activeProfile` |
| Constants | SCREAMING_SNAKE_CASE | `DEFAULT_PRODUCTION_PATTERNS` |
| Files | kebab-case | `datasets.handler.ts` |

### Error Handling

Always catch Zowe errors and present them in a readable way:

```typescript
try {
  const result = await List.dataSet(session, pattern);
  // ...
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  stream.markdown(
    this.t(
      `Erreur lors de la récupération des datasets : \`${message}\``,
      `Error retrieving datasets: \`${message}\``
    )
  );
  return { metadata: { command: 'ds' } };
}
```

### Response Streaming

Use `stream.markdown()` to progressively send the response to the user, not just at the end. Use `stream.progress()` for long-running operations.

### Followups

Each handler should return suggested next actions via the followup system:

```typescript
return {
  metadata: { command: 'ds' },
  followup: [
    { message: `@zos /ds read ${dataset}(${members[0]})`, label: `Open ${members[0]}` },
    { message: `@zos /ds download all members of ${dataset}`, label: 'Download all' }
  ]
};
```

### i18n Pattern

Each handler stores the detected language once per request and exposes a `t()` shorthand:

```typescript
private lang: Lang = 'fr';
private t(fr: string, en: string): string { return this.lang === 'fr' ? fr : en; }

async handle(request, ...) {
  this.lang = detectLanguage(request.prompt);
  // ...
  stream.progress(this.t('Analyse...', 'Analyzing...'));
}
```

---

*Documentation for z/OS Assistant for Copilot v0.6.0*
