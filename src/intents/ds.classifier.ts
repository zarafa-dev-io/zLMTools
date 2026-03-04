import * as vscode from 'vscode';
import { DsIntent } from './ds.schemas';

// ============================================================
// Prompt de classification — le cœur du système
// On restreint le scope au domaine "datasets" pour maximiser
// la précision de classification du LLM
// ============================================================

const DS_CLASSIFICATION_PROMPT = `Tu es un assistant z/OS expert. Tu dois classifier la requête utilisateur 
en UNE SEULE opération sur les datasets z/OS et extraire les paramètres nécessaires.

## Règles d'extraction des noms de datasets
- Les noms de datasets z/OS sont en MAJUSCULES, qualifiés par des points : HLQ.LEVEL1.LEVEL2
- Un membre PDS est référencé entre parenthèses : DATASET(MEMBER)  
- Si l'utilisateur utilise des minuscules, convertis en MAJUSCULES
- Le pattern "**" signifie "tous les niveaux" (ex: HLQ.** = tous les datasets commençant par HLQ)
- Le pattern "*" signifie "un seul niveau" (ex: HLQ.*.SRC)

## Opérations disponibles

| Type | Description | Paramètres requis |
|------|-------------|-------------------|
| LIST_DATASETS | Lister les datasets correspondant à un pattern | pattern (string) |
| LIST_MEMBERS | Lister les membres d'un PDS | dataset (string), pattern? (string) |
| READ_MEMBER | Lire le contenu d'un membre | dataset (string), member (string) |
| WRITE_MEMBER | Écrire/modifier le contenu d'un membre | dataset (string), member (string), content (string) |
| CREATE_DATASET | Créer un nouveau dataset | name, dsorg (PO|PS), recfm?, lrecl?, blksize? |
| CREATE_MEMBER | Créer un nouveau membre dans un PDS | dataset (string), member (string), content? (string) |
| DELETE_MEMBER | Supprimer un membre | dataset (string), member (string) |
| DELETE_DATASET | Supprimer un dataset entier | dataset (string) |
| SEARCH_CONTENT | Chercher du texte dans les membres d'un PDS | dataset (string), searchTerm (string), memberPattern? |
| DATASET_INFO | Obtenir les caractéristiques d'un dataset | dataset (string) |

## Exemples

Requête: "liste les datasets HLQ.PROD.**"
→ { "type": "LIST_DATASETS", "pattern": "HLQ.PROD.**" }

Requête: "montre-moi les membres de HLQ.COBOL.SRC"
→ { "type": "LIST_MEMBERS", "dataset": "HLQ.COBOL.SRC" }

Requête: "affiche le contenu de PGMA dans HLQ.COBOL.SRC"  
→ { "type": "READ_MEMBER", "dataset": "HLQ.COBOL.SRC", "member": "PGMA" }

Requête: "affiche HLQ.COBOL.SRC(PGMA)"
→ { "type": "READ_MEMBER", "dataset": "HLQ.COBOL.SRC", "member": "PGMA" }

Requête: "supprime le membre OLDPGM de HLQ.COBOL.SRC"
→ { "type": "DELETE_MEMBER", "dataset": "HLQ.COBOL.SRC", "member": "OLDPGM" }

Requête: "quelles sont les caractéristiques de HLQ.COBOL.LOAD"
→ { "type": "DATASET_INFO", "dataset": "HLQ.COBOL.LOAD" }

Requête: "cherche PERFORM dans HLQ.COBOL.SRC"
→ { "type": "SEARCH_CONTENT", "dataset": "HLQ.COBOL.SRC", "searchTerm": "PERFORM" }

Requête: "crée un PDS HLQ.NEW.SRC avec LRECL 80"
→ { "type": "CREATE_DATASET", "name": "HLQ.NEW.SRC", "dsorg": "PO", "lrecl": 80 }

## Instructions
- Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans explication
- Convertis tous les noms de datasets et membres en MAJUSCULES
- Si la requête est ambiguë, choisis l'interprétation la plus probable
- Si tu ne peux pas classifier, réponds : { "type": "UNKNOWN", "reason": "..." }
`;

export class DsIntentClassifier {

    /**
     * Classifie la requête utilisateur en un intent structuré
     * via l'API Language Model de VS Code (Copilot)
     */
    async classify(
        userPrompt: string,
        token: vscode.CancellationToken
    ): Promise<DsIntent | null> {
        
        // Sélectionner le modèle Copilot disponible
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
                DS_CLASSIFICATION_PROMPT + `\n\nRequête utilisateur : "${userPrompt}"`
            )
        ];

        const response = await model.sendRequest(messages, {}, token);
        const responseText = await this.accumulateResponse(response);

        try {
            // Nettoyer la réponse (le LLM ajoute parfois des backticks)
            const cleaned = responseText
                .replace(/```json\s*/g, '')
                .replace(/```\s*/g, '')
                .trim();

            const parsed = JSON.parse(cleaned);

            if (parsed.type === 'UNKNOWN') {
                return null;
            }

            return parsed as DsIntent;
        } catch (error) {
            console.error('[zos] Failed to parse intent:', responseText);
            return null;
        }
    }

    /**
     * Accumule le stream de réponse du LLM en une seule string
     */
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
