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
| CREATE_DATASET | Créer un nouveau dataset | name, dstype? (PARTITIONED\|SEQUENTIAL\|CLASSIC\|BINARY\|C), likeDataset? (allouer comme un dataset existant), lrecl?, blksize?, recfm?, primary?, secondary?, dirblk?, alcunit?, volser?, storclass?, mgntclass?, dataclass? |
| CREATE_MEMBER | Créer un nouveau membre dans un PDS | dataset (string), member (string), content? (string) |
| DELETE_MEMBER | Supprimer un membre | dataset (string), member (string) |
| DELETE_DATASET | Supprimer un dataset entier | dataset (string) |
| SEARCH_CONTENT | Chercher du texte dans les membres d'un PDS | dataset (string), searchTerm (string), memberPattern? |
| DATASET_INFO | Obtenir les caractéristiques d'un dataset | dataset (string) |
| DOWNLOAD_MEMBER | Télécharger un membre PDS vers le workspace local | dataset (string), member (string), targetDir? (string) |
| DOWNLOAD_ALL_MEMBERS | Télécharger tous les membres d'un PDS vers un dossier local | dataset (string), targetDir? (string) |
| DOWNLOAD_ALL_DATASETS | Télécharger tous les datasets correspondant à un pattern | pattern (string), targetDir? (string) |
| UPLOAD_FILE_TO_MEMBER | Uploader un fichier local vers un membre PDS | localPath (string), dataset (string), member (string) |
| UPLOAD_DIR_TO_PDS | Uploader un répertoire local vers un PDS (chaque fichier devient un membre) | localPath (string), dataset (string) |
| COPY_MEMBER | Copier un membre PDS vers un autre dataset/membre | fromDataset, fromMember, toDataset, toMember, replace? (bool) |
| COPY_DATASET | Copier un dataset entier (séquentiel ou PDS) vers un autre dataset | fromDataset, toDataset, replace? (bool) |

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
→ { "type": "CREATE_DATASET", "name": "HLQ.NEW.SRC", "dstype": "PARTITIONED", "lrecl": 80 }

Requête: "crée un dataset séquentiel HLQ.WORK.DATA RECFM=VB LRECL=256"
→ { "type": "CREATE_DATASET", "name": "HLQ.WORK.DATA", "dstype": "SEQUENTIAL", "recfm": "VB", "lrecl": 256 }

Requête: "crée un PDS classic HLQ.COBOL.SRC primary 5 CYL"
→ { "type": "CREATE_DATASET", "name": "HLQ.COBOL.SRC", "dstype": "CLASSIC", "primary": 5, "alcunit": "CYL" }

Requête: "crée un dataset binaire HLQ.LOAD.LIB"
→ { "type": "CREATE_DATASET", "name": "HLQ.LOAD.LIB", "dstype": "BINARY" }

Requête: "crée un dataset C HLQ.C.SRC sur le volume VOL001 storclass STORCLS1"
→ { "type": "CREATE_DATASET", "name": "HLQ.C.SRC", "dstype": "C", "volser": "VOL001", "storclass": "STORCLS1" }

Requête: "crée HLQ.NEW.SRC comme HLQ.COBOL.SRC"
→ { "type": "CREATE_DATASET", "name": "HLQ.NEW.SRC", "likeDataset": "HLQ.COBOL.SRC" }

Requête: "alloue HLQ.WORK.DATA sur le modèle de HLQ.REF.DATA avec primary 20"
→ { "type": "CREATE_DATASET", "name": "HLQ.WORK.DATA", "likeDataset": "HLQ.REF.DATA", "primary": 20 }

Requête: "télécharge le membre PGMA de HLQ.COBOL.SRC"
→ { "type": "DOWNLOAD_MEMBER", "dataset": "HLQ.COBOL.SRC", "member": "PGMA" }

Requête: "download tous les membres de HLQ.COBOL.SRC"
→ { "type": "DOWNLOAD_ALL_MEMBERS", "dataset": "HLQ.COBOL.SRC" }

Requête: "télécharge tous les datasets HLQ.PROD.**"
→ { "type": "DOWNLOAD_ALL_DATASETS", "pattern": "HLQ.PROD.**" }

Requête: "upload le fichier PGMA.cbl vers HLQ.COBOL.SRC(PGMA)"
→ { "type": "UPLOAD_FILE_TO_MEMBER", "localPath": "PGMA.cbl", "dataset": "HLQ.COBOL.SRC", "member": "PGMA" }

Requête: "envoie le répertoire ./cobol vers HLQ.COBOL.SRC"
→ { "type": "UPLOAD_DIR_TO_PDS", "localPath": "./cobol", "dataset": "HLQ.COBOL.SRC" }

Requête: "pousse C:/code/jcl vers HLQ.JCL.CNTL"
→ { "type": "UPLOAD_DIR_TO_PDS", "localPath": "C:/code/jcl", "dataset": "HLQ.JCL.CNTL" }

Requête: "copie le membre PGMA de HLQ.COBOL.SRC vers HLQ.COBOL.BAK(PGMA)"
→ { "type": "COPY_MEMBER", "fromDataset": "HLQ.COBOL.SRC", "fromMember": "PGMA", "toDataset": "HLQ.COBOL.BAK", "toMember": "PGMA" }

Requête: "copie PGMA de HLQ.SRC en PGMB dans HLQ.SRC"
→ { "type": "COPY_MEMBER", "fromDataset": "HLQ.SRC", "fromMember": "PGMA", "toDataset": "HLQ.SRC", "toMember": "PGMB" }

Requête: "copie le dataset HLQ.COBOL.SRC vers HLQ.COBOL.BAK"
→ { "type": "COPY_DATASET", "fromDataset": "HLQ.COBOL.SRC", "toDataset": "HLQ.COBOL.BAK" }

## Règles pour CREATE_DATASET
- Si l'utilisateur dit "comme", "like", "sur le modèle de", "à l'image de" suivi d'un nom de dataset → utiliser **likeDataset** (et ne pas mettre dstype)
- Si l'utilisateur précise un type (PDS, séquentiel, etc.) sans "like" → utiliser **dstype** (sans likeDataset)
- **likeDataset** et **dstype** sont mutuellement exclusifs : ne jamais mettre les deux

## Types de dataset pour CREATE_DATASET
- **PARTITIONED** : PDS standard (PO, FB, lrecl=80) — quand l'utilisateur dit "PDS", "partitioned", "bibliothèque"
- **SEQUENTIAL** : fichier plat (PS, FB, lrecl=80) — quand l'utilisateur dit "séquentiel", "PS", "fichier plat"
- **CLASSIC** : PDS avec 25 dirblks (style classique) — quand l'utilisateur dit "classic", "bibliothèque classique"
- **BINARY** : PDS binaire (U, blksize=27998) — quand l'utilisateur dit "binaire", "load library", "LIB"
- **C** : PDS pour code C (VB, lrecl=260) — quand l'utilisateur dit "C dataset", "source C"

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
        token: vscode.CancellationToken,
        model: vscode.LanguageModelChat
    ): Promise<DsIntent | null> {

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
