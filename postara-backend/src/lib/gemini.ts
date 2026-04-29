import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { env } from '../config/env';

export interface GeminiModelCandidate {
    provider: 'gemini';
    source: 'gemini_primary' | 'gemini_backup';
    modelName: string;
    client: GenerativeModel;
}

// O cliente fica isolado para facilitar troca futura por outro provedor de IA.
const genAI = new GoogleGenerativeAI(env.geminiApiKey);

const createGeminiModelCandidate = (
    source: GeminiModelCandidate['source'],
    modelName: string
): GeminiModelCandidate => ({
    provider: 'gemini',
    source,
    modelName,
    client: genAI.getGenerativeModel({ model: modelName })
});

export const createDescriptionModelCandidates = (): GeminiModelCandidate[] => {
    const candidates = [
        createGeminiModelCandidate('gemini_primary', env.geminiPrimaryModel),
        env.geminiBackupModel ? createGeminiModelCandidate('gemini_backup', env.geminiBackupModel) : null
    ].filter((candidate): candidate is GeminiModelCandidate => candidate !== null);

    const seenModels = new Set<string>();

    return candidates.filter((candidate) => {
        if (seenModels.has(candidate.modelName)) {
            return false;
        }

        seenModels.add(candidate.modelName);
        return true;
    });
};
