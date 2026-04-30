const TRANSIENT_PROVIDER_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_PROVIDER_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [400, 1200];
const TEMPLATE_FALLBACK_MODEL = 'local-template-v1';
const DEFAULT_GEMINI_PRIMARY_MODEL = 'gemini-2.5-flash';
const DEFAULT_GEMINI_BACKUP_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_SUPABASE_URL = 'https://knktwfccotaudwhxpyma.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_v4ZJWa-hq3YRU3AGAeOV2Q_sSW4pM7F';

const generationModePresets = {
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

const premiumAllowedModes = new Set(['short', 'medium', 'premium']);

const json = (res, statusCode, payload) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
};

const parseBody = (body) => {
    if (!body) {
        return {};
    }

    if (typeof body === 'object') {
        return body;
    }

    try {
        return JSON.parse(body);
    } catch {
        return null;
    }
};

const normalizeOptionalText = (value, fallback) => {
    const trimmedValue = typeof value === 'string' ? value.trim() : '';
    return trimmedValue || fallback;
};

const resolveGenerationPolicy = (subscriptionPlan = 'free', requestedMode) => {
    if (subscriptionPlan === 'free') {
        return {
            subscriptionPlan,
            generationMode: 'short',
            modeAdjusted: requestedMode !== undefined && requestedMode !== 'short',
            preset: generationModePresets.short
        };
    }

    const resolvedMode =
        typeof requestedMode === 'string' && premiumAllowedModes.has(requestedMode) ? requestedMode : 'premium';

    return {
        subscriptionPlan,
        generationMode: resolvedMode,
        modeAdjusted: requestedMode !== undefined && requestedMode !== resolvedMode,
        preset: generationModePresets[resolvedMode]
    };
};

const buildStructuredPostSchema = (preset) => ({
    type: 'object',
    properties: {
        title: {
            type: 'string',
            description: `Título curto e chamativo em português do Brasil, com pelo menos ${preset.titleMinLength} caracteres.`
        },
        caption: {
            type: 'string',
            description: preset.captionGuidance
        },
        cta: {
            type: 'string',
            description: preset.ctaGuidance
        },
        hashtags: {
            type: 'array',
            description: 'Lista de 3 a 5 hashtags curtas, únicas e relevantes.',
            minItems: 3,
            maxItems: 5,
            items: {
                type: 'string',
                description: 'Hashtag individual começando com # e sem espaços.'
            }
        }
    },
    required: ['title', 'caption', 'cta', 'hashtags']
});

const buildDescriptionPrompt = (input, policy) => {
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

const normalizeHashtag = (hashtag) => {
    const compactHashtag = String(hashtag || '').trim().replace(/\s+/g, '');
    return compactHashtag.startsWith('#') ? compactHashtag : `#${compactHashtag}`;
};

const buildStructuredDescription = (content) => [content.title, content.caption, content.cta, content.hashtags.join(' ')].join('\n\n');

const normalizeStructuredPostContent = (payload, preset) => {
    const title = String(payload.title || '').trim();
    const caption = String(payload.caption || '').trim();
    const cta = String(payload.cta || '').trim();
    const hashtags = Array.from(new Set((payload.hashtags || []).map(normalizeHashtag).filter((item) => item.length > 1))).slice(0, 5);

    const structuredContent = { title, caption, cta, hashtags };
    const description = buildStructuredDescription(structuredContent);

    if (title.length < preset.titleMinLength) {
        throw new Error('A IA retornou um título curto demais.');
    }

    if (caption.length < preset.captionMinLength) {
        throw new Error('A IA retornou uma legenda curta demais.');
    }

    if (cta.length < preset.ctaMinLength) {
        throw new Error('A IA retornou uma chamada para ação curta demais.');
    }

    if (hashtags.length < 3) {
        throw new Error('A IA retornou poucas hashtags.');
    }

    if (description.length < preset.descriptionMinLength) {
        throw new Error('A IA retornou um post curto demais.');
    }

    return {
        ...structuredContent,
        description
    };
};

const parseStructuredPostPayload = (rawResponseText) => {
    const parsedResponse = JSON.parse(rawResponseText);

    if (
        !parsedResponse ||
        typeof parsedResponse !== 'object' ||
        typeof parsedResponse.title !== 'string' ||
        typeof parsedResponse.caption !== 'string' ||
        typeof parsedResponse.cta !== 'string' ||
        !Array.isArray(parsedResponse.hashtags)
    ) {
        throw new Error('A IA retornou campos obrigatórios ausentes ou inválidos.');
    }

    return parsedResponse;
};

const buildTemplateFallbackContent = (input, policy) => {
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
            'É o tipo de item que conversa com um público que busca conveniência, qualidade e uma sensação real de cuidado na rotina.'
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

const sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

const createProviderError = async (response) => {
    const text = await response.text();
    let parsed;

    try {
        parsed = JSON.parse(text);
    } catch {
        parsed = null;
    }

    const error = new Error(parsed?.error?.message || response.statusText || 'Falha no provedor de IA.');
    error.status = response.status;
    error.statusText = response.statusText;
    error.details = parsed;
    return error;
};

const generateWithGeminiModel = async (modelName, source, prompt, policy, apiKey) => {
    let lastError;

    for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt += 1) {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        contents: [
                            {
                                role: 'user',
                                parts: [{ text: prompt }]
                            }
                        ],
                        generationConfig: {
                            responseMimeType: 'application/json',
                            responseJsonSchema: buildStructuredPostSchema(policy.preset),
                            temperature: 0.8,
                            maxOutputTokens: policy.preset.maxOutputTokens
                        }
                    })
                }
            );

            if (!response.ok) {
                throw await createProviderError(response);
            }

            const payload = await response.json();
            const rawResponseText = payload?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

            if (!rawResponseText) {
                throw new Error('A IA não retornou uma descrição válida.');
            }

            const parsedPayload = parseStructuredPostPayload(rawResponseText);
            const structuredContent = normalizeStructuredPostContent(parsedPayload, policy.preset);

            return {
                ...structuredContent,
                subscriptionPlan: policy.subscriptionPlan,
                generationMode: policy.generationMode,
                modeAdjusted: policy.modeAdjusted,
                source,
                provider: 'gemini',
                model: modelName,
                fallbackUsed: source !== 'gemini_primary'
            };
        } catch (error) {
            lastError = error;
            const canRetry = error.status && TRANSIENT_PROVIDER_STATUSES.has(error.status);
            const retryDelayMs = RETRY_DELAYS_MS[attempt - 1];

            if (!canRetry || retryDelayMs === undefined) {
                break;
            }

            await sleep(retryDelayMs);
        }
    }

    throw lastError;
};

const fetchAuthenticatedUser = async (authorizationHeader) => {
    const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

    if (!authorizationHeader || !supabaseUrl || !publishableKey) {
        return null;
    }

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
            apikey: publishableKey,
            Authorization: authorizationHeader
        }
    });

    if (!userResponse.ok) {
        return null;
    }

    const authUser = await userResponse.json();
    const profileResponse = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=id,name,email,subscription_plan`,
        {
            headers: {
                apikey: publishableKey,
                Authorization: authorizationHeader
            }
        }
    );

    if (!profileResponse.ok) {
        return {
            id: authUser.id,
            email: authUser.email,
            subscriptionPlan: 'free'
        };
    }

    const profiles = await profileResponse.json();
    const profile = Array.isArray(profiles) ? profiles[0] : null;

    return {
        id: authUser.id,
        email: authUser.email,
        subscriptionPlan: profile?.subscription_plan === 'premium' ? 'premium' : 'free'
    };
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }

    if (req.method !== 'POST') {
        return json(res, 405, {
            status: 'error',
            error: {
                code: 'METHOD_NOT_ALLOWED',
                message: 'Método não permitido.'
            }
        });
    }

    const body = parseBody(req.body);

    if (!body || typeof body !== 'object') {
        return json(res, 400, {
            status: 'error',
            error: {
                code: 'BAD_REQUEST',
                message: 'O corpo da requisição precisa ser um JSON válido.'
            }
        });
    }

    const productName = typeof body.productName === 'string' ? body.productName.trim() : '';

    if (!productName) {
        return json(res, 400, {
            status: 'error',
            error: {
                code: 'BAD_REQUEST',
                message: 'O nome do produto é obrigatório.'
            }
        });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
        return json(res, 500, {
            status: 'error',
            error: {
                code: 'INVALID_CONFIGURATION',
                message: 'A variável GEMINI_API_KEY não foi configurada.'
            }
        });
    }

    try {
        const user = await fetchAuthenticatedUser(req.headers.authorization);
        const requestedGenerationMode = typeof body.generationMode === 'string' ? body.generationMode : undefined;
        const policy = resolveGenerationPolicy(user?.subscriptionPlan || 'free', requestedGenerationMode);
        const prompt = buildDescriptionPrompt(
            {
                productName,
                productFeatures: typeof body.productFeatures === 'string' ? body.productFeatures : undefined,
                targetAudience: typeof body.targetAudience === 'string' ? body.targetAudience : undefined,
                tone: typeof body.tone === 'string' ? body.tone : undefined
            },
            policy
        );

        const primaryModel = process.env.GEMINI_PRIMARY_MODEL || DEFAULT_GEMINI_PRIMARY_MODEL;
        const backupModel = process.env.GEMINI_BACKUP_MODEL || DEFAULT_GEMINI_BACKUP_MODEL;
        const fallbackMode = String(process.env.AI_FALLBACK_MODE || 'template').toLowerCase();
        const failures = [];

        for (const candidate of [
            { modelName: primaryModel, source: 'gemini_primary' },
            ...(backupModel && backupModel !== 'disabled' ? [{ modelName: backupModel, source: 'gemini_backup' }] : [])
        ]) {
            try {
                const result = await generateWithGeminiModel(
                    candidate.modelName,
                    candidate.source,
                    prompt,
                    policy,
                    geminiApiKey
                );

                return json(res, 200, {
                    status: 'success',
                    data: result
                });
            } catch (error) {
                failures.push({
                    model: candidate.modelName,
                    source: candidate.source,
                    status: error.status,
                    message: error.message
                });
            }
        }

        if (fallbackMode === 'template') {
            return json(res, 200, {
                status: 'success',
                data: {
                    ...buildTemplateFallbackContent(body, policy),
                    subscriptionPlan: policy.subscriptionPlan,
                    generationMode: policy.generationMode,
                    modeAdjusted: policy.modeAdjusted,
                    source: 'template_fallback',
                    provider: 'template',
                    model: TEMPLATE_FALLBACK_MODEL,
                    fallbackUsed: true
                },
                meta: {
                    failures
                }
            });
        }

        return json(res, 503, {
            status: 'error',
            error: {
                code: 'AI_PROVIDER_UNAVAILABLE',
                message: 'O serviço de IA está temporariamente indisponível. Tente novamente em alguns instantes.',
                details: {
                    canRetry: true,
                    action: 'try_again_later'
                }
            }
        });
    } catch (error) {
        return json(res, 500, {
            status: 'error',
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: error instanceof Error ? error.message : 'Ocorreu um erro inesperado ao gerar o conteúdo.'
            }
        });
    }
};
