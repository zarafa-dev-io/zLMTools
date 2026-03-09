# Guide Utilisateur — z/OS Assistant for Copilot

> Parlez à votre mainframe en langage naturel, directement depuis GitHub Copilot Chat.

---

## Table des matières

1. [Introduction](#introduction)
2. [Prérequis et installation](#prérequis-et-installation)
3. [Premiers pas](#premiers-pas)
4. [Commandes disponibles](#commandes-disponibles)
   - [`@zos /ds` — Gestion des datasets](#zos-ds--gestion-des-datasets)
   - [`@zos /jobs` — Gestion des jobs](#zos-jobs--gestion-des-jobs)
   - [`@zos /run` — Soumission JCL](#zos-run--soumission-jcl)
   - [`@zos /lpar` — Gestion des LPARs](#zos-lpar--gestion-des-lpars)
5. [Outils automatiques (Language Model Tools)](#outils-automatiques-language-model-tools)
6. [Système de sécurité](#système-de-sécurité)
7. [Configuration](#configuration)
8. [Scénarios d'utilisation complets](#scénarios-dutilisation-complets)
9. [Conseils et bonnes pratiques](#conseils-et-bonnes-pratiques)
10. [Dépannage](#dépannage)

---

## Introduction

**z/OS Assistant for Copilot** est une extension VS Code qui connecte GitHub Copilot Chat à votre mainframe IBM z/OS via le SDK Zowe. Elle vous permet de :

- Parcourir, lire, écrire et gérer des datasets z/OS
- Surveiller et administrer vos jobs batch
- Soumettre du JCL depuis un dataset, un fichier local ou directement inline
- Basculer entre plusieurs environnements z/OS (DEV, TEST, PROD)

Tout cela **en langage naturel**, en français ou en anglais, sans quitter votre éditeur.

---

## Prérequis et installation

### Prérequis

| Composant | Version minimale |
|---|---|
| VS Code | ≥ 1.105 |
| GitHub Copilot Chat | Dernière version |
| Zowe Explorer *(recommandé)* | ≥ 3.x |
| z/OSMF | Accessible depuis votre réseau |

### Installation

1. Installez [GitHub Copilot Chat](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat) dans VS Code
2. Installez [Zowe Explorer](https://marketplace.visualstudio.com/items?itemName=Zowe.vscode-extension-for-zowe) et configurez votre profil z/OS
3. Installez **z/OS Assistant for Copilot** depuis le Marketplace VS Code
4. Ouvrez le panneau Copilot Chat (`Ctrl+Alt+I`)
5. Tapez `@zos` pour commencer

> L'extension se connecte automatiquement via le profil actif de Zowe Explorer. Aucune configuration supplémentaire n'est nécessaire si Zowe Explorer est déjà configuré.

**Alternative sans Zowe Explorer :** placez un fichier `zowe.config.json` à la racine de votre workspace.

---

## Premiers pas

### Vérifier la connexion

```
@zos /lpar list
```

Cette commande affiche les partitions z/OS disponibles et le profil actuellement actif (visible aussi dans la barre de statut en bas de VS Code).

### Votre premier exemple

```
@zos /ds list datasets MON.HLQ.**
```

Si vous voyez la liste de vos datasets, vous êtes connecté et prêt.

---

## Commandes disponibles

### `@zos /ds` — Gestion des datasets

La commande `/ds` couvre 17 opérations sur les datasets z/OS et les membres PDS.

#### Lister et explorer

```
# Lister les datasets correspondant à un pattern
@zos /ds list datasets HLQ.COBOL.**
@zos /ds liste les datasets de MON.PROJET.*
@zos /ds show me all datasets matching HLQ.DATA.*

# Lister les membres d'un PDS
@zos /ds show members of HLQ.COBOL.SRC
@zos /ds liste les membres de HLQ.JCL.CNTL
@zos /ds list members in HLQ.COBOL.SRC

# Obtenir les attributs d'un dataset
@zos /ds info about HLQ.COBOL.SRC
@zos /ds dataset info HLQ.WORK.DATA
@zos /ds what are the attributes of HLQ.COBOL.LOAD
```

#### Lire le contenu

```
# Lire un membre PDS (avec coloration syntaxique automatique COBOL/JCL/ASM)
@zos /ds read HLQ.COBOL.SRC(PGMA)
@zos /ds display HLQ.JCL.CNTL(BATCH01)
@zos /ds show content of HLQ.COBOL.SRC(UTILS)
@zos /ds affiche le contenu de MON.PROJET.SRC(MAIN)
```

#### Rechercher dans le contenu

```
# Chercher une chaîne dans tous les membres d'un PDS
@zos /ds search PERFORM in HLQ.COBOL.SRC
@zos /ds search CALL 'DBUTIL' in HLQ.COBOL.SRC
@zos /ds find TODO in HLQ.COBOL.SRC
@zos /ds cherche "ABEND" dans HLQ.COBOL.SRC
```

#### Écrire et créer

```
# Écrire le contenu d'un éditeur VS Code vers un membre PDS
@zos /ds write to HLQ.COBOL.SRC(PGMA)
@zos /ds save to HLQ.COBOL.SRC(NEWPGM)

# Uploader un fichier local vers un membre PDS
@zos /ds upload PGMA.cbl to HLQ.COBOL.SRC(PGMA)
@zos /ds upload directory ./cobol to HLQ.COBOL.SRC
@zos /ds envoie ./src/BATCH01.jcl vers HLQ.JCL.CNTL(BATCH01)

# Créer un nouveau dataset
@zos /ds create PDS HLQ.NEW.SRC lrecl 80
@zos /ds create sequential dataset HLQ.WORK.DATA recfm VB lrecl 256
@zos /ds create classic PDS HLQ.COBOL.SRC primary 5 CYL
@zos /ds create binary library HLQ.LOAD.LIB
@zos /ds create HLQ.NEW.SRC like HLQ.COBOL.SRC
@zos /ds crée un PDS HLQ.MON.PROJET.SRC avec lrecl 80
```

**Types de datasets disponibles à la création :**

| Type | Utilisation typique |
|---|---|
| `PARTITIONED` | PDS standard (sources COBOL, JCL…) |
| `SEQUENTIAL` | Fichier séquentiel (données, rapports…) |
| `CLASSIC` | PDS classique avec paramètres personnalisés |
| `BINARY` | Bibliothèque binaire (load modules) |
| `C` | PDS pour sources C/C++ |

#### Télécharger

```
# Télécharger un membre dans le workspace local
@zos /ds download member PGMA from HLQ.COBOL.SRC
@zos /ds télécharge HLQ.COBOL.SRC(UTILS) localement

# Télécharger tous les membres d'un PDS
@zos /ds download all members of HLQ.COBOL.SRC
@zos /ds télécharge tous les membres de HLQ.JCL.CNTL

# Télécharger tous les datasets correspondant à un pattern
@zos /ds download all datasets HLQ.COBOL.**
```

#### Copier

```
# Copier un membre vers un autre dataset
@zos /ds copy member PGMA from HLQ.COBOL.SRC to HLQ.COBOL.BAK(PGMA)
@zos /ds copie PGMA de HLQ.COBOL.SRC vers HLQ.BACKUP.SRC(PGMA)

# Copier un dataset entier
@zos /ds copy dataset HLQ.COBOL.SRC to HLQ.COBOL.BAK
@zos /ds duplique HLQ.COBOL.SRC vers HLQ.COBOL.NEW
```

#### Supprimer

```
# Supprimer un membre (confirmation requise)
@zos /ds delete member OLDPGM from HLQ.COBOL.SRC
@zos /ds supprime le membre TEMP de HLQ.COBOL.SRC

# Supprimer un dataset entier (confirmation modale requise)
@zos /ds delete dataset HLQ.WORK.DATA
@zos /ds supprime le dataset HLQ.TEMP.FICHIER
```

> **Important :** Les suppressions déclenchent une boîte de dialogue de confirmation. Les datasets correspondant à des patterns de production (ex. `*.PROD.*`) sont signalés avec un avertissement supplémentaire.

---

### `@zos /jobs` — Gestion des jobs

#### Lister les jobs

```
# Lister vos propres jobs
@zos /jobs list my jobs
@zos /jobs liste mes jobs

# Filtrer par statut
@zos /jobs list active jobs
@zos /jobs list jobs with status OUTPUT
@zos /jobs show failed jobs

# Filtrer par préfixe
@zos /jobs list jobs starting with BATCH
@zos /jobs show jobs with prefix NIGHTLY
```

#### Vérifier le statut

```
# Statut d'un job spécifique
@zos /jobs status of JOB12345
@zos /jobs quel est le statut de JOB12345
@zos /jobs check JOB12345 BATCHJOB status

# Indicateurs visuels affichés :
# ✅ CC 0000  — Terminé avec RC 0 (succès)
# 🟡 CC 0004  — Terminé avec warning
# 🔴 CC 0008  — Terminé en erreur
# ⚠️  ABEND   — Arrêt anormal
# ⏳ ACTIVE   — En cours d'exécution
```

#### Consulter la sortie spool

```
# Afficher la sortie complète d'un job
@zos /jobs show output of JOB12345
@zos /jobs affiche la sortie de JOB12345

# Obtenir un fichier spool spécifique
@zos /jobs get SYSPRINT of JOB12345
@zos /jobs show JESMSGLG for JOB12345
```

#### Surveiller un job en temps réel

```
# Surveiller jusqu'à la fin (polling automatique toutes les 5 secondes)
@zos /jobs monitor JOB12345
@zos /jobs monitor JOB12345 BATCHJOB
@zos /jobs surveille JOB12345 jusqu'à la fin
```

> Le monitoring s'arrête automatiquement quand le job se termine ou après le délai configuré (`monitorTimeoutSeconds`, défaut 300s). La sortie spool est affichée automatiquement en fin de job.

#### Annuler et purger

```
# Annuler un job actif (confirmation requise)
@zos /jobs cancel JOB12345
@zos /jobs annule le job JOB12345 BATCHJOB

# Purger un job de la queue JES (confirmation requise)
@zos /jobs purge JOB12345
@zos /jobs supprime JOB12345 de la queue JES
```

---

### `@zos /run` — Soumission JCL

#### Soumettre depuis un dataset z/OS

```
# Soumission simple
@zos /run submit HLQ.JCL.CNTL(BATCH01)
@zos /run soumet HLQ.JCL.CNTL(NIGHTLY)
@zos /run lance le job HLQ.JCL.CNTL(COMPILE)

# Soumission avec monitoring automatique
@zos /run launch HLQ.JCL.CNTL(COMPILE) and monitor
@zos /run submit HLQ.JCL.CNTL(BATCH01) and wait
@zos /run soumet HLQ.JCL.CNTL(REPORT) et surveille
```

#### Soumettre depuis un fichier local

```
# Chemin relatif au workspace
@zos /run submit local file ./downloads/HLQ/JCL/CNTL/BATCH01.jcl
@zos /run submit and monitor downloads/HLQ/JCL/CNTL/NIGHTLY.jcl
@zos /run soumet le fichier local ./jcl/BATCH01.jcl

# Chemin absolu
@zos /run submit local file /home/user/projets/jcl/COMPILE.jcl
```

#### Resoumettre un job précédent

```
@zos /run resubmit job JOB12345
@zos /run relance le job JOB12345
```

---

### `@zos /lpar` — Gestion des LPARs

```
# Lister les partitions disponibles
@zos /lpar list
@zos /lpar liste les environnements disponibles

# Basculer vers un autre environnement
@zos /lpar use DEV1
@zos /lpar switch to TEST
@zos /lpar utilise l'environnement PROD

# Voir la partition active
@zos /lpar current
@zos /lpar quel environnement est actif

# Actualiser le cache des profils
@zos /lpar refresh
```

> La partition active est affichée en permanence dans la barre de statut VS Code sous la forme `🖥️ z/OS: DEV1`. Cliquez dessus pour ouvrir le sélecteur de partition.

---

## Outils automatiques (Language Model Tools)

En plus des commandes explicites, l'extension expose **20+ outils** que Copilot peut invoquer **automatiquement** lors d'une conversation. Vous n'avez pas besoin de les appeler vous-même — Copilot les utilise au bon moment.

**Exemples de conversations qui déclenchent ces outils :**

```
# Copilot lira automatiquement le membre si vous demandez une analyse
"Analyse le programme PGMA dans HLQ.COBOL.SRC et explique ce qu'il fait"

# Copilot listera les datasets pour répondre à votre question
"Quels datasets contiennent mes programmes COBOL ?"

# Copilot utilisera les infos du dataset pour vous aider
"Aide-moi à créer un dataset avec les mêmes attributs que HLQ.COBOL.SRC"
```

**Liste des outils disponibles :**

| Outil | Description |
|---|---|
| `#zos_listDatasets` | Lister les datasets par pattern |
| `#zos_listMembers` | Lister les membres d'un PDS |
| `#zos_readMember` | Lire le contenu d'un membre |
| `#zos_datasetInfo` | Attributs du dataset (DSORG, RECFM, LRECL…) |
| `#zos_searchContent` | Rechercher du texte dans un PDS |
| `#zos_downloadMember` | Télécharger un membre localement |
| `#zos_downloadAllMembers` | Télécharger tous les membres d'un PDS |
| `#zos_downloadAllDatasets` | Télécharger tous les datasets d'un pattern |
| `#zos_uploadFileToPds` | Uploader un fichier local vers un PDS |
| `#zos_uploadDirToPds` | Uploader un répertoire entier vers un PDS |
| `#zos_copyMember` | Copier un membre vers un autre dataset |
| `#zos_copyDataset` | Copier un dataset entier |
| `#zos_createDataset` | Créer un dataset avec attributs complets |
| `#zos_deleteMember` | Supprimer un membre |
| `#zos_deleteDataset` | Supprimer un dataset |
| `#zos_listJobs` | Lister les jobs |
| `#zos_getJobStatus` | Statut et code retour d'un job |
| `#zos_getJobOutput` | Sortie spool d'un job |
| `#zos_submitJcl` | Soumettre du JCL depuis un dataset |
| `#zos_submitLocalJcl` | Soumettre un fichier JCL local |

---

## Système de sécurité

L'extension intègre un système de confirmation à trois niveaux pour protéger vos données.

### Niveaux de sécurité

| Niveau | Opérations | Comportement |
|---|---|---|
| **Sûr** | list, read, status, info, search | Aucune confirmation |
| **Modéré** | write, create, upload | Notification simple |
| **Dangereux** | delete, cancel, purge | Boîte de dialogue modale (bloquante) |

### Détection de la production

Les datasets correspondant aux patterns suivants sont **automatiquement signalés** comme production :

- `*.PROD.*`
- `*.PRD.*`
- `*.PRODUCTION.*`
- `SYS*.**`

Une opération modérée sur un dataset de production est **escaladée au niveau dangereux**. La boîte de dialogue affiche le préfixe `[PROD]` pour attirer l'attention.

**Exemple :**
```
@zos /ds delete dataset HLQ.PROD.OLD.DATA
→ [PROD] Supprimer définitivement HLQ.PROD.OLD.DATA ?
→ Boutons : Annuler / Confirmer
```

Les patterns de production sont configurables via le paramètre `zosAssistant.protectedDatasetPatterns`.

---

## Configuration

Ouvrez les paramètres VS Code (`Ctrl+,`) et recherchez `z/OS Assistant`.

### Paramètres généraux

| Paramètre | Défaut | Description |
|---|---|---|
| `zosAssistant.defaultProfile` | `""` | Profil Zowe à utiliser (vide = profil actif de Zowe Explorer) |
| `zosAssistant.confirmDangerousOperations` | `true` | Demander confirmation pour delete/cancel/purge |
| `zosAssistant.protectedDatasetPatterns` | `["*.PROD.*", "*.PRD.*", "*.PRODUCTION.*", "SYS*.**"]` | Patterns pour les datasets de production |
| `zosAssistant.monitorTimeoutSeconds` | `300` | Délai maximum pour le monitoring de jobs (secondes) |
| `zosAssistant.monitorPollIntervalSeconds` | `5` | Fréquence d'interrogation lors du monitoring (secondes) |
| `zosAssistant.maxSpoolLines` | `200` | Nombre de lignes spool affichées avant troncature |
| `zosAssistant.telemetryEnabled` | `true` | Suivi d'utilisation local (données stockées sur votre machine uniquement) |

### Paramètres de création de datasets (`zosAssistant.createDefaults.*`)

| Paramètre | Défaut | Description |
|---|---|---|
| `alcunit` | `TRK` | Unité d'allocation (TRK ou CYL) |
| `primary` | `10` | Espace primaire |
| `secondary` | `5` | Espace secondaire |
| `recfm` | `FB` | Format d'enregistrement |
| `lrecl` | `80` | Longueur d'enregistrement logique |
| `blksize` | `0` | Taille de bloc (0 = déterminé par z/OS) |
| `dirblkPds` | `20` | Blocs de répertoire pour les PDS |
| `volser` | `""` | Numéro de volume (vide = géré par SMS) |
| `storclass` | `""` | Classe de stockage SMS |
| `mgntclass` | `""` | Classe de gestion SMS |
| `dataclass` | `""` | Classe de données SMS |

### Commandes VS Code disponibles

| Commande | Description |
|---|---|
| `z/OS: Open member in editor` | Ouvrir un membre PDS dans un onglet VS Code |
| `z/OS: Usage report (last 30 days)` | Afficher un rapport d'utilisation local |
| `z/OS: Clear Zowe session cache` | Forcer une ré-authentification |
| `z/OS: Select LPAR / partition` | Basculer entre les profils z/OS |

---

## Scénarios d'utilisation complets

### Scénario 1 : Revue de code COBOL

Vous souhaitez analyser un programme COBOL et identifier des optimisations.

```
# 1. Lister les programmes disponibles
@zos /ds list members in HLQ.COBOL.SRC

# 2. Lire le programme qui vous intéresse
@zos /ds read HLQ.COBOL.SRC(CALCUL)

# 3. Demander une analyse à Copilot (utilise automatiquement #zos_readMember)
"Analyse le programme CALCUL dans HLQ.COBOL.SRC, identifie les sections
inefficaces et propose des optimisations"

# 4. Chercher toutes les occurrences d'un pattern problématique
@zos /ds search PERFORM VARYING in HLQ.COBOL.SRC

# 5. Télécharger pour travailler en local
@zos /ds download all members of HLQ.COBOL.SRC
```

---

### Scénario 2 : Débogage d'un job en échec

Un job batch a échoué et vous devez en comprendre la cause.

```
# 1. Lister les jobs récents en erreur
@zos /jobs list failed jobs

# 2. Vérifier le statut et le code retour
@zos /jobs status of JOB12345

# 3. Afficher la sortie spool (SYSPRINT, JESMSGLG)
@zos /jobs show output of JOB12345

# 4. Demander à Copilot d'analyser l'erreur
"Analyse la sortie du job JOB12345 et explique pourquoi il a échoué"

# 5. Corriger le JCL et resoumettre
@zos /ds read HLQ.JCL.CNTL(BATCH01)
# (modifier le JCL dans l'éditeur)
@zos /ds write to HLQ.JCL.CNTL(BATCH01)
@zos /run submit HLQ.JCL.CNTL(BATCH01) and monitor
```

---

### Scénario 3 : Synchronisation local ↔ z/OS

Vous travaillez sur des sources COBOL en local et souhaitez les synchroniser avec z/OS.

```
# 1. Télécharger tous les sources pour travailler en local
@zos /ds download all members of HLQ.COBOL.SRC

# Les fichiers arrivent dans : workspace/downloads/HLQ.COBOL.SRC/

# 2. Modifier les sources en local dans VS Code...

# 3. Uploader les modifications vers z/OS
@zos /ds upload directory ./downloads/HLQ.COBOL.SRC to HLQ.COBOL.SRC

# 4. Ou uploader un seul fichier modifié
@zos /ds upload CALCUL.cbl to HLQ.COBOL.SRC(CALCUL)
```

---

### Scénario 4 : Sauvegarde avant modification

Avant de modifier un dataset de production, vous souhaitez le sauvegarder.

```
# 1. Copier le dataset vers un backup daté
@zos /ds copy dataset HLQ.COBOL.SRC to HLQ.BACKUP.SRC

# 2. Vérifier que la copie est bien là
@zos /ds list members in HLQ.BACKUP.SRC

# 3. Effectuer vos modifications...

# 4. En cas de problème, copier le backup vers la source
@zos /ds copy dataset HLQ.BACKUP.SRC to HLQ.COBOL.SRC
```

---

### Scénario 5 : Mise en place d'un nouveau projet

Vous démarrez un nouveau projet et devez créer la structure de datasets.

```
# 1. Créer le PDS pour les sources COBOL
@zos /ds create PDS HLQ.NOUVEAU.COBOL lrecl 80

# 2. Créer le PDS pour le JCL
@zos /ds create PDS HLQ.NOUVEAU.JCL lrecl 80

# 3. Créer un dataset séquentiel pour les données
@zos /ds create sequential dataset HLQ.NOUVEAU.DATA recfm VB lrecl 256

# 4. Créer une bibliothèque de load modules
@zos /ds create binary library HLQ.NOUVEAU.LOAD

# 5. Vérifier la création
@zos /ds list datasets HLQ.NOUVEAU.**
```

---

### Scénario 6 : Nettoyage des datasets temporaires

En fin de sprint, vous souhaitez nettoyer vos datasets de travail.

```
# 1. Lister les datasets temporaires
@zos /ds list datasets HLQ.TEMP.**
@zos /ds list datasets HLQ.WORK.**

# 2. Vérifier les contenus avant suppression
@zos /ds info about HLQ.TEMP.DATA1

# 3. Supprimer les datasets obsolètes (confirmation requise pour chacun)
@zos /ds delete dataset HLQ.TEMP.DATA1
@zos /ds delete dataset HLQ.WORK.OLD
```

---

### Scénario 7 : Soumission et suivi d'un job de compilation

Vous compilez un programme COBOL modifié et voulez surveiller le résultat.

```
# 1. Vérifier que le JCL est prêt
@zos /ds read HLQ.JCL.CNTL(COMPILE)

# 2. Soumettre et attendre automatiquement la fin
@zos /run launch HLQ.JCL.CNTL(COMPILE) and monitor

# L'extension :
# - Soumet le JCL
# - Poll le statut toutes les 5 secondes
# - Affiche le résultat final avec code retour visuel
# - Présente automatiquement la sortie SYSPRINT

# 3. En cas d'erreur, analyser la sortie avec Copilot
"Analyse la sortie du job de compilation et identifie les erreurs COBOL"
```

---

## Conseils et bonnes pratiques

### Écriture des prompts

- **Soyez précis sur les noms** : Utilisez les noms de datasets et de membres exacts. L'assistant reconnaît les patterns `HLQ.LLQ.LLLLQ(MEMBER)`.
- **Le langage naturel fonctionne** : Vous n'avez pas besoin de mémoriser une syntaxe exacte. "liste mes datasets COBOL" et "show my COBOL datasets" donnent le même résultat.
- **Combinez les opérations** : "Soumet HLQ.JCL.CNTL(COMPILE) et surveille jusqu'à la fin" fait les deux en une seule commande.
- **Exploitez les suggestions** : Après chaque réponse, l'assistant propose des actions de suivi contextuelles. Cliquez dessus pour enchaîner les opérations.

### Gestion des environnements

- Vérifiez toujours la partition active (barre de statut) avant d'exécuter des opérations sur la production.
- Utilisez `/lpar use` pour basculer explicitement entre DEV, TEST et PROD.
- Configurez `protectedDatasetPatterns` avec vos patterns spécifiques d'entreprise.

### Performance

- Le download par lot (`download all members`) est plus efficace que les téléchargements individuels pour les PDS volumineux.
- Le monitoring de job utilise un polling configurable : augmentez `monitorPollIntervalSeconds` pour les jobs longs afin de réduire la charge réseau.
- La cache de session est maintenue automatiquement ; utilisez "Clear Zowe session cache" uniquement en cas de problème d'authentification.

### Télémétrie locale

Consultez votre rapport d'utilisation pour identifier les commandes les plus fréquentes et optimiser votre workflow :

```
# Via la palette de commandes (Ctrl+Shift+P)
> z/OS: Usage report (last 30 days)
```

Les données restent sur votre machine. Rien n'est envoyé à l'extérieur.

---

## Dépannage

### L'extension ne se connecte pas

**Symptôme :** Les commandes échouent avec une erreur de connexion.

**Solutions :**
1. Vérifiez que Zowe Explorer est installé et qu'un profil est configuré
2. Assurez-vous que z/OSMF est accessible depuis votre réseau
3. Exécutez `z/OS: Clear Zowe session cache` puis réessayez
4. Vérifiez les credentials Zowe (`zowe.config.json` ou profil Zowe Explorer)

---

### `@zos` n'est pas reconnu dans Copilot Chat

**Symptôme :** Copilot ne reconnaît pas `@zos`.

**Solutions :**
1. Vérifiez que l'extension est bien installée (`Extensions` → rechercher "z/OS Assistant")
2. Rechargez VS Code (`Ctrl+Shift+P` → `Developer: Reload Window`)
3. Vérifiez que GitHub Copilot Chat est actif et connecté

---

### Le monitoring de job ne se termine pas

**Symptôme :** La commande `/jobs monitor` attend indéfiniment.

**Solutions :**
1. Le délai par défaut est 300 secondes. Augmentez `zosAssistant.monitorTimeoutSeconds` si vos jobs prennent plus de temps.
2. Vérifiez le statut du job directement : `@zos /jobs status of JOBXXXXX`
3. Si le job est bloqué sur z/OS, annulez-le : `@zos /jobs cancel JOBXXXXX`

---

### La sortie spool est tronquée

**Symptôme :** La sortie du job est coupée après quelques lignes.

**Solution :** Augmentez `zosAssistant.maxSpoolLines` dans les paramètres (défaut : 200). Pour les grandes sorties, préférez télécharger le membre de sortie localement.

---

### Erreur lors de la création d'un dataset

**Symptôme :** La création de dataset échoue avec une erreur z/OS.

**Vérifications :**
- Le HLQ existe-t-il et avez-vous les droits d'y créer des datasets ?
- Les paramètres d'espace (primary/secondary) sont-ils cohérents avec la capacité disponible ?
- Si vous utilisez SMS, les classes (storclass, mgntclass, dataclass) sont-elles valides sur votre système ?
- Vérifiez `zosAssistant.createDefaults.*` pour les valeurs par défaut de votre site.

---

### Signaler un problème

Ouvrez un ticket sur : [github.com/zarafa-dev-io/zLMTools/issues](https://github.com/zarafa-dev-io/zLMTools/issues)

Incluez :
- La version de l'extension (visible dans `Extensions`)
- Le prompt que vous avez utilisé
- Le message d'erreur complet
- Votre version de VS Code et de Zowe Explorer

---

*Documentation générée pour z/OS Assistant for Copilot v0.5.0 — Mars 2026*
