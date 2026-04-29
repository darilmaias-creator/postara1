import { GenerationMode, SubscriptionPlan } from './ai.generation';

export type GenerateDescriptionSource = 'gemini_primary' | 'gemini_backup' | 'template_fallback';

export interface GeneratedPostContent {
    title: string;
    caption: string;
    cta: string;
    hashtags: string[];
    description: string;
}

export interface GenerateDescriptionInput {
    productName: string;
    productFeatures?: string;
    targetAudience?: string;
    tone?: string;
    subscriptionPlan?: SubscriptionPlan;
    generationMode?: GenerationMode;
    userId?: string;
    sessionId?: string;
}

export interface GenerateDescriptionResult extends GeneratedPostContent {
    subscriptionPlan: SubscriptionPlan;
    generationMode: GenerationMode;
    modeAdjusted: boolean;
    source: GenerateDescriptionSource;
    provider: 'gemini' | 'template';
    model: string;
    fallbackUsed: boolean;
}
