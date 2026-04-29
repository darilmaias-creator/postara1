export type SubscriptionPlan = 'free' | 'premium';
export type GenerationMode = 'short' | 'medium' | 'premium';

export interface GenerationModePreset {
    mode: GenerationMode;
    titleMinLength: number;
    captionMinLength: number;
    ctaMinLength: number;
    descriptionMinLength: number;
    maxOutputTokens: number;
    captionGuidance: string;
    ctaGuidance: string;
    promptRequirements: string[];
}

export interface ResolvedGenerationPolicy {
    subscriptionPlan: SubscriptionPlan;
    generationMode: GenerationMode;
    modeAdjusted: boolean;
    preset: GenerationModePreset;
}

const FREE_DEFAULT_MODE: GenerationMode = 'short';
const PREMIUM_DEFAULT_MODE: GenerationMode = 'premium';

const generationModePresets: Record<GenerationMode, GenerationModePreset> = {
    short: {
        mode: 'short',
        titleMinLength: 14,
        captionMinLength: 180,
        ctaMinLength: 14,
        descriptionMinLength: 260,
        maxOutputTokens: 420,
        captionGuidance: 'Legenda enxuta, mas completa, com 1 ou 2 parágrafos curtos e pelo menos 180 caracteres.',
        ctaGuidance: 'CTA curta e direta, com pelo menos 14 caracteres.',
        promptRequirements: [
            '- Modo short: entregar uma versão mais concisa e objetiva.',
            '- Mesmo sendo mais curta, a legenda precisa parecer profissional e pronta para publicar.',
            '- Priorize clareza, benefício principal e impacto rápido.'
        ]
    },
    medium: {
        mode: 'medium',
        titleMinLength: 16,
        captionMinLength: 260,
        ctaMinLength: 18,
        descriptionMinLength: 380,
        maxOutputTokens: 700,
        captionGuidance:
            'Legenda equilibrada, pronta para publicação, com 2 parágrafos e pelo menos 260 caracteres. Deve ser persuasiva e substanciosa.',
        ctaGuidance: 'CTA objetiva e natural, com pelo menos 18 caracteres.',
        promptRequirements: [
            '- Modo medium: entregar uma versão equilibrada entre concisão e profundidade.',
            '- A legenda deve trazer benefícios claros, contexto e sensação de valor real.'
        ]
    },
    premium: {
        mode: 'premium',
        titleMinLength: 18,
        captionMinLength: 420,
        ctaMinLength: 22,
        descriptionMinLength: 560,
        maxOutputTokens: 1000,
        captionGuidance:
            'Legenda premium, mais rica e persuasiva, com 2 ou 3 parágrafos bem desenvolvidos e pelo menos 420 caracteres. Deve passar sensação de conteúdo mais valioso.',
        ctaGuidance: 'CTA mais forte e elegante, com pelo menos 22 caracteres.',
        promptRequirements: [
            '- Modo premium: entregar uma versão mais aprofundada, refinada e valiosa.',
            '- Trabalhe melhor desejo, benefícios, contexto e percepção de qualidade.',
            '- O texto deve soar superior ao modo free, sem exageros nem enrolação.'
        ]
    }
};

const premiumAllowedModes = new Set<GenerationMode>(['short', 'medium', 'premium']);

export const isSubscriptionPlan = (value: string): value is SubscriptionPlan =>
    value === 'free' || value === 'premium';

export const isGenerationMode = (value: string): value is GenerationMode =>
    value === 'short' || value === 'medium' || value === 'premium';

// Essa política centraliza a regra de monetização para o app inteiro.
export const resolveGenerationPolicy = (
    subscriptionPlan: SubscriptionPlan = 'free',
    requestedMode?: GenerationMode
): ResolvedGenerationPolicy => {
    if (subscriptionPlan === 'free') {
        return {
            subscriptionPlan,
            generationMode: FREE_DEFAULT_MODE,
            modeAdjusted: requestedMode !== undefined && requestedMode !== FREE_DEFAULT_MODE,
            preset: generationModePresets[FREE_DEFAULT_MODE]
        };
    }

    const resolvedMode =
        requestedMode && premiumAllowedModes.has(requestedMode) ? requestedMode : PREMIUM_DEFAULT_MODE;

    return {
        subscriptionPlan,
        generationMode: resolvedMode,
        modeAdjusted: requestedMode !== undefined && requestedMode !== resolvedMode,
        preset: generationModePresets[resolvedMode]
    };
};
