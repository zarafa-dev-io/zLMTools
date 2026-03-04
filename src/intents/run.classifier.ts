import * as vscode from 'vscode';
import { RunIntent } from './run.schemas';

// ============================================================
// Prompt de classification — domaine Run / Submit
// ============================================================

const RUN_CLASSIFICATION_PROMPT = `Tu es un assistant z/OS expert. Tu dois classifier la requête utilisateur 
en UNE SEULE opération de soumission de JCL et extraire les paramètres nécessaires.

## Règles d'extraction
- Les noms de datasets z/OS sont en MAJUSCULES, qualifiés par des points : HLQ.LEVEL1.LEVEL2
- Un membre PDS est référencé entre parenthèses : DATASET(MEMBER) ou séparément
- Si l'utilisateur utilise des minuscules, convertis en MAJUSCULES (sauf le JCL inline)
- "soumets", "lance", "exécute", "run", "submit" → soumission de JCL
- "et surveille", "et attends", "et monitor" → SUBMIT_AND_MONITOR
- "re-soumets", "relance", "resubmit" → RESUBMIT

## Opérations disponibles

| Type | Description | Paramètres |
|------|-------------|------------|
| SUBMIT_DATASET | Soumettre le JCL d'un dataset/membre | dataset (string), member? (string) |
| SUBMIT_INLINE | Soumettre du JCL fourni directement | jcl (string) |
| SUBMIT_AND_MONITOR | Soumettre puis surveiller jusqu'à complétion | dataset (string), member? (string), autoDisplay? (bool) |
| RESUBMIT | Re-soumettre le JCL d'un job précédent | jobId? (string), jobName? (string) |

## Exemples

Requête: "soumets HLQ.JCL.CNTL(BATCH01)"
→ { "type": "SUBMIT_DATASET", "dataset": "HLQ.JCL.CNTL", "member": "BATCH01" }

Requête: "lance le job BATCH01 dans HLQ.JCL"
→ { "type": "SUBMIT_DATASET", "dataset": "HLQ.JCL", "member": "BATCH01" }

Requête: "soumets HLQ.JCL.SEQ"
→ { "type": "SUBMIT_DATASET", "dataset": "HLQ.JCL.SEQ" }

Requête: "soumets et surveille HLQ.JCL(NIGHTLY)"
→ { "type": "SUBMIT_AND_MONITOR", "dataset": "HLQ.JCL", "member": "NIGHTLY", "autoDisplay": true }

Requête: "lance HLQ.JCL(COMPILE) et montre la sortie à la fin"
→ { "type": "SUBMIT_AND_MONITOR", "dataset": "HLQ.JCL", "member": "COMPILE", "autoDisplay": true }

Requête: "relance le job JOB12345"
→ { "type": "RESUBMIT", "jobId": "JOB12345" }

Requête: "re-soumets PAYROLL"
→ { "type": "RESUBMIT", "jobName": "PAYROLL" }

Requête: "soumets ce JCL : //MYJOB JOB ..."
→ { "type": "SUBMIT_INLINE", "jcl": "//MYJOB JOB ..." }

## Instructions
- Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans explication
- Convertis les noms de datasets et membres en MAJUSCULES
- Si la requête mentionne "surveille", "attends", "monitor", "et montre" → SUBMIT_AND_MONITOR
- Si la requête contient du JCL brut (lignes commençant par //) → SUBMIT_INLINE
- Si la requête mentionne "relance", "re-soumets", "resubmit" → RESUBMIT
- Par défaut, si c'est une soumission simple → SUBMIT_DATASET
- Si tu ne peux pas classifier, réponds : { "type": "UNKNOWN", "reason": "..." }
`;

export class RunIntentClassifier {

    async classify(
        userPrompt: string,
        token: vscode.CancellationToken
    ): Promise<RunIntent | null> {

        const [model] = await vscode.lm.selectChatModels({
            vendor: 'copilot',
            family: 'gpt-4o'
        });

        if (!model) {
            throw new Error(
                'Aucun modèle Copilot disponible. Vérifiez que GitHub Copilot est activé.'
            );
        }

        const messages = [
            vscode.LanguageModelChatMessage.User(
                RUN_CLASSIFICATION_PROMPT + `\n\nRequête utilisateur : "${userPrompt}"`
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

            return parsed as RunIntent;
        } catch (error) {
            console.error('[zos/run] Failed to parse intent:', responseText);
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
