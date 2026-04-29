import { env } from '../../config/env';
import { ResponseSchema, SchemaType } from '@google/generative-ai';
import { AppError } from '../../errors/app-error';
import { GeminiModelCandidate } from '../../lib/gemini';
import { GenerationModePreset, ResolvedGenerationPolicy, resolveGenerationPolicy } from './ai.generation';
import { GenerateDescriptionInput, GenerateDescriptionResult, GeneratedPostContent } from './ai.types';

type ProviderError = Error & {
    status?: number;
    statusText?: string;
    errorDetails?: unknown;
};

const TRANSIENT_PROVIDER_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_PROVIDER_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [400, 1200];
const TEMPLATE_FALLBACK_MODEL = 'local-template-v1';

type StructuredPostPayload = {
    title: string;
    caption: string;
    cta: string;
    hashtags: string[];
};

const buildStructuredPostSchema = (preset: GenerationModePreset): ResponseSchema => ({
    type: SchemaType.OBJECT,
    description: `Estrutura final de um post de marketing para redes sociais no modo ${preset.mode}.`,
    properties: {
        title: {
            type: SchemaType.STRING,
            description: `Título curto e chamativo em português do Brasil, com pelo menos ${preset.titleMinLength} caracteres.`
        },
        caption: {
            type: SchemaType.STRING,
            description: preset.captionGuidance
        },
        cta: {
            type: SchemaType.STRING,
            description: preset.ctaGuidance
        },
        hashtags: {
            type: SchemaType.ARRAY,
            description: 'Lista de 3 a 5 hashtags curtas, únicas e relevantes.',
            minItems: 3,
            maxItems: 5,
            items: {
                type: SchemaType.STRING,
                description: 'Hashtag individual começando com # e sem espaços.'
            }
        }
    },
    required: ['title', 'caption', 'cta', 'hashtags']
});

const normalizeOptionalText = (value: string | undefined, fallback: string): string => {
    const trimmedValue = value?.trim();
    return trimmedValue ? trimmedValue : fallback;
};

const buildDescriptionPrompt = (input: GenerateDescriptionInput, policy: ResolvedGenerationPolicy): string => {
    const productName = input.productName.trim();
    const productFeatures = normalizeOptionalText(input.productFeatures, 'Não informado');
    const targetAudience = normalizeOptionalText(input.targetAudience, 'Público geral');
    const tone = normalizeOptionalText(input.tone, 'alegre e persuasivo');

    return [
        'Atue como um especialista em Marketing Digital para e-commerce.',
        'Crie exatamente 1 post para Instagram e Facebook.',
        `Nome do produto: ${productName}`,
        `Características principais: ${productFeatures}`,
        `Público-alvo: ${targetAudience}`,
        `Tom de voz desejado: ${tone}`,
        `Plano do usuário: ${policy.subscriptionPlan}`,
        `Modo de geração aplicado: ${policy.generationMode}`,
        'Requisitos do conteúdo:',
        '- Responder em português do Brasil.',
        '- Não entregar múltiplas opções, análises, listas explicativas ou observações extras.',
        '- O título deve ser atrativo e natural.',
        '- A legenda precisa ter conteúdo suficiente para parecer profissional, sem ficar curta demais.',
        '- A legenda deve destacar benefícios reais do produto, gerar desejo e soar pronta para publicação.',
        '- Use emojis com moderação.',
        '- A CTA deve incentivar ação sem ser agressiva.',
        '- As hashtags devem ser relevantes ao produto.',
        ...policy.preset.promptRequirements,
        'Retorne apenas os campos do schema solicitado.'
    ].join('\n');
};

const buildTemplateFallbackContent = (
    input: GenerateDescriptionInput,
    policy: ResolvedGenerationPolicy
): GeneratedPostContent => {
    const productName = input.productName.trim();
    const productFeatures = normalizeOptionalText(input.productFeatures, 'qualidade e praticidade para o dia a dia');
    const targetAudience = normalizeOptionalText(input.targetAudience, 'quem busca praticidade');
    const tone = normalizeOptionalText(input.tone, 'alegre');
    const title = `☕ ${productName} para uma rotina mais prática`;
    const captionByMode = {
        short: `Mais praticidade para ${targetAudience}: ${productName} entrega ${productFeatures} de um jeito simples, funcional e perfeito para a rotina. Uma opção ${tone} para destacar benefícios reais sem complicação.`,
        medium: [
            `Se a ideia é ganhar tempo sem abrir mão de um bom resultado, ${productName} é uma escolha que faz diferença na rotina. Com ${productFeatures}, ele entrega mais conveniência para ${targetAudience} e ajuda a transformar tarefas do dia a dia em momentos mais simples e agradáveis.`,
            `Além de funcional, esse produto combina perfeitamente com uma comunicação ${tone}, destacando benefícios reais e despertando interesse de quem procura praticidade, conforto e uma experiência melhor no uso diário.`
        ].join('\n\n'),
        premium: [
            `Quando praticidade e boa experiência precisam caminhar juntas, ${productName} se destaca como uma escolha inteligente para ${targetAudience}. Com ${productFeatures}, ele ajuda a simplificar a rotina, melhora a experiência de uso e entrega mais conforto no dia a dia de quem valoriza soluções realmente úteis.`,
            `Além do ganho funcional, esse produto abre espaço para uma comunicação ${tone} mais rica, capaz de despertar desejo, reforçar valor percebido e mostrar como pequenos detalhes podem transformar a experiência de consumo em algo mais agradável, eficiente e memorável.`,
            `É o tipo de item que conversa com um público que busca conveniência, qualidade e uma sensação real de cuidado na rotina.`
        ].join('\n\n')
    };
    const ctaByMode = {
        short: 'Descubra como facilitar sua rotina com essa escolha prática.',
        medium: 'Leve mais praticidade para o seu dia e descubra como esse produto pode facilitar sua rotina.',
        premium: 'Garanta uma experiência mais prática, completa e confortável no seu dia com essa escolha pensada para facilitar sua rotina.'
    };
    const caption = captionByMode[policy.generationMode];
    const cta = ctaByMode[policy.generationMode];
    const hashtags = ['#Postara', '#MarketingDigital', '#Ecommerce', '#ProdutoEmDestaque', '#VendasOnline'];

    return {
        title,
        caption,
        cta,
        hashtags,
        description: [title, caption, cta, hashtags.join(' ')].join('\n\n')
    };
};

const sleep = (delayMs: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, delayMs);
    });

const getProviderStatus = (error: unknown): number | undefined => {
    if (!error || typeof error !== 'object') {
        return undefined;
    }

    const providerError = error as ProviderError;
    return typeof providerError.status === 'number' ? providerError.status : undefined;
};

const parseStructuredPostPayload = (rawResponseText: string): StructuredPostPayload => {
    let parsedResponse: unknown;

    try {
        parsedResponse = JSON.parse(rawResponseText);
    } catch {
        throw new AppError('A IA retornou um JSON inválido.', {
            code: 'INVALID_AI_RESPONSE',
            statusCode: 502
        });
    }

    if (!parsedResponse || typeof parsedResponse !== 'object') {
        throw new AppError('A IA retornou uma estrutura inválida.', {
            code: 'INVALID_AI_RESPONSE',
            statusCode: 502
        });
    }

    const payload = parsedResponse as Record<string, unknown>;

    if (
        typeof payload.title !== 'string' ||
        typeof payload.caption !== 'string' ||
        typeof payload.cta !== 'string' ||
        !Array.isArray(payload.hashtags)
    ) {
        throw new AppError('A IA retornou campos obrigatórios ausentes ou inválidos.', {
            code: 'INVALID_AI_RESPONSE',
            statusCode: 502
        });
    }

    const hashtags = payload.hashtags.map((hashtag) => {
        if (typeof hashtag !== 'string') {
            throw new AppError('A IA retornou hashtags inválidas.', {
                code: 'INVALID_AI_RESPONSE',
                statusCode: 502
            });
        }

        return hashtag;
    });

    return {
        title: payload.title,
        caption: payload.caption,
        cta: payload.cta,
        hashtags
    };
};

const normalizeHashtag = (hashtag: string): string => {
    const compactHashtag = hashtag.trim().replace(/\s+/g, '');
    return compactHashtag.startsWith('#') ? compactHashtag : `#${compactHashtag}`;
};

const buildStructuredDescription = (content: Omit<GeneratedPostContent, 'description'>): string =>
    [content.title, content.caption, content.cta, content.hashtags.join(' ')].join('\n\n');

const normalizeStructuredPostContent = (
    payload: StructuredPostPayload,
    preset: GenerationModePreset
): GeneratedPostContent => {
    const title = payload.title.trim();
    const caption = payload.caption.trim();
    const cta = payload.cta.trim();
    const hashtags = Array.from(
        new Set(
            payload.hashtags
                .map(normalizeHashtag)
                .filter((hashtag) => hashtag.length > 1)
        )
    ).slice(0, 5);

    const structuredContent = {
        title,
        caption,
        cta,
        hashtags
    };

    const description = buildStructuredDescription(structuredContent);

    if (title.length < preset.titleMinLength) {
        throw new AppError('A IA retornou um título curto demais.', {
            code: 'INVALID_AI_RESPONSE',
            statusCode: 502
        });
    }

    if (caption.length < preset.captionMinLength) {
        throw new AppError('A IA retornou uma legenda curta demais.', {
            code: 'INVALID_AI_RESPONSE',
            statusCode: 502
        });
    }

    if (cta.length < preset.ctaMinLength) {
        throw new AppError('A IA retornou uma chamada para ação curta demais.', {
            code: 'INVALID_AI_RESPONSE',
            statusCode: 502
        });
    }

    if (hashtags.length < 3) {
        throw new AppError('A IA retornou poucas hashtags.', {
            code: 'INVALID_AI_RESPONSE',
            statusCode: 502
        });
    }

    if (description.length < preset.descriptionMinLength) {
        throw new AppError('A IA retornou um post curto demais.', {
            code: 'INVALID_AI_RESPONSE',
            statusCode: 502
        });
    }

    return {
        ...structuredContent,
        description
    };
};

type ModelFailure = {
    candidate: GeminiModelCandidate;
    error: unknown;
};

const toProviderAppError = (failures: ModelFailure[]): AppError => {
    const lastFailure = failures[failures.length - 1];
    const providerError = lastFailure?.error as ProviderError | undefined;
    const status = getProviderStatus(lastFailure?.error);
    const isTransient = status ? TRANSIENT_PROVIDER_STATUSES.has(status) : false;
    const triedModels = failures.map(({ candidate, error }) => ({
        provider: candidate.provider,
        source: candidate.source,
        model: candidate.modelName,
        status: getProviderStatus(error),
        statusText: (error as ProviderError).statusText
    }));

    if (isTransient) {
        return new AppError('O serviço de IA está temporariamente indisponível. Tente novamente em alguns instantes.', {
            code: 'AI_PROVIDER_UNAVAILABLE',
            statusCode: status ?? 503,
            details: {
                provider: 'gemini',
                providerStatus: status,
                providerStatusText: providerError?.statusText,
                retryable: true,
                triedModels
            },
            publicDetails: {
                canRetry: true,
                action: 'try_again_later',
                backupAttempted: failures.length > 1
            }
        });
    }

    return new AppError('A geração de conteúdo falhou no provedor de IA.', {
        code: 'AI_PROVIDER_ERROR',
        statusCode: 502,
        details: {
            provider: 'gemini',
            providerStatus: status,
            providerStatusText: providerError?.statusText,
            retryable: false,
            triedModels
        },
        publicDetails: {
            canRetry: false,
            action: 'review_request',
            backupAttempted: failures.length > 1
        }
    });
};

export class AiService {
    constructor(private readonly models: GeminiModelCandidate[]) {}

    private async generateWithModel(
        candidate: GeminiModelCandidate,
        prompt: string,
        policy: ResolvedGenerationPolicy
    ): Promise<GenerateDescriptionResult> {
        let lastError: unknown;

        for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt += 1) {
            try {
                const result = await candidate.client.generateContent({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseMimeType: 'application/json',
                        responseSchema: buildStructuredPostSchema(policy.preset),
                        temperature: 0.8,
                        maxOutputTokens: policy.preset.maxOutputTokens
                    }
                });
                const rawResponseText = result.response.text().trim();

                if (!rawResponseText) {
                    throw new AppError('A IA não retornou uma descrição válida.', {
                        code: 'EMPTY_AI_RESPONSE',
                        statusCode: 502
                    });
                }

                const parsedPayload = parseStructuredPostPayload(rawResponseText);
                const structuredContent = normalizeStructuredPostContent(parsedPayload, policy.preset);

                return {
                    ...structuredContent,
                    subscriptionPlan: policy.subscriptionPlan,
                    generationMode: policy.generationMode,
                    modeAdjusted: policy.modeAdjusted,
                    source: candidate.source,
                    provider: candidate.provider,
                    model: candidate.modelName,
                    fallbackUsed: candidate.source !== 'gemini_primary'
                };
            } catch (error) {
                lastError = error;
                const status = getProviderStatus(error);
                const canRetry = status ? TRANSIENT_PROVIDER_STATUSES.has(status) : false;
                const retryDelayMs = RETRY_DELAYS_MS[attempt - 1];

                if (!canRetry || retryDelayMs === undefined) {
                    break;
                }

                await sleep(retryDelayMs);
            }
        }

        throw lastError;
    }

    async generateDescription(input: GenerateDescriptionInput): Promise<GenerateDescriptionResult> {
        const productName = input.productName.trim();

        if (!productName) {
            throw new AppError('O nome do produto é obrigatório.', {
                code: 'BAD_REQUEST',
                statusCode: 400
            });
        }

        const policy = resolveGenerationPolicy(input.subscriptionPlan, input.generationMode);
        const prompt = buildDescriptionPrompt(
            {
                ...input,
                productName
            },
            policy
        );

        const failures: ModelFailure[] = [];

        for (const candidate of this.models) {
            try {
                return await this.generateWithModel(candidate, prompt, policy);
            } catch (error) {
                failures.push({ candidate, error });
            }
        }

        if (env.aiFallbackMode === 'template') {
            return {
                ...buildTemplateFallbackContent(input, policy),
                subscriptionPlan: policy.subscriptionPlan,
                generationMode: policy.generationMode,
                modeAdjusted: policy.modeAdjusted,
                source: 'template_fallback',
                provider: 'template',
                model: TEMPLATE_FALLBACK_MODEL,
                fallbackUsed: true
            };
        }

        throw toProviderAppError(failures);
    }
}
