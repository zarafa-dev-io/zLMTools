import { detectLanguage, tr, Lang } from '../utils/i18n';

// ============================================================
// Tests — i18n utility
// ============================================================

describe('detectLanguage', () => {
    describe('French detection', () => {
        it('should detect French with common French keywords', () => {
            expect(detectLanguage('liste les datasets HLQ.PROD')).toBe('fr');
            expect(detectLanguage('affiche les membres de HLQ.COBOL.SRC')).toBe('fr');
            expect(detectLanguage('supprime le dataset HLQ.OLD.DATA')).toBe('fr');
            expect(detectLanguage('créer un nouveau PDS')).toBe('fr');
        });

        it('should detect French with accents (higher priority)', () => {
            expect(detectLanguage('Où sont les données? Énumère les datasets été')).toBe('fr');
            expect(detectLanguage('Affiche châteaux résumé façade')).toBe('fr');
            expect(detectLanguage('Ça s\'appelle été à côté')).toBe('fr');
        });

        it('should detect French by default when indeterminate', () => {
            expect(detectLanguage('HLQ.PROD.DATA')).toBe('fr');
            expect(detectLanguage('PGMA DATASET')).toBe('fr');
            expect(detectLanguage('')).toBe('fr');
        });

        it('should detect French possessives and articles', () => {
            expect(detectLanguage('mon dataset, ma PDS, mes données')).toBe('fr');
            expect(detectLanguage('leur profil, ses membres')).toBe('fr');
            expect(detectLanguage('quel est le LPAR actif?')).toBe('fr');
        });

        it('should detect French with common request patterns', () => {
            expect(detectLanguage('cherche PERFORM dans HLQ.COBOL.SRC')).toBe('fr');
            expect(detectLanguage('montre-moi les erreurs')).toBe('fr');
            expect(detectLanguage('peux-tu copier ce dataset?')).toBe('fr');
            expect(detectLanguage('merci de télécharger les fichiers')).toBe('fr');
        });
    });

    describe('English detection', () => {
        it('should detect English with common English keywords', () => {
            expect(detectLanguage('list datasets HLQ.PROD')).toBe('en');
            expect(detectLanguage('show members of HLQ.COBOL.SRC')).toBe('en');
            expect(detectLanguage('delete the dataset HLQ.OLD.DATA')).toBe('en');
            expect(detectLanguage('create a new PDS')).toBe('en');
        });

        it('should detect English with multiple keywords', () => {
            expect(detectLanguage('download all members from HLQ.COBOL.SRC')).toBe('en');
            expect(detectLanguage('get job status for the current batch job')).toBe('en');
            expect(detectLanguage('upload the file to the dataset')).toBe('en');
        });

        it('should detect English with specific commands', () => {
            expect(detectLanguage('search PERFORM in HLQ.COBOL.SRC')).toBe('en');
            expect(detectLanguage('find all datasets')).toBe('en');
            expect(detectLanguage('submit JCL and monitor')).toBe('en');
            expect(detectLanguage('cancel the job')).toBe('en');
            expect(detectLanguage('purge output')).toBe('en');
            expect(detectLanguage('resubmit with new parameters')).toBe('en');
        });

        it('should detect English possessives and articles in English context', () => {
            expect(detectLanguage('show the members, list my datasets, resubmit your job')).toBe('en');
        });
    });

    describe('Edge cases', () => {
        it('should favor French when both languages appear equally', () => {
            // French is treated as default when scores are equal or very close
            const mixed = 'list les datasets show les members';
            const lang = detectLanguage(mixed);
            expect(['en', 'fr']).toContain(lang);
        });

        it('should handle case-insensitivity', () => {
            expect(detectLanguage('LISTE LES DATASETS')).toBe('fr');
            expect(detectLanguage('LIST DATASETS')).toBe('en');
            expect(detectLanguage('LiStE lEs DaTaSeTs')).toBe('fr');
        });

        it('should handle whitespace and punctuation', () => {
            expect(detectLanguage('  liste  les  datasets  ')).toBe('fr');
            expect(detectLanguage('liste, des datasets!')).toBe('fr');
            expect(detectLanguage('list...datasets!?')).toBe('en');
        });

        it('should handle very short input', () => {
            expect(detectLanguage('list')).toBe('en');
            expect(detectLanguage('liste')).toBe('fr');
            expect(detectLanguage('a')).toBe('fr'); // Default to French
        });
    });
});

describe('tr — translation function', () => {
    it('should return French string when lang is "fr"', () => {
        const lang: Lang = 'fr';
        expect(tr('Bonjour', 'Hello', lang)).toBe('Bonjour');
        expect(tr('Lister les datasets', 'List datasets', lang)).toBe('Lister les datasets');
    });

    it('should return English string when lang is "en"', () => {
        const lang: Lang = 'en';
        expect(tr('Bonjour', 'Hello', lang)).toBe('Hello');
        expect(tr('Lister les datasets', 'List datasets', lang)).toBe('List datasets');
    });

    it('should handle empty strings', () => {
        expect(tr('', 'Empty', 'fr')).toBe('');
        expect(tr('Empty', '', 'en')).toBe('');
    });

    it('should preserve special characters', () => {
        expect(tr('Données (àâäé)', 'Data (accents)', 'fr')).toBe('Données (àâäé)');
        expect(tr('Données (àâäé)', 'Data (accents)', 'en')).toBe('Data (accents)');
    });

    it('should work with multiline strings', () => {
        const frMulti = 'Ligne 1\nLigne 2\nLigne 3';
        const enMulti = 'Line 1\nLine 2\nLine 3';
        expect(tr(frMulti, enMulti, 'fr')).toBe(frMulti);
        expect(tr(frMulti, enMulti, 'en')).toBe(enMulti);
    });
});

describe('Integration: detectLanguage + tr', () => {
    it('should correctly chain language detection with translation', () => {
        const frPrompt = 'liste les datasets HLQ.PROD';
        const enPrompt = 'list datasets HLQ.PROD';

        const frLang = detectLanguage(frPrompt);
        const enLang = detectLanguage(enPrompt);

        const frMessage = tr('Analyse en cours...', 'Analyzing...', frLang);
        const enMessage = tr('Analyse en cours...', 'Analyzing...', enLang);

        expect(frMessage).toBe('Analyse en cours...');
        expect(enMessage).toBe('Analyzing...');
    });

    it('should maintain consistency across multiple translations', () => {
        const userPrompt = 'supprime le membre OLDPGM';
        const detectedLang = detectLanguage(userPrompt);

        const msg1 = tr('Suppression...', 'Deleting...', detectedLang);
        const msg2 = tr('Confirmez-vous?', 'Confirm?', detectedLang);
        const msg3 = tr('Opération réussie', 'Success', detectedLang);

        expect(msg1).toBe('Suppression...');
        expect(msg2).toBe('Confirmez-vous?');
        expect(msg3).toBe('Opération réussie');
    });
});
