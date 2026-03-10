# Documentation Développeur — z/OS Assistant for Copilot

> Version 0.5.0 — Extension VS Code (TypeScript)
> Dernière mise à jour : mars 2026

---

## Table des matières

1. [Vue d'ensemble du projet](#1-vue-densemble-du-projet)
2. [Architecture générale](#2-architecture-générale)
3. [Structure du projet](#3-structure-du-projet)
4. [Technologies et dépendances](#4-technologies-et-dépendances)
5. [Point d'entrée de l'extension](#5-point-dentrée-de-lextension)
6. [Handlers (gestionnaires de commandes)](#6-handlers-gestionnaires-de-commandes)
7. [Classificateurs d'intentions (Intents)](#7-classificateurs-dintentions-intents)
8. [Outils de modèle de langage (LM Tools)](#8-outils-de-modèle-de-langage-lm-tools)
9. [Gestion des sessions Zowe](#9-gestion-des-sessions-zowe)
10. [Système de sécurité (Safety)](#10-système-de-sécurité-safety)
11. [Télémétrie](#11-télémétrie)
12. [Configuration](#12-configuration)
13. [Scripts de build et packaging](#13-scripts-de-build-et-packaging)
14. [Tests unitaires](#14-tests-unitaires)
15. [Flux de données — Exemple complet](#15-flux-de-données--exemple-complet)
16. [Ajouter une nouvelle fonctionnalité](#16-ajouter-une-nouvelle-fonctionnalité)
17. [Conventions de code](#17-conventions-de-code)

---

## 1. Vue d'ensemble du projet

**z/OS Assistant for Copilot** est une extension VS Code qui intègre GitHub Copilot Chat avec les systèmes mainframe z/OS via le SDK Zowe. Elle permet aux développeurs d'interagir en langage naturel (français ou anglais) avec z/OS directement depuis leur éditeur.

### Fonctionnalités principales

| Commande | Description | Statut |
|----------|-------------|--------|
| `@zos /ds` | Opérations sur les datasets et membres PDS | Implémenté |
| `@zos /jobs` | Surveillance des jobs et sorties spool | Implémenté |
| `@zos /run` | Soumission et suivi JCL | Implémenté |
| `@zos /lpar` | Gestion des profils multi-LPAR | Implémenté |
| `@zos /tso` | Commandes TSO | Stub (placeholder) |
| `@zos /uss` | Opérations USS | Stub (placeholder) |

---

## 2. Architecture générale

```
┌──────────────────────────────────────────────┐
│   VS Code + GitHub Copilot Chat              │
│   (@zos participant)                         │
└──────────────┬───────────────────────────────┘
               │ Commandes utilisateur
        ┌──────▼────────┐   ┌──────────────────┐
        │   Handlers    │   │   LM Tools        │
        │  (src/handlers│   │  (src/tools/      │
        │   /*.ts)      │   │   registry.ts)    │
        └──────┬────────┘   └────────┬──────────┘
               │                     │
        ┌──────▼─────────────────────▼──────────┐
        │   Intent Classifiers                  │
        │   (src/intents/*.classifier.ts)       │
        │   → Appels Claude API via LLM request │
        └──────┬────────────────────────────────┘
               │
        ┌──────▼──────────────────────────────┐
        │   Safety Module                     │
        │   (src/zowe/safety.ts)              │
        │   → Vérification + confirmation     │
        └──────┬──────────────────────────────┘
               │
        ┌──────▼──────────────────────────────┐
        │   Zowe SDK                          │
        │   (@zowe/zos-files, zos-jobs, etc.) │
        └──────┬──────────────────────────────┘
               │ REST z/OSMF
        ┌──────▼──────────────────────────────┐
        │   Système z/OS                      │
        └─────────────────────────────────────┘
```

---

## 3. Structure du projet

```
zLMTools/
├── src/
│   ├── participant.ts              # Activation de l'extension, dispatch principal
│   ├── handlers/
│   │   ├── datasets.handler.ts     # 17 opérations sur les datasets
│   │   ├── jobs.handler.ts         # 7 opérations sur les jobs
│   │   ├── run.handler.ts          # 6 opérations de soumission JCL
│   │   ├── lpar.handler.ts         # Gestion des profils LPAR
│   │   ├── stubs.ts                # Handlers TSO/USS (non implémentés)
│   │   └── index.ts                # Exports des handlers
│   ├── intents/
│   │   ├── ds.classifier.ts        # Classificateur d'intentions /ds
│   │   ├── ds.schemas.ts           # Interfaces TypeScript des intentions /ds
│   │   ├── jobs.classifier.ts      # Classificateur d'intentions /jobs
│   │   ├── jobs.schemas.ts
│   │   ├── run.classifier.ts       # Classificateur d'intentions /run
│   │   └── run.schemas.ts
│   ├── tools/
│   │   └── registry.ts             # Enregistrement des LM Tools (20+ outils)
│   ├── zowe/
│   │   ├── session.ts              # Gestion et cache des sessions Zowe
│   │   └── safety.ts               # Système de sécurité à 3 niveaux
│   ├── utils/
│   │   └── telemetry.ts            # Télémétrie locale
│   ├── types/
│   │   └── chat-result.ts          # Types pour résultats et followups
│   ├── __tests__/
│   │   └── safety.test.ts          # Tests unitaires du module safety
│   └── __mocks__/
│       └── vscode.ts               # Mock de l'API VS Code pour les tests
├── docs/
│   ├── GUIDE_UTILISATEUR.md        # Guide utilisateur en français
│   └── DOCUMENTATION_DEVELOPPEUR.md  # Ce fichier
├── downloads/                      # Datasets téléchargés localement
├── assets/                         # Icône de l'extension
├── dist/                           # Fichiers compilés (ignorés par git)
├── package.json                    # Manifeste VS Code + dépendances
├── tsconfig.json                   # Configuration TypeScript
├── jest.config.js                  # Configuration Jest
├── .eslintrc.json                  # Règles ESLint
├── Makefile                        # Automatisation des builds
└── zapp.yaml                       # Groupes de propriétés Z Open Editor
```

---

## 4. Technologies et dépendances

### Runtime

| Technologie | Version | Rôle |
|-------------|---------|------|
| TypeScript | 5.5.0 | Langage principal (mode strict) |
| Node.js | 20+ | Runtime |
| VS Code API | 1.105+ | API extension |

### Dépendances de production

| Package | Version | Rôle |
|---------|---------|------|
| `@zowe/zos-files-for-zowe-sdk` | 8.0.0 | Opérations sur les datasets |
| `@zowe/zos-jobs-for-zowe-sdk` | 8.0.0 | Gestion des jobs JES |
| `@zowe/zos-tso-for-zowe-sdk` | 8.0.0 | Commandes TSO (stubbed) |
| `@zowe/zosmf-for-zowe-sdk` | 8.0.0 | API REST z/OSMF |
| `@zowe/zowe-explorer-api` | 3.0.0 | Intégration Zowe Explorer |

### Dépendances de développement

| Package | Version | Rôle |
|---------|---------|------|
| `esbuild` | 0.24.0 | Bundling rapide |
| `jest` | 29.7.0 | Framework de tests |
| `ts-jest` | — | Transpilation TS pour Jest |
| `@vscode/vsce` | — | Packaging `.vsix` |
| `eslint` | 8.57.1 | Linting |
| `@typescript-eslint` | — | Règles TypeScript pour ESLint |

---

## 5. Point d'entrée de l'extension

**Fichier :** [src/participant.ts](../src/participant.ts)

### Activation

La fonction `activate(context)` est appelée par VS Code au démarrage. Elle :

1. **Enregistre le participant Copilot** `@zos` via `vscode.chat.createChatParticipant()`
2. **Configure le handler principal** qui dispatche vers les handlers spécialisés selon la commande
3. **Enregistre les commandes VS Code** :
   - `zos.openMember` — Ouvre un membre PDS dans un onglet éditeur
   - `zos.telemetryReport` — Affiche le rapport de télémétrie (30 jours)
   - `zos.clearSessionCache` — Vide le cache de session Zowe
   - `zos.selectLpar` — Change la partition z/OS active
4. **Crée la barre de statut** affichant le profil LPAR actif

### Dispatch des commandes

```typescript
// Logique de dispatch simplifiée
switch (request.command) {
  case 'ds':    return await DatasetsHandler.handle(request, context, stream, token);
  case 'jobs':  return await JobsHandler.handle(request, context, stream, token);
  case 'run':   return await RunHandler.handle(request, context, stream, token);
  case 'lpar':  return await LparHandler.handle(request, context, stream, token);
  case 'tso':   return await stubs.tsoStub(stream);
  case 'uss':   return await stubs.ussStub(stream);
}
```

---

## 6. Handlers (gestionnaires de commandes)

### 6.1 DatasetsHandler — `src/handlers/datasets.handler.ts`

Gère toutes les opérations sur les datasets z/OS (17 opérations).

#### Opérations implémentées

| Intention | Description | Niveau de sécurité |
|-----------|-------------|-------------------|
| `LIST_DATASETS` | Lister les datasets selon un pattern HLQ | Sûr |
| `LIST_MEMBERS` | Lister les membres d'un PDS | Sûr |
| `READ_MEMBER` | Afficher le contenu d'un membre | Sûr |
| `DATASET_INFO` | Afficher les attributs d'un dataset | Sûr |
| `SEARCH_CONTENT` | Rechercher une chaîne dans un PDS | Sûr |
| `DOWNLOAD_MEMBER` | Télécharger un membre localement | Modéré |
| `DOWNLOAD_ALL_MEMBERS` | Télécharger tous les membres | Modéré |
| `DOWNLOAD_ALL_DATASETS` | Télécharger tous les datasets matchant | Modéré |
| `UPLOAD_FILE` | Uploader un fichier local vers un PDS | Modéré |
| `UPLOAD_DIR` | Uploader un répertoire entier vers un PDS | Modéré |
| `COPY_MEMBER` | Copier un membre vers une destination | Modéré |
| `COPY_DATASET` | Copier un dataset | Modéré |
| `CREATE_DATASET` | Créer un dataset (5 types prédéfinis) | Modéré |
| `DELETE_MEMBER` | Supprimer un membre PDS | Dangereux |
| `DELETE_DATASET` | Supprimer un dataset | Dangereux |

#### Types de datasets pour CREATE_DATASET

```typescript
type DatasetPreset =
  | 'PARTITIONED'  // PDS classique (RECFM=FB, LRECL=80)
  | 'SEQUENTIAL'   // Dataset séquentiel
  | 'CLASSIC'      // PDS compatibilité ancienne génération
  | 'BINARY'       // Dataset binaire (RECFM=U)
  | 'C';           // Source C (RECFM=VB, LRECL=255)
```

---

### 6.2 JobsHandler — `src/handlers/jobs.handler.ts`

Gère la surveillance des jobs JES.

| Intention | Description | Niveau de sécurité |
|-----------|-------------|-------------------|
| `LIST_JOBS` | Lister les jobs selon un filtre | Sûr |
| `JOB_STATUS` | Statut d'un job spécifique | Sûr |
| `JOB_OUTPUT` | Récupérer les sorties spool | Sûr |
| `JOB_SPOOL_FILE` | Lire un DD spécifique du spool | Sûr |
| `CANCEL_JOB` | Annuler un job actif | Dangereux |
| `PURGE_JOB` | Purger un job du JES | Dangereux |
| `MONITOR_JOB` | Surveiller un job jusqu'à complétion | Sûr |

---

### 6.3 RunHandler — `src/handlers/run.handler.ts`

Gère la soumission de JCL.

| Intention | Description |
|-----------|-------------|
| `SUBMIT_FROM_DATASET` | Soumettre un JCL depuis un dataset z/OS |
| `SUBMIT_INLINE` | Soumettre un JCL fourni en ligne |
| `SUBMIT_LOCAL_FILE` | Soumettre un fichier JCL local |
| `RESUBMIT` | Resoumettre le dernier JCL |
| `SUBMIT_AND_MONITOR` | Soumettre et suivre jusqu'à complétion |
| `SUBMIT_WITH_OVERRIDES` | Soumettre avec substitution de paramètres |

---

### 6.4 LparHandler — `src/handlers/lpar.handler.ts`

Gère la commutation entre profils Zowe (multi-LPAR).

- Liste les profils disponibles dans `zowe.config.json`
- Permet de sélectionner le profil actif via interface rapide VS Code
- Persiste le profil sélectionné dans les settings

---

### 6.5 Stubs — `src/handlers/stubs.ts`

Placeholders pour `/tso` et `/uss`. Retournent un message indiquant que la fonctionnalité est en développement.

---

## 7. Classificateurs d'intentions (Intents)

### Principe

Chaque handler utilise un **classificateur d'intentions** pour interpréter le langage naturel en actions structurées.

**Flux :**
```
Texte utilisateur → LLM (Claude API) → JSON structuré → Action Zowe SDK
```

### Structure d'un classificateur

```typescript
// Exemple : src/intents/ds.classifier.ts
export class DsIntentClassifier {
  async classify(
    prompt: string,
    token: vscode.CancellationToken
  ): Promise<DsIntent> {
    // 1. Construit un prompt système décrivant les intentions possibles
    // 2. Envoie au modèle de langage via vscode.lm.selectChatModels()
    // 3. Parse la réponse JSON
    // 4. Retourne un objet typé (ex: { type: "LIST_MEMBERS", pds: "HLQ.SRC" })
  }
}
```

### Schémas d'intentions

Chaque module `*.schemas.ts` définit les interfaces TypeScript correspondant aux intentions :

```typescript
// src/intents/ds.schemas.ts (exemple)
export type DsIntent =
  | { type: 'LIST_DATASETS'; pattern: string }
  | { type: 'LIST_MEMBERS'; pds: string }
  | { type: 'READ_MEMBER'; pds: string; member: string }
  | { type: 'CREATE_DATASET'; name: string; preset: DatasetPreset }
  | { type: 'DELETE_MEMBER'; pds: string; member: string }
  // ... 17 types au total
```

---

## 8. Outils de modèle de langage (LM Tools)

**Fichier :** [src/tools/registry.ts](../src/tools/registry.ts)

### Présentation

Les LM Tools sont des outils invocables automatiquement par GitHub Copilot lors d'une conversation (sans commande explicite). Ils sont enregistrés via `vscode.lm.registerTool()`.

### Outils disponibles

#### Datasets
| Nom de l'outil | Description |
|----------------|-------------|
| `zos_listDatasets` | Lister les datasets |
| `zos_listMembers` | Lister les membres d'un PDS |
| `zos_readMember` | Lire le contenu d'un membre |
| `zos_datasetInfo` | Informations sur un dataset |
| `zos_searchContent` | Rechercher dans un PDS |
| `zos_downloadMember` | Télécharger un membre |
| `zos_downloadAllMembers` | Télécharger tous les membres |
| `zos_downloadAllDatasets` | Télécharger datasets en masse |
| `zos_uploadFileToPds` | Uploader un fichier |
| `zos_uploadDirToPds` | Uploader un répertoire |
| `zos_copyMember` | Copier un membre |
| `zos_copyDataset` | Copier un dataset |
| `zos_createDataset` | Créer un dataset |
| `zos_deleteMember` | Supprimer un membre |
| `zos_deleteDataset` | Supprimer un dataset |

#### Jobs
| Nom de l'outil | Description |
|----------------|-------------|
| `zos_listJobs` | Lister les jobs |
| `zos_getJobStatus` | Statut d'un job |
| `zos_getJobOutput` | Sorties spool d'un job |

#### JCL
| Nom de l'outil | Description |
|----------------|-------------|
| `zos_submitLocalJcl` | Soumettre un JCL local |
| `zos_submitJcl` | Soumettre un JCL depuis z/OS |

### Structure d'un LM Tool

```typescript
vscode.lm.registerTool('zos_listMembers', {
  // Schéma JSON des paramètres d'entrée
  inputSchema: {
    type: 'object',
    properties: {
      pds: { type: 'string', description: 'Nom du PDS' }
    },
    required: ['pds']
  },
  // Logique d'exécution
  async invoke(input, token) {
    const session = await ZoweSessionManager.getSession();
    const members = await List.allMembers(session, input.pds);
    return { content: [{ type: 'text', value: formatMembers(members) }] };
  }
});
```

---

## 9. Gestion des sessions Zowe

**Fichier :** [src/zowe/session.ts](../src/zowe/session.ts)

### ZoweSessionManager

Classe singleton qui gère les connexions aux systèmes z/OS.

#### Stratégie de résolution de session

```
1. Vérification du cache en mémoire (évite re-auth)
         ↓
2. Lecture du profil actif depuis les settings VS Code
         ↓
3. Tentative via Zowe Explorer API (si l'extension est installée)
         ↓
4. Fallback : lecture directe de zowe.config.json
         ↓
5. Création de la session AbstractSession Zowe
```

#### Méthodes principales

```typescript
class ZoweSessionManager {
  // Récupère (ou crée) la session active
  static async getSession(): Promise<AbstractSession>

  // Vide le cache (utile après changement de profil)
  static clearCache(): void

  // Liste les profils z/OSMF disponibles
  static async listProfiles(): Promise<string[]>

  // Définit le profil actif
  static async setActiveProfile(name: string): Promise<void>
}
```

---

## 10. Système de sécurité (Safety)

**Fichier :** [src/zowe/safety.ts](../src/zowe/safety.ts)

### Niveaux de sécurité

```typescript
type SafetyLevel = 'safe' | 'moderate' | 'dangerous';
```

| Niveau | Exemples d'opérations | Comportement |
|--------|----------------------|--------------|
| `safe` | list, read, status, info, search | Exécution directe, sans confirmation |
| `moderate` | write, create, download, upload | Notification informative |
| `dangerous` | delete, cancel, purge | Dialog modal de confirmation obligatoire |

### Détection de la production

Les datasets correspondant aux patterns suivants sont automatiquement considérés comme "production" :

```typescript
const DEFAULT_PRODUCTION_PATTERNS = [
  '*.PROD.*',
  '*.PRD.*',
  '*.PRODUCTION.*',
  'SYS*.**'
];
```

**Escalade de sécurité :** Une opération `moderate` sur un dataset de production est automatiquement traitée comme `dangerous`.

### Fonction principale

```typescript
async function getEffectiveSafetyLevel(
  operation: SafetyLevel,
  resourceName: string,
  config: vscode.WorkspaceConfiguration
): Promise<SafetyLevel>
```

### Confirmation utilisateur

```typescript
async function requestDangerousConfirmation(
  operationDescription: string
): Promise<boolean>
// → Affiche un dialog modal VS Code avec boutons "Confirmer" / "Annuler"
```

---

## 11. Télémétrie

**Fichier :** [src/utils/telemetry.ts](../src/utils/telemetry.ts)

La télémétrie est **100% locale** — aucune donnée n'est envoyée à l'extérieur.

### Événements trackés

- Nombre d'appels par commande (`/ds`, `/jobs`, `/run`, `/lpar`)
- Opérations les plus fréquentes
- Erreurs rencontrées (sans données personnelles)

### Stockage

Les événements sont stockés dans `vscode.globalState` (base de données VS Code locale).

### Activation/Désactivation

Configurable via `zosAssistant.telemetryEnabled` (défaut : `true`).

### Affichage du rapport

```bash
# Via la palette de commandes VS Code
> zOS: Rapport de télémétrie
```

---

## 12. Configuration

Toutes les options sont définies dans [package.json](../package.json) sous `contributes.configuration`.

### Paramètres généraux

| Clé | Type | Défaut | Description |
|-----|------|--------|-------------|
| `zosAssistant.defaultProfile` | `string` | `""` | Profil Zowe par défaut |
| `zosAssistant.confirmDangerousOperations` | `boolean` | `true` | Activer les confirmations |
| `zosAssistant.protectedDatasetPatterns` | `string[]` | Patterns PROD | Patterns de datasets protégés |
| `zosAssistant.monitorTimeoutSeconds` | `number` | `300` | Timeout de surveillance des jobs |
| `zosAssistant.monitorPollIntervalSeconds` | `number` | `5` | Intervalle de polling |
| `zosAssistant.maxSpoolLines` | `number` | `200` | Nombre max de lignes spool |
| `zosAssistant.telemetryEnabled` | `boolean` | `true` | Activer la télémétrie locale |

### Paramètres de création de datasets

| Clé | Type | Défaut | Valeurs possibles |
|-----|------|--------|-------------------|
| `zosAssistant.createDefaults.alcunit` | `string` | `TRK` | `TRK`, `CYL` |
| `zosAssistant.createDefaults.primary` | `number` | `10` | — |
| `zosAssistant.createDefaults.secondary` | `number` | `5` | — |
| `zosAssistant.createDefaults.recfm` | `string` | `FB` | `FB`, `VB`, `F`, `V`, `U`, `FBA`, `VBA` |
| `zosAssistant.createDefaults.lrecl` | `number` | `80` | — |
| `zosAssistant.createDefaults.blksize` | `number` | `0` | 0 = automatique |
| `zosAssistant.createDefaults.dirblkPds` | `number` | `20` | — |
| `zosAssistant.createDefaults.volser` | `string` | `""` | — |
| `zosAssistant.createDefaults.storclass` | `string` | `""` | — |
| `zosAssistant.createDefaults.mgntclass` | `string` | `""` | — |
| `zosAssistant.createDefaults.dataclass` | `string` | `""` | — |

---

## 13. Scripts de build et packaging

### Commandes principales

```bash
# Compilation TypeScript
npm run compile

# Mode développement (watch)
npm run watch

# Bundle esbuild (non minifié)
npm run bundle

# Bundle production (minifié)
npm run package

# Créer le package .vsix
npm run vsix

# Linting ESLint
npm run lint

# Tests unitaires Jest
npm run test
```

### Fichier de sortie

Le point d'entrée de l'extension est `dist/participant.js` — un bundle unique généré par esbuild depuis `src/participant.ts`.

### Packaging

```bash
npm run vsix
# → Génère zLMTools-0.5.0.vsix à la racine du projet
```

Installation locale du `.vsix` :
```bash
code --install-extension zLMTools-0.5.0.vsix
```

---

## 14. Tests unitaires

### Configuration

**Fichier :** [jest.config.js](../jest.config.js)

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^vscode$': '<rootDir>/src/__mocks__/vscode.ts'
  }
};
```

### Mock VS Code

Le fichier [src/__mocks__/vscode.ts](../src/__mocks__/vscode.ts) fournit un mock de l'API VS Code permettant d'exécuter les tests sans VS Code réel.

### Tests existants

**[src/__tests__/safety.test.ts](../src/__tests__/safety.test.ts)** — Tests du module de sécurité :
- Détection des patterns de production
- Escalade de niveau de sécurité
- Comportement avec `confirmDangerousOperations: false`

### Lancer les tests

```bash
npm run test
# ou
npx jest --coverage
```

---

## 15. Flux de données — Exemple complet

### Scénario : `@zos /ds list les membres de HLQ.COBOL.SRC`

```
1. UTILISATEUR
   └─ Saisit : "@zos /ds liste les membres de HLQ.COBOL.SRC"

2. VS CODE
   └─ Appelle participant.ts → handler 'ds'

3. DATASETS HANDLER (datasets.handler.ts)
   └─ Appelle DsIntentClassifier.classify(prompt, token)

4. INTENT CLASSIFIER (ds.classifier.ts)
   ├─ Construit un prompt système avec les 17 types d'intentions
   ├─ Envoie au LLM via vscode.lm.sendRequest()
   └─ Reçoit : { type: "LIST_MEMBERS", pds: "HLQ.COBOL.SRC" }

5. SAFETY CHECK (safety.ts)
   ├─ Opération LIST_MEMBERS → niveau 'safe'
   ├─ Pattern "HLQ.COBOL.SRC" → non production
   └─ → Pas de confirmation requise

6. ZOWE SESSION (session.ts)
   └─ Récupère la session depuis le cache (ou crée une nouvelle)

7. ZOWE SDK
   └─ List.allMembers(session, "HLQ.COBOL.SRC")
   └─ Retourne : ["PROG1", "PROG2", "UTIL01", ...]

8. FORMATAGE ET RÉPONSE
   ├─ stream.markdown("### Membres de HLQ.COBOL.SRC\n...")
   └─ Retourne des followups :
       - "Lire le contenu de PROG1"
       - "Télécharger tous les membres"
       - "Rechercher une chaîne dans le PDS"

9. TÉLÉMÉTRIE
   └─ Enregistre l'événement { command: 'ds', operation: 'LIST_MEMBERS' }
```

---

## 16. Ajouter une nouvelle fonctionnalité

### Exemple : Ajouter une opération `RENAME_MEMBER`

#### Étape 1 — Définir le schéma d'intention

Dans [src/intents/ds.schemas.ts](../src/intents/ds.schemas.ts) :

```typescript
export type DsIntent =
  | ... // intentions existantes
  | { type: 'RENAME_MEMBER'; pds: string; oldName: string; newName: string };
```

#### Étape 2 — Mettre à jour le classificateur

Dans [src/intents/ds.classifier.ts](../src/intents/ds.classifier.ts), ajouter la description de la nouvelle intention dans le prompt système :

```typescript
const systemPrompt = `
  ...intentions existantes...

  RENAME_MEMBER: L'utilisateur veut renommer un membre.
  Extraire: pds (string), oldName (string), newName (string)
  Exemple: "renomme PROG1 en PROG1_OLD dans HLQ.COBOL.SRC"
`;
```

#### Étape 3 — Implémenter dans le handler

Dans [src/handlers/datasets.handler.ts](../src/handlers/datasets.handler.ts) :

```typescript
case 'RENAME_MEMBER': {
  const { pds, oldName, newName } = intent;

  // Vérification sécurité
  const safetyLevel = await getEffectiveSafetyLevel('moderate', pds, config);
  if (safetyLevel === 'dangerous') {
    const confirmed = await requestDangerousConfirmation(
      `Renommer ${pds}(${oldName}) → ${pds}(${newName})`
    );
    if (!confirmed) return { metadata: { command: 'ds' } };
  }

  // Exécution via Zowe SDK
  const session = await ZoweSessionManager.getSession();
  await Copy.dataSet(session, { dsn: pds, member: oldName }, { dsn: pds, member: newName });
  await Delete.dataSet(session, `${pds}(${oldName})`);

  stream.markdown(`Membre **${oldName}** renommé en **${newName}** dans \`${pds}\`.`);
  break;
}
```

#### Étape 4 — Enregistrer le LM Tool (optionnel)

Dans [src/tools/registry.ts](../src/tools/registry.ts) :

```typescript
vscode.lm.registerTool('zos_renameMember', {
  inputSchema: {
    type: 'object',
    properties: {
      pds: { type: 'string' },
      oldName: { type: 'string' },
      newName: { type: 'string' }
    },
    required: ['pds', 'oldName', 'newName']
  },
  async invoke(input, token) {
    // Logique identique au handler
  }
});
```

#### Étape 5 — Ajouter des tests

Dans [src/__tests__/](../src/__tests__/) :

```typescript
describe('RENAME_MEMBER', () => {
  it('devrait escalader en "dangerous" sur dataset de production', async () => {
    const level = await getEffectiveSafetyLevel('moderate', 'HLQ.PROD.SRC', config);
    expect(level).toBe('dangerous');
  });
});
```

---

## 17. Conventions de code

### TypeScript

- **Mode strict** activé (`"strict": true` dans `tsconfig.json`)
- Typage explicite pour tous les paramètres de fonction
- Pas de `any` implicite
- Préférer `const` à `let`

### Nommage

| Élément | Convention | Exemple |
|---------|------------|---------|
| Classes | PascalCase | `DatasetsHandler` |
| Interfaces/Types | PascalCase | `DsIntent` |
| Fonctions/méthodes | camelCase | `getEffectiveSafetyLevel` |
| Variables | camelCase | `activeProfile` |
| Constantes | SCREAMING_SNAKE_CASE | `DEFAULT_PRODUCTION_PATTERNS` |
| Fichiers | kebab-case | `datasets.handler.ts` |

### Gestion des erreurs

Toujours capturer les erreurs Zowe et les présenter de manière lisible :

```typescript
try {
  const result = await List.dataSet(session, pattern);
  // ...
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  stream.markdown(`Erreur lors de la récupération des datasets : \`${message}\``);
  return { metadata: { command: 'ds' } };
}
```

### Streaming des réponses

Utiliser `stream.markdown()` pour envoyer progressivement la réponse à l'utilisateur, pas seulement à la fin.

### Followups

Chaque handler doit retourner des suggestions d'actions suivantes via le système de followups :

```typescript
return {
  metadata: { command: 'ds' },
  followup: [
    { message: `@zos /ds lire ${pds}(${members[0]})`, label: `Ouvrir ${members[0]}` },
    { message: `@zos /ds télécharger tous les membres de ${pds}`, label: 'Tout télécharger' }
  ]
};
```

---

*Documentation générée pour z/OS Assistant for Copilot v0.5.0*
