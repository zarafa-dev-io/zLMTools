import * as vscode from 'vscode';
import { JobsIntent } from './jobs.schemas';

// ============================================================
// Prompt de classification — domaine Jobs
// ============================================================

const JOBS_CLASSIFICATION_PROMPT = `Tu es un assistant z/OS expert. Tu dois classifier la requête utilisateur 
en UNE SEULE opération sur les jobs z/OS et extraire les paramètres nécessaires.

## Règles d'extraction
- Les Job IDs z/OS suivent le format JOBnnnnn ou Jnnnnnnn (ex: JOB12345, J0012345)
- Les Job Names sont en MAJUSCULES, max 8 caractères (ex: PAYROLL, BATCH01)
- Si l'utilisateur utilise des minuscules, convertis en MAJUSCULES
- "mon job" ou "mes jobs" → utiliser le owner du profil courant (laisser owner vide)
- "dernier" / "plus récent" → last: true

## Opérations disponibles

| Type | Description | Paramètres |
|------|-------------|------------|
| LIST_JOBS | Lister les jobs | owner?, prefix?, status? (ACTIVE|OUTPUT|INPUT), maxJobs? |
| GET_JOB_STATUS | Statut détaillé d'un job | jobId? (string), jobName? (string) |
| GET_JOB_OUTPUT | Voir la sortie/spool d'un job | jobId?, jobName?, spoolFilter? (ddName), last? (bool) |
| GET_SPOOL_FILE | Lire un fichier spool spécifique | jobId (string), jobName (string), ddName (string), stepName? |
| CANCEL_JOB | Annuler un job actif | jobId (string), jobName (string) |
| PURGE_JOB | Purger un job de la file | jobId (string), jobName (string) |
| MONITOR_JOB | Surveiller un job jusqu'à complétion | jobId (string), jobName (string) |

## Exemples

Requête: "liste mes jobs"
→ { "type": "LIST_JOBS" }

Requête: "liste les jobs actifs"
→ { "type": "LIST_JOBS", "status": "ACTIVE" }

Requête: "liste les jobs PAYROLL"
→ { "type": "LIST_JOBS", "prefix": "PAYROLL*" }

Requête: "montre les jobs de USERA en erreur"
→ { "type": "LIST_JOBS", "owner": "USERA", "status": "OUTPUT" }

Requête: "quel est le statut de JOB12345"
→ { "type": "GET_JOB_STATUS", "jobId": "JOB12345" }

Requête: "est-ce que mon job PAYROLL s'est bien passé"
→ { "type": "GET_JOB_STATUS", "jobName": "PAYROLL" }

Requête: "montre la sortie de JOB12345"
→ { "type": "GET_JOB_OUTPUT", "jobId": "JOB12345" }

Requête: "montre la sysout du dernier job BATCH01"
→ { "type": "GET_JOB_OUTPUT", "jobName": "BATCH01", "last": true }

Requête: "affiche le JESMSGLG de JOB12345"
→ { "type": "GET_JOB_OUTPUT", "jobId": "JOB12345", "spoolFilter": "JESMSGLG" }

Requête: "montre le SYSPRINT du STEP02 de JOB12345 PAYROLL"
→ { "type": "GET_SPOOL_FILE", "jobId": "JOB12345", "jobName": "PAYROLL", "ddName": "SYSPRINT", "stepName": "STEP02" }

Requête: "annule le job JOB12345 BATCH01"
→ { "type": "CANCEL_JOB", "jobId": "JOB12345", "jobName": "BATCH01" }

Requête: "purge JOB12345 PAYROLL"
→ { "type": "PURGE_JOB", "jobId": "JOB12345", "jobName": "PAYROLL" }

Requête: "surveille JOB12345 BATCH01 jusqu'à la fin"
→ { "type": "MONITOR_JOB", "jobId": "JOB12345", "jobName": "BATCH01" }

## Instructions
- Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans explication
- Convertis tous les noms et IDs en MAJUSCULES
- Si la requête mentionne "spool", "sortie", "output", "log", "JESMSGLG", "JESJCL", "SYSOUT", "SYSPRINT" → c'est GET_JOB_OUTPUT ou GET_SPOOL_FILE
- Si la requête mentionne "statut", "status", "état", "terminé", "fini", "passé", "RC", "return code" → c'est GET_JOB_STATUS
- Si tu ne peux pas classifier, réponds : { "type": "UNKNOWN", "reason": "..." }
`;

export class JobsIntentClassifier {

    async classify(
        userPrompt: string,
        token: vscode.CancellationToken,
        model: vscode.LanguageModelChat
    ): Promise<JobsIntent | null> {

        const messages = [
            vscode.LanguageModelChatMessage.User(
                JOBS_CLASSIFICATION_PROMPT + `\n\nRequête utilisateur : "${userPrompt}"`
            )
        ];

        const response = await model.sendRequest(messages, {}, token);
        const responseText = await this.accumulateResponse(response);

        try {
            const cleaned = responseText
                .replace(/```json\s*/g, '')
                .replace(/```\s*/g, '')
                .trim();

            const parsed = JSON.parse(cleaned);

            if (parsed.type === 'UNKNOWN') {
                return null;
            }

            return parsed as JobsIntent;
        } catch (error) {
            console.error('[zos/jobs] Failed to parse intent:', responseText);
            return null;
        }
    }

    private async accumulateResponse(
        response: vscode.LanguageModelChatResponse
    ): Promise<string> {
        let result = '';
        for await (const fragment of response.text) {
            result += fragment;
        }
        return result;
    }
}
