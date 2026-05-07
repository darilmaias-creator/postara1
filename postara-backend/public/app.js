const STORAGE_KEYS = {
    sessionId: 'postara.session.id',
    onboardingStatus: 'postara.onboarding.status'
};

const ONBOARDING_STATUS = {
    pending: 'pending',
    completed: 'completed',
    skipped: 'skipped'
};

const runtimeConfig = window.POSTARA_CONFIG || {};
const API_BASE_URL = String(runtimeConfig.apiBaseUrl || '').replace(/\/$/, '');
const SUPABASE_URL = String(runtimeConfig.supabaseUrl || '').replace(/\/$/, '');
const SUPABASE_PUBLISHABLE_KEY = String(runtimeConfig.supabasePublishableKey || '').trim();
const POST_IMAGES_BUCKET = 'postara-images';
const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
const supabaseClient =
    hasSupabaseConfig && window.supabase?.createClient
        ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
              auth: {
                  flowType: 'pkce',
                  detectSessionInUrl: true
              }
          })
        : null;

const VIEW_CONFIG = {
    dashboard: {
        title: 'Visão geral',
        description: 'Veja o estado da conta, por onde começar e os atalhos para continuar no app.'
    },
    generate: {
        title: 'Gerar conteúdo',
        description: 'Descreva seu produto, gere novos posts e acompanhe o resultado completo em um espaço dedicado.'
    },
    history: {
        title: 'Histórico',
        description: 'Abra de novo resultados antigos com mais conforto e navegue pelo histórico em páginas.'
    },
    'photo-guide': {
        title: 'Fotos',
        description: 'Dicas práticas para fotografar melhor seus produtos, mesmo usando apenas o celular.'
    },
    account: {
        title: 'Conta',
        description: 'Entre, conecte suas redes e ajuste sua conta para deixar o app pronto para publicar.'
    }
};

const ONBOARDING_STEPS = [
    {
        id: 'login',
        view: 'account',
        targetKey: 'authPanel',
        title: 'Faça login para destravar o fluxo do app',
        description: 'Comece pela conta. Entrando no Postara, você libera histórico, plano e a base para publicar direto nas redes.',
        tip: 'Abra a aba Conta e entre ou crie sua conta. Depois volte aqui e seguimos para a conexão das redes.'
    },
    {
        id: 'social',
        view: 'account',
        targetKey: 'socialPanel',
        title: 'Conecte Facebook e Instagram',
        description: 'Ainda na Conta, conecte suas redes para publicar sem copiar tudo manualmente depois.',
        tip: 'Primeiro conecte o Facebook. Depois, se quiser, conecte o Instagram para publicar o mesmo conteúdo com imagem.'
    },
    {
        id: 'generate',
        view: 'generate',
        targetKey: 'generatorPanel',
        title: 'Gere seu primeiro post',
        description: 'Agora vamos para a geração. Quanto mais detalhes você colocar sobre o produto, melhor a IA monta o texto.',
        tip: 'Descreva material, medidas, acabamento, cor, uso e diferenciais. Isso faz muita diferença na legenda final.'
    }
];

const createInitialPublishDraft = () => ({
    connectionId: '',
    facebook: true,
    instagram: false,
    mediaUrl: '',
    mediaFileName: '',
    mediaPreviewUrl: '',
    mediaUploadState: 'idle'
});

const state = {
    sessionId: localStorage.getItem(STORAGE_KEYS.sessionId) || crypto.randomUUID(),
    user: null,
    socialConnections: [],
    socialDebug: null,
    currentAuthTab: 'login',
    currentView: 'dashboard',
    currentResult: null,
    currentRequestContext: null,
    currentHistoryMeta: null,
    resultActionState: {
        isLoading: false,
        scope: null,
        optionIndex: null
    },
    publishState: {
        isLoading: false,
        results: [],
        confirmationOpen: false,
        status: 'idle',
        message: ''
    },
    generateState: {
        status: 'idle',
        message: ''
    },
    publishDraft: createInitialPublishDraft(),
    onboarding: {
        status: localStorage.getItem(STORAGE_KEYS.onboardingStatus) || ONBOARDING_STATUS.pending,
        visible: false,
        activeStepIndex: 0,
        hasAutoStarted: false
    },
    instagramHelpMode: 'pro',
    history: {
        entries: [],
        page: 1,
        limit: 5,
        total: 0,
        hasNextPage: false
    }
};

localStorage.setItem(STORAGE_KEYS.sessionId, state.sessionId);
localStorage.removeItem('postara.auth.token');

// Centralizamos os seletores para deixar a manutenção da SPA simples conforme o layout evolui.
const elements = {
    appSplash: document.getElementById('app-splash'),
    toast: document.getElementById('toast'),
    deploymentNotice: document.getElementById('deployment-notice'),
    viewTitle: document.getElementById('view-title'),
    viewDescription: document.getElementById('view-description'),
    viewButtons: [...document.querySelectorAll('[data-view-target]')],
    goViewButtons: [...document.querySelectorAll('[data-go-view]')],
    accountNavSummary: document.getElementById('account-nav-summary'),
    sidebarUserAvatar: document.getElementById('sidebar-user-avatar'),
    sidebarUserName: document.getElementById('sidebar-user-name'),
    sidebarUserPlan: document.getElementById('sidebar-user-plan'),
    views: [...document.querySelectorAll('[data-view]')],
    resultSlots: [...document.querySelectorAll('[data-result-slot]')],
    dashboardGreeting: document.getElementById('dashboard-greeting'),
    dashboardSubtitle: document.getElementById('dashboard-subtitle'),
    dashboardProgressNote: document.getElementById('dashboard-progress-note'),
    dashboardAuthStatus: document.getElementById('dashboard-auth-status'),
    dashboardPlanStatus: document.getElementById('dashboard-plan-status'),
    dashboardHistoryStatus: document.getElementById('dashboard-history-status'),
    dashboardResultStatus: document.getElementById('dashboard-result-status'),
    dashboardOnboardingPanel: document.getElementById('dashboard-onboarding-panel'),
    onboardingStepStatusLogin: document.getElementById('onboarding-step-status-login'),
    onboardingStepStatusSocial: document.getElementById('onboarding-step-status-social'),
    onboardingStepStatusGenerate: document.getElementById('onboarding-step-status-generate'),
    onboardingStepCards: [...document.querySelectorAll('[data-onboarding-step-card]')],
    startOnboardingButton: document.getElementById('start-onboarding-button'),
    skipOnboardingButton: document.getElementById('skip-onboarding-button'),
    guestAuthView: document.getElementById('guest-auth-view'),
    memberAuthView: document.getElementById('member-auth-view'),
    authPanel: document.getElementById('auth-panel'),
    socialPanel: document.getElementById('social-panel'),
    generatorPanel: document.getElementById('generator-panel'),
    showLoginTab: document.getElementById('show-login-tab'),
    showRegisterTab: document.getElementById('show-register-tab'),
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    profileForm: document.getElementById('profile-form'),
    profileNameInput: document.getElementById('profile-name-input'),
    saveProfileButton: document.getElementById('save-profile-button'),
    googleLoginButton: document.getElementById('google-login-button'),
    googleRegisterButton: document.getElementById('google-register-button'),
    googleRegisterDivider: document.getElementById('google-register-divider'),
    memberName: document.getElementById('member-name'),
    memberEmail: document.getElementById('member-email'),
    memberPlanBadge: document.getElementById('member-plan-badge'),
    memberIdBadge: document.getElementById('member-id-badge'),
    memberAvatar: document.getElementById('member-avatar'),
    subscriptionToggleButton: document.getElementById('subscription-toggle-button'),
    refreshProfileButton: document.getElementById('refresh-profile-button'),
    logoutButton: document.getElementById('logout-button'),
    connectMetaButton: document.getElementById('connect-meta-button'),
    connectMetaInstagramButton: document.getElementById('connect-meta-instagram-button'),
    refreshSocialButton: document.getElementById('refresh-social-button'),
    debugMetaButton: document.getElementById('debug-meta-button'),
    disconnectMetaButton: document.getElementById('disconnect-meta-button'),
    socialEmptyState: document.getElementById('social-empty-state'),
    socialConnectionsList: document.getElementById('social-connections-list'),
    socialDebugState: document.getElementById('social-debug-state'),
    generatorForm: document.getElementById('generator-form'),
    generateButton: document.getElementById('generate-button'),
    generateFeedback: document.getElementById('generate-feedback'),
    generationPhotoTip: document.getElementById('generation-photo-tip'),
    openPhotoGuideButton: document.getElementById('open-photo-guide-button'),
    featuresHelpTrigger: document.getElementById('features-help-trigger'),
    featuresHelpPopover: document.getElementById('features-help-popover'),
    generationModeSelect: document.getElementById('generation-mode-select'),
    generationModeHint: document.getElementById('generation-mode-hint'),
    generationModeLockOptions: [...document.querySelectorAll('[data-locked-mode]')],
    generationModeLockOptionsWrap: document.getElementById('generation-mode-lock-options'),
    generationModeLockHint: document.getElementById('generation-mode-lock-hint'),
    generationModeUpgradeLink: document.getElementById('generation-mode-upgrade-link'),
    generationPlanCallout: document.getElementById('generation-plan-callout'),
    generationPlanBadge: document.getElementById('generation-plan-badge'),
    generationPlanTitle: document.getElementById('generation-plan-title'),
    generationPlanText: document.getElementById('generation-plan-text'),
    generationUpgradeButton: document.getElementById('generation-upgrade-button'),
    historyLockedState: document.getElementById('history-locked-state'),
    historyContent: document.getElementById('history-content'),
    historyList: document.getElementById('history-list'),
    historyLimitSelect: document.getElementById('history-limit-select'),
    refreshHistoryButton: document.getElementById('refresh-history-button'),
    historyPrevButton: document.getElementById('history-prev-button'),
    historyNextButton: document.getElementById('history-next-button'),
    historyPaginationLabel: document.getElementById('history-pagination-label'),
    onboardingLayer: document.getElementById('onboarding-layer'),
    onboardingProgressLabel: document.getElementById('onboarding-progress-label'),
    onboardingCardTitle: document.getElementById('onboarding-card-title'),
    onboardingCardDescription: document.getElementById('onboarding-card-description'),
    onboardingCardTip: document.getElementById('onboarding-card-tip'),
    onboardingCardSkip: document.getElementById('onboarding-card-skip'),
    onboardingPrevButton: document.getElementById('onboarding-prev-button'),
    onboardingNextButton: document.getElementById('onboarding-next-button'),
    instagramHelpProButton: document.getElementById('instagram-help-pro-button'),
    instagramHelpUnsureButton: document.getElementById('instagram-help-unsure-button'),
    instagramHelpViewPro: document.getElementById('instagram-help-view-pro'),
    instagramHelpViewUnsure: document.getElementById('instagram-help-view-unsure'),
    publishConfirmLayer: document.getElementById('publish-confirm-layer'),
    publishConfirmBody: document.getElementById('publish-confirm-body'),
    publishConfirmCancel: document.getElementById('publish-confirm-cancel'),
    publishConfirmCancelFooter: document.getElementById('publish-confirm-cancel-footer'),
    publishConfirmSubmit: document.getElementById('publish-confirm-submit')
};

const escapeHtml = (value = '') =>
    String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

const formatDateTime = (isoDate) =>
    new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short'
    }).format(new Date(isoDate));

const buildPostReadyText = (option) =>
    [String(option?.caption || '').trim(), String(option?.cta || '').trim(), (option?.hashtags || []).join(' ').trim()]
        .filter(Boolean)
        .join('\n\n');

const formatGenerationModeLabel = (mode = 'short') => {
    const labels = {
        short: 'Curto',
        medium: 'Médio',
        premium: 'Premium'
    };

    return labels[mode] || mode;
};

const getDisplayFirstName = (name = '') => {
    const normalizedName = String(name || '').trim();

    if (!normalizedName) {
        return '';
    }

    return normalizedName.split(/\s+/)[0] || normalizedName;
};

const getUserInitial = (name = '', email = '') => {
    const firstName = getDisplayFirstName(name);
    const fallback = String(email || '').trim().charAt(0);
    return (firstName.charAt(0) || fallback || 'P').toUpperCase();
};

const renderSidebarIdentity = () => {
    if (!elements.sidebarUserAvatar || !elements.sidebarUserName || !elements.sidebarUserPlan) {
        return;
    }

    if (!state.user) {
        elements.sidebarUserAvatar.textContent = 'P';
        elements.sidebarUserName.textContent = 'Modo visitante';
        elements.sidebarUserPlan.textContent = 'Entrar';
        return;
    }

    const firstName = getDisplayFirstName(state.user.name) || 'Usuário';
    const planLabel = state.user.subscriptionPlan === 'premium' ? 'Premium' : 'Free';

    elements.sidebarUserAvatar.textContent = getUserInitial(state.user.name, state.user.email);
    elements.sidebarUserName.textContent = state.user.name || state.user.email || 'Usuário Postara';
    elements.sidebarUserPlan.textContent = `${firstName} · ${planLabel}`;
};

const getResultOptions = (result) => {
    if (!result) {
        return [];
    }

    if (Array.isArray(result.options) && result.options.length > 0) {
        return result.options.map((option) => ({
            ...option,
            description: option.description || buildPostReadyText(option)
        }));
    }

    return [
        {
            title: result.title || '',
            caption: result.caption || '',
            cta: result.cta || '',
            hashtags: Array.isArray(result.hashtags) ? result.hashtags : [],
            description: result.description || buildPostReadyText(result)
        }
    ];
};

const normalizeResultShape = (result) => {
    if (!result) {
        return null;
    }

    const options = getResultOptions(result);
    const safeIndex = Math.max(
        0,
        Math.min(Number.isInteger(result.selectedOptionIndex) ? result.selectedOptionIndex : 0, options.length - 1)
    );
    const selectedOption = options[safeIndex];

    return {
        ...result,
        ...selectedOption,
        options,
        selectedOptionIndex: safeIndex,
        optionCount: options.length,
        description: selectedOption.description || buildPostReadyText(selectedOption)
    };
};

const applySelectedOption = (result, selectedOptionIndex) => {
    const normalizedResult = normalizeResultShape(result);

    if (!normalizedResult) {
        return null;
    }

    const safeIndex = Math.max(0, Math.min(selectedOptionIndex, normalizedResult.options.length - 1));
    const selectedOption = normalizedResult.options[safeIndex];

    return {
        ...normalizedResult,
        ...selectedOption,
        selectedOptionIndex: safeIndex,
        optionCount: normalizedResult.options.length,
        description: selectedOption.description || buildPostReadyText(selectedOption)
    };
};

const getRequestedOptionCount = (forceSingle = false) => {
    if (state.user?.subscriptionPlan !== 'premium') {
        return 1;
    }

    return forceSingle ? 1 : 3;
};

const createRequestContextFromFormData = (formData) => ({
    productName: String(formData.get('productName') || '').trim(),
    productFeatures: String(formData.get('productFeatures') || '').trim() || undefined,
    targetAudience: String(formData.get('targetAudience') || '').trim() || undefined,
    tone: String(formData.get('tone') || '').trim() || undefined,
    generationMode: elements.generationModeSelect.value || 'short'
});

const createRequestContextFromHistoryRequest = (request = {}) => ({
    productName: String(request.productName || '').trim(),
    productFeatures: String(request.productFeatures || '').trim() || undefined,
    targetAudience: String(request.targetAudience || '').trim() || undefined,
    tone: String(request.tone || '').trim() || undefined,
    generationMode: request.requestedGenerationMode || request.appliedGenerationMode || 'short'
});

const getSelectedSocialConnection = () =>
    state.socialConnections.find((connection) => connection.id === state.publishDraft.connectionId) ||
    state.socialConnections[0] ||
    null;

const setGenerateFeedback = (status = 'idle', message = '') => {
    state.generateState.status = status;
    state.generateState.message = message;
};

const setPublishFeedback = (status = 'idle', message = '') => {
    state.publishState.status = status;
    state.publishState.message = message;
};

const getSelectedPublishTargets = (selectedConnection = getSelectedSocialConnection()) => {
    const targets = [];

    if (state.publishDraft.facebook && selectedConnection?.supportsFacebook) {
        targets.push('facebook');
    }

    if (state.publishDraft.instagram && selectedConnection?.supportsInstagram) {
        targets.push('instagram');
    }

    return targets;
};

const resetPublishMediaDraft = () => {
    state.publishDraft.mediaUrl = '';
    state.publishDraft.mediaFileName = '';
    state.publishDraft.mediaPreviewUrl = '';
    state.publishDraft.mediaUploadState = 'idle';
};

const getOnboardingProgress = () => ({
    login: Boolean(state.user),
    social: state.socialConnections.length > 0,
    generate: Boolean(state.currentResult)
});

const getFirstIncompleteOnboardingStepIndex = () => {
    const progress = getOnboardingProgress();
    return ONBOARDING_STEPS.findIndex((step) => !progress[step.id]);
};

const persistOnboardingStatus = () => {
    localStorage.setItem(STORAGE_KEYS.onboardingStatus, state.onboarding.status);
};

const clearOnboardingFocus = () => {
    [elements.authPanel, elements.socialPanel, elements.generatorPanel].forEach((panel) => {
        panel?.classList.remove('is-onboarding-focus');
    });
};

const closeOnboarding = (status = ONBOARDING_STATUS.completed) => {
    state.onboarding.status = status;
    state.onboarding.visible = false;
    persistOnboardingStatus();
    clearOnboardingFocus();
    document.body.classList.remove('onboarding-active');
    elements.onboardingLayer.hidden = true;
    elements.dashboardOnboardingPanel.hidden = true;
};

const ensurePublishDraftConnection = () => {
    const selectedConnection = getSelectedSocialConnection();

    if (!selectedConnection) {
        state.publishDraft = createInitialPublishDraft();
        return null;
    }

    state.publishDraft.connectionId = selectedConnection.id;

    if (!selectedConnection.supportsFacebook) {
        state.publishDraft.facebook = false;
    }

    if (!selectedConnection.supportsInstagram) {
        state.publishDraft.instagram = false;
    }

    if (!state.publishDraft.facebook && !state.publishDraft.instagram) {
        state.publishDraft.facebook = Boolean(selectedConnection.supportsFacebook);
        state.publishDraft.instagram = !state.publishDraft.facebook && Boolean(selectedConnection.supportsInstagram);
    }

    return selectedConnection;
};

const renderSocialConnections = () => {
    const isAuthenticated = Boolean(state.user);
    const hasConnections = state.socialConnections.length > 0;

    elements.connectMetaButton.disabled = !isAuthenticated;
    elements.connectMetaInstagramButton.disabled = !isAuthenticated;
    elements.refreshSocialButton.disabled = !isAuthenticated || !hasConnections;
    elements.debugMetaButton.disabled = !isAuthenticated;
    elements.disconnectMetaButton.disabled = !isAuthenticated || !hasConnections;

    if (!isAuthenticated) {
        elements.socialEmptyState.hidden = false;
        elements.socialEmptyState.textContent =
            'Faça login e conecte a Meta para liberar envio direto para Facebook e Instagram.';
        elements.socialConnectionsList.innerHTML = '';
        renderSocialDebug();
        syncOnboardingState();
        return;
    }

    if (!hasConnections) {
        elements.socialEmptyState.hidden = false;
        elements.socialEmptyState.textContent =
            'Nenhuma rede Meta conectada ainda. Use o botão acima para importar páginas do Facebook e contas profissionais do Instagram.';
        elements.socialConnectionsList.innerHTML = '';
        renderSocialDebug();
        syncOnboardingState();
        return;
    }

    elements.socialEmptyState.hidden = true;
    elements.socialConnectionsList.innerHTML = state.socialConnections
        .map(
            (connection) => `
                <article class="social-connection-card">
                    <div class="result-meta">
                        <span class="badge">Meta</span>
                        ${connection.supportsFacebook ? '<span class="badge badge-muted">Facebook ativo</span>' : ''}
                        ${connection.supportsInstagram ? '<span class="badge badge-muted">Instagram ativo</span>' : ''}
                    </div>
                    <h4 class="social-connection-title">${escapeHtml(connection.facebookPageName)}</h4>
                    <p class="social-connection-copy">
                        Página do Facebook pronta para receber posts.
                        ${
                            connection.instagramUsername
                                ? ` Instagram vinculado: @${escapeHtml(connection.instagramUsername)}.`
                                : ' Nenhum Instagram profissional vinculado nessa página.'
                        }
                    </p>
                </article>
            `
        )
        .join('');
    renderSocialDebug();
    syncOnboardingState();
};

const renderSocialDebug = () => {
    if (!state.socialDebug) {
        elements.socialDebugState.hidden = true;
        elements.socialDebugState.innerHTML = '';
        return;
    }

    console.log('Meta debug raw', state.socialDebug);

    const snapshots = Array.isArray(state.socialDebug.providerSnapshots) && state.socialDebug.providerSnapshots.length
        ? state.socialDebug.providerSnapshots
        : [state.socialDebug];

    const grantedPermissions = new Set(
        snapshots.flatMap((snapshot) =>
            Array.isArray(snapshot.grantedPermissions)
                ? snapshot.grantedPermissions
                      .filter((item) => item?.status === 'granted' && item?.permission)
                      .map((item) => item.permission)
                : []
        )
    );

    const allConnections = snapshots.flatMap((snapshot) =>
        Array.isArray(snapshot.normalizedConnections) ? snapshot.normalizedConnections : []
    );

    const allRawAccounts = snapshots.flatMap((snapshot) => (Array.isArray(snapshot.rawAccounts) ? snapshot.rawAccounts : []));

    const facebookConnection =
        allConnections.find((connection) => connection?.facebookPageId || connection?.facebookPageName) ||
        null;

    const instagramConnection =
        allConnections.find((connection) => connection?.instagramBusinessId || connection?.instagramUsername) || null;

    const fallbackInstagramAccount = allRawAccounts.find(
        (account) =>
            account?.instagramBusinessAccount?.username ||
            account?.connectedInstagramAccount?.username
    );

    const facebookPageName = facebookConnection?.facebookPageName || allRawAccounts[0]?.name || null;
    const instagramUsername =
        instagramConnection?.instagramUsername ||
        fallbackInstagramAccount?.instagramBusinessAccount?.username ||
        fallbackInstagramAccount?.connectedInstagramAccount?.username ||
        null;

    const requiredPermissions = [
        {
            key: 'pages_manage_posts',
            label: 'publicar no Facebook'
        },
        {
            key: 'instagram_content_publish',
            label: 'publicar no Instagram'
        }
    ];

    const missingPermission = requiredPermissions.find((permission) => !grantedPermissions.has(permission.key)) || null;
    const permissionsOk = !missingPermission;
    const facebookOk = Boolean(facebookConnection?.facebookPageId || facebookPageName);
    const instagramOk = Boolean(instagramConnection?.instagramBusinessId || instagramUsername);
    const everythingOk = facebookOk && instagramOk && permissionsOk;

    const cards = [
        {
            title: 'Facebook',
            status: facebookOk ? 'success' : 'error',
            icon: facebookOk ? '✅' : '❌',
            message: facebookOk
                ? `Página ${facebookPageName} pronta para publicar.`
                : 'Página do Facebook não encontrada. Conecte novamente a Meta e selecione a página correta.'
        },
        {
            title: 'Instagram',
            status: instagramOk ? 'success' : 'error',
            icon: instagramOk ? '✅' : '❌',
            message: instagramOk
                ? `Perfil @${instagramUsername} vinculado com sucesso.`
                : 'Instagram não encontrado. Verifique se a conta é profissional.'
        },
        {
            title: 'Permissões',
            status: permissionsOk ? 'success' : 'error',
            icon: permissionsOk ? '✅' : '❌',
            message: permissionsOk
                ? 'Permissões concedidas.'
                : `Permissão ausente: ${missingPermission.label}.`
        }
    ];

    elements.socialDebugState.hidden = false;
    elements.socialDebugState.innerHTML = `
        <div class="social-debug-summary">
            ${cards
                .map(
                    (card) => `
                        <article class="social-debug-card is-${card.status}">
                            <div class="social-debug-card-head">
                                <span class="social-debug-card-icon" aria-hidden="true">${card.icon}</span>
                                <strong>${escapeHtml(card.title)}</strong>
                            </div>
                            <p>${escapeHtml(card.message)}</p>
                        </article>
                    `
                )
                .join('')}
            <div class="social-debug-summary-note is-${everythingOk ? 'success' : 'error'}">
                ${
                    everythingOk
                        ? 'Tudo certo! Você pode publicar pelo Postara.'
                        : 'Algo precisa ser ajustado. Desconecte e conecte novamente a Meta.'
                }
            </div>
        </div>
    `;
};

const renderPublishResults = () => {
    if (!state.publishState.results.length) {
        return '';
    }

    return `
        <div class="publish-status-list">
            ${state.publishState.results
                .map(
                    (item) => `
                        <article class="publish-status-item is-${escapeHtml(item.status)}">
                            <strong>${escapeHtml(item.networkLabel)}</strong>
                            <p>${escapeHtml(item.message)}</p>
                        </article>
                    `
                )
                .join('')}
        </div>
    `;
};

const renderGenerateFeedback = () => {
    if (!elements.generateFeedback) {
        return;
    }

    if (state.generateState.status === 'idle' || !state.generateState.message) {
        elements.generateFeedback.hidden = true;
        elements.generateFeedback.innerHTML = '';
        return;
    }

    const labels = {
        loading: 'Carregando',
        success: 'Pronto',
        error: 'Algo deu errado'
    };

    const icons = {
        loading: '⏳',
        success: '✅',
        error: '❌'
    };

    elements.generateFeedback.hidden = false;
    elements.generateFeedback.className = `action-feedback is-${state.generateState.status}`;
    elements.generateFeedback.innerHTML = `
        <div class="action-feedback-head">
            <span class="action-feedback-icon">${icons[state.generateState.status] || '•'}</span>
            <strong>${labels[state.generateState.status] || 'Aviso'}</strong>
        </div>
        <p>${escapeHtml(state.generateState.message)}</p>
    `;
};

const renderPublishFeedback = () => {
    if (state.publishState.status === 'idle' || !state.publishState.message) {
        return '';
    }

    const labels = {
        loading: 'Enviando',
        success: 'Tudo certo',
        error: 'Algo deu errado'
    };

    const icons = {
        loading: '⏳',
        success: '✅',
        error: '❌'
    };

    return `
        <div class="action-feedback is-${escapeHtml(state.publishState.status)}">
            <div class="action-feedback-head">
                <span class="action-feedback-icon">${escapeHtml(icons[state.publishState.status] || '•')}</span>
                <strong>${escapeHtml(labels[state.publishState.status] || 'Aviso')}</strong>
            </div>
            <p>${escapeHtml(state.publishState.message)}</p>
        </div>
    `;
};

const buildPublishConfirmationMarkup = () => {
    if (!state.currentResult) {
        return '';
    }

    const selectedConnection = getSelectedSocialConnection();
    const selectedOption = state.currentResult;
    const targets = getSelectedPublishTargets(selectedConnection);
    const captionText = state.currentResult.description || buildPostReadyText(selectedOption);
    const hasImage = Boolean(state.publishDraft.mediaPreviewUrl);

    if (!selectedConnection || !targets.length) {
        return '';
    }

    const destinationLabel =
        targets.length === 2
            ? 'Facebook e Instagram'
            : targets[0] === 'instagram'
            ? 'Instagram'
            : 'Facebook';

    const buildNetworkPreviewCard = (network) => {
        const isInstagram = network === 'instagram';
        const networkLabel = isInstagram ? 'Instagram' : 'Facebook';
        const identity = isInstagram
            ? `@${selectedConnection.instagramUsername || 'sua_conta'}`
            : selectedConnection.facebookPageName;
        const imageMarkup = hasImage
            ? `<img class="publish-confirm-post-image" src="${escapeHtml(
                  state.publishDraft.mediaPreviewUrl
              )}" alt="Prévia da imagem escolhida para a postagem" />`
            : '';

        return `
            <article class="publish-confirm-network-card">
                <div class="publish-confirm-network-head">
                    <span class="badge badge-muted">${escapeHtml(networkLabel)}</span>
                    <span class="publish-confirm-network-id">${escapeHtml(identity)}</span>
                </div>
                <div class="publish-confirm-post-card">
                    <div class="publish-confirm-post-top">
                        <strong>${escapeHtml(identity)}</strong>
                        <span>${escapeHtml(selectedConnection.facebookPageName)}</span>
                    </div>
                    <p class="publish-confirm-post-text">${escapeHtml(captionText)}</p>
                    ${imageMarkup}
                </div>
            </article>
        `;
    };

    return `
        <div class="publish-confirm-summary">
            <span class="badge">Revisão antes de publicar</span>
            <h3>Confira como o post vai sair</h3>
            <p>
                Conta escolhida: <strong>${escapeHtml(selectedConnection.facebookPageName)}</strong> ·
                Destino: <strong>${escapeHtml(destinationLabel)}</strong>
            </p>
        </div>
        <div class="publish-confirm-meta">
            <span class="badge badge-muted">${escapeHtml(selectedOption.title)}</span>
            ${
                hasImage
                    ? '<span class="badge badge-muted">Com imagem</span>'
                    : '<span class="badge badge-muted">Somente texto</span>'
            }
        </div>
        <div class="publish-confirm-grid">
            ${targets.map((target) => buildNetworkPreviewCard(target)).join('')}
        </div>
    `;
};

const syncPublishConfirmation = () => {
    if (!elements.publishConfirmLayer || !elements.publishConfirmBody) {
        return;
    }

    elements.publishConfirmLayer.hidden = !state.publishState.confirmationOpen;

    if (!state.publishState.confirmationOpen) {
        elements.publishConfirmBody.innerHTML = '';
        return;
    }

    elements.publishConfirmBody.innerHTML = buildPublishConfirmationMarkup();
};

const closePublishConfirmation = () => {
    state.publishState.confirmationOpen = false;
    syncPublishConfirmation();
};

const openPublishConfirmation = () => {
    state.publishState.confirmationOpen = true;
    syncPublishConfirmation();
};

const buildPublishPanelMarkup = () => {
    if (!state.currentResult) {
        return '';
    }

    if (!state.user) {
        return `
            <div class="publish-panel">
                <h4>Publicar em redes sociais</h4>
                <div class="empty-state">Faça login e conecte suas redes sociais para publicar direto do app.</div>
            </div>
        `;
    }

    const selectedConnection = ensurePublishDraftConnection();

    if (!selectedConnection) {
        return `
            <div class="publish-panel">
                <h4>Publicar em redes sociais</h4>
                <div class="empty-state">Conecte Instagram e/ou Facebook na aba Conta para postar a descrição selecionada.</div>
            </div>
        `;
    }

    const canFacebook = Boolean(selectedConnection.supportsFacebook);
    const canInstagram = Boolean(selectedConnection.supportsInstagram);
    const instagramSelected = state.publishDraft.instagram && canInstagram;
    const publishDisabled =
        state.publishState.isLoading ||
        state.publishDraft.mediaUploadState === 'uploading' ||
        (!state.publishDraft.facebook && !instagramSelected) ||
        (instagramSelected && !state.publishDraft.mediaUrl.trim());

    return `
        <div class="publish-panel">
            <h4>Publicar em redes sociais</h4>
            <label class="field">
                <span>Conta conectada</span>
                <select data-publish-connection-select>
                    ${state.socialConnections
                        .map(
                            (connection) => `
                                <option value="${escapeHtml(connection.id)}" ${
                                    connection.id === selectedConnection.id ? 'selected' : ''
                                }>
                                    ${escapeHtml(connection.facebookPageName)}${
                                        connection.instagramUsername ? ` • @${escapeHtml(connection.instagramUsername)}` : ''
                                    }
                                </option>
                            `
                        )
                        .join('')}
                </select>
            </label>

            <div class="checkbox-row">
                <label class="checkbox-chip">
                    <input type="checkbox" data-publish-facebook ${state.publishDraft.facebook && canFacebook ? 'checked' : ''} ${
        canFacebook ? '' : 'disabled'
    } />
                    <span>Facebook</span>
                </label>
                <label class="checkbox-chip">
                    <input type="checkbox" data-publish-instagram ${instagramSelected ? 'checked' : ''} ${
        canInstagram ? '' : 'disabled'
    } />
                    <span>Instagram</span>
                </label>
            </div>

            <label class="field">
                <span>Imagem da postagem</span>
                <input
                    type="file"
                    accept="image/png,image/jpeg"
                    data-publish-media-file
                />
            </label>

            ${
                !state.publishDraft.mediaPreviewUrl && state.publishDraft.mediaUploadState !== 'uploading'
                    ? '<p class="hint">Escolha um arquivo JPG ou PNG. O upload começa automaticamente assim que você selecionar a imagem.</p>'
                    : ''
            }

            ${
                state.publishDraft.mediaUploadState === 'uploading'
                    ? '<p class="hint">Enviando imagem para o Postara...</p>'
                    : ''
            }

            ${
                state.publishDraft.mediaPreviewUrl
                    ? `
                        <div class="media-preview-card">
                            <img
                                class="media-preview-image"
                                src="${escapeHtml(state.publishDraft.mediaPreviewUrl)}"
                                alt="Prévia da imagem escolhida para a postagem"
                            />
                                        <div class="media-preview-copy">
                                            <strong>${escapeHtml(state.publishDraft.mediaFileName || 'Imagem pronta para publicar')}</strong>
                                            <p>
                                                ${escapeHtml(
                                                    state.publishDraft.mediaUploadState === 'uploaded'
                                                        ? 'Imagem preparada e enviada com sucesso. O Postara ajustou o formato para facilitar a publicação no Instagram.'
                                                        : 'Imagem selecionada para a publicação.'
                                                )}
                                            </p>
                                        </div>
                        </div>
                    `
                    : ''
            }

            <p class="hint">
                Se você enviar uma imagem, o Facebook publica foto + legenda. Para Instagram, o Postara usa essa mesma imagem junto com o texto pronto selecionado no preview.
            </p>

            ${
                !canInstagram
                    ? '<p class="hint">A imagem já pode ser enviada aqui. O botão do Instagram libera assim que a Meta devolver a conta profissional vinculada.</p>'
                    : ''
            }

            <button class="button button-primary" type="button" data-publish-selected ${publishDisabled ? 'disabled' : ''}>
                ${state.publishState.isLoading ? 'Postando...' : 'Revisar antes de publicar'}
            </button>

            ${renderPublishFeedback()}
            ${renderPublishResults()}
        </div>
    `;
};

const setToast = (message, type = 'success') => {
    elements.toast.textContent = message;
    elements.toast.className = `toast is-${type}`;
    elements.toast.hidden = false;

    window.clearTimeout(setToast.timeoutId);
    setToast.timeoutId = window.setTimeout(() => {
        elements.toast.hidden = true;
    }, 3500);
};

const getErrorMessage = (error, fallbackMessage = 'Não foi possível concluir a ação.') => {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        return error.message;
    }

    return fallbackMessage;
};

const ensureSupabaseClient = () => {
    if (supabaseClient) {
        return supabaseClient;
    }

    throw new Error('Supabase ainda não foi configurado no frontend.');
};

const getFileExtension = (fileName = '', mimeType = '') => {
    const fromName = String(fileName).split('.').pop();

    if (fromName && fromName !== fileName) {
        return fromName.toLowerCase();
    }

    if (mimeType === 'image/png') {
        return 'png';
    }

    return 'jpg';
};

const loadImageElementFromFile = (file) =>
    new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };

        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Não foi possível ler essa imagem.'));
        };

        image.src = objectUrl;
    });

const canvasToBlob = (canvas, type, quality) =>
    new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Não foi possível preparar essa imagem para publicação.'));
                return;
            }

            resolve(blob);
        }, type, quality);
    });

const prepareImageForSocial = async (file) => {
    const sourceImage = await loadImageElementFromFile(file);
    const minAspectRatio = 4 / 5;
    const maxAspectRatio = 1.91;
    const sourceAspectRatio = sourceImage.width / sourceImage.height;

    let sourceCropX = 0;
    let sourceCropY = 0;
    let sourceCropWidth = sourceImage.width;
    let sourceCropHeight = sourceImage.height;

    if (sourceAspectRatio > maxAspectRatio) {
        sourceCropWidth = Math.round(sourceImage.height * maxAspectRatio);
        sourceCropX = Math.round((sourceImage.width - sourceCropWidth) / 2);
    } else if (sourceAspectRatio < minAspectRatio) {
        sourceCropHeight = Math.round(sourceImage.width / minAspectRatio);
        sourceCropY = Math.round((sourceImage.height - sourceCropHeight) / 2);
    }

    const finalAspectRatio = sourceCropWidth / sourceCropHeight;
    const targetWidth = finalAspectRatio >= 1 ? 1080 : Math.round(1350 * finalAspectRatio);
    const targetHeight = finalAspectRatio >= 1 ? Math.round(1080 / finalAspectRatio) : 1350;
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext('2d');

    if (!context) {
        throw new Error('Seu navegador não conseguiu preparar a imagem para postagem.');
    }

    context.drawImage(
        sourceImage,
        sourceCropX,
        sourceCropY,
        sourceCropWidth,
        sourceCropHeight,
        0,
        0,
        targetWidth,
        targetHeight
    );

    const processedBlob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'postara-image';
    const processedFile = new File([processedBlob], `${baseName}-postara-instagram.jpg`, {
        type: 'image/jpeg'
    });

    return {
        file: processedFile,
        previewUrl: canvas.toDataURL('image/jpeg', 0.82)
    };
};

const uploadInstagramImage = async (file) => {
    if (!state.user) {
        throw new Error('Faça login antes de enviar uma imagem.');
    }

    if (!file) {
        throw new Error('Escolha uma imagem antes de continuar.');
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
        throw new Error('Use uma imagem JPG ou PNG.');
    }

    if (file.size > 15 * 1024 * 1024) {
        throw new Error('A imagem original precisa ter no máximo 15 MB.');
    }

    const client = ensureSupabaseClient();
    const preparedImage = await prepareImageForSocial(file);
    const extension = getFileExtension(preparedImage.file.name, preparedImage.file.type);
    const filePath = `${state.user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    state.publishDraft.mediaUploadState = 'uploading';
    state.publishDraft.mediaFileName = file.name;
    state.publishDraft.mediaPreviewUrl = preparedImage.previewUrl;
    state.publishDraft.mediaUrl = '';
    renderResult(state.currentResult, state.currentHistoryMeta);

    const { error } = await client.storage.from(POST_IMAGES_BUCKET).upload(filePath, preparedImage.file, {
        cacheControl: '3600',
        contentType: preparedImage.file.type,
        upsert: false
    });

    if (error) {
        resetPublishMediaDraft();
        throw error;
    }

    const {
        data: { publicUrl }
    } = client.storage.from(POST_IMAGES_BUCKET).getPublicUrl(filePath);

    state.publishDraft.mediaUrl = publicUrl;
    state.publishDraft.mediaPreviewUrl = publicUrl;
    state.publishDraft.mediaUploadState = 'uploaded';
};

const mapProfileToUser = (profile, authUser) => ({
    id: profile?.id || authUser.id,
    name: profile?.name || authUser.user_metadata?.name || undefined,
    email: profile?.email || authUser.email || '',
    subscriptionPlan: profile?.subscription_plan || 'free',
    createdAt: profile?.created_at || authUser.created_at || new Date().toISOString(),
    updatedAt: profile?.updated_at || profile?.created_at || new Date().toISOString()
});

const mapHistoryRow = (row) => ({
    id: row.id,
    createdAt: row.created_at,
    request: row.request_json,
    response: row.response_json
});

const renderDeploymentNotice = () => {
    elements.deploymentNotice.hidden = false;

    if (!hasSupabaseConfig) {
        elements.deploymentNotice.dataset.status = 'warning';
        elements.deploymentNotice.setAttribute('aria-label', 'Conexão parcial do app.');
        elements.deploymentNotice.dataset.tooltip = 'Conexão parcial do app.';
        return;
    }

    if (API_BASE_URL) {
        elements.deploymentNotice.dataset.status = 'success';
        elements.deploymentNotice.setAttribute('aria-label', 'App conectado e pronto para publicar.');
        elements.deploymentNotice.dataset.tooltip = 'App conectado e pronto para publicar.';
        return;
    }

    elements.deploymentNotice.dataset.status = 'success';
    elements.deploymentNotice.setAttribute('aria-label', 'App conectado e pronto para publicar.');
    elements.deploymentNotice.dataset.tooltip = 'App conectado e pronto para publicar.';
};

const apiRequest = async (path, options = {}) => {
    const requestUrl = API_BASE_URL ? `${API_BASE_URL}${path}` : path;
    const headers = {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
    };

    if (supabaseClient) {
        const {
            data: { session }
        } = await supabaseClient.auth.getSession();

        if (session?.access_token) {
            headers.Authorization = `Bearer ${session.access_token}`;
        }
    }

    const response = await fetch(requestUrl, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : null;

    if (!response.ok) {
        const message =
            payload?.error?.message ||
            (contentType.includes('application/json')
                ? 'A requisição falhou.'
                : 'A resposta da API não veio no formato esperado.');

        const error = new Error(message);
        error.payload = payload;
        throw error;
    }

    return payload;
};

const setLoading = (button, isLoading, loadingText) => {
    if (!button) {
        return;
    }

    if (!button.dataset.defaultLabel) {
        button.dataset.defaultLabel = button.textContent;
    }

    button.disabled = isLoading;
    button.textContent = isLoading ? loadingText : button.dataset.defaultLabel;
};

const renderView = () => {
    const config = VIEW_CONFIG[state.currentView] || VIEW_CONFIG.dashboard;

    elements.viewTitle.textContent = config.title;
    elements.viewDescription.textContent = config.description;

    elements.viewButtons.forEach((button) => {
        button.classList.toggle('is-active', button.dataset.viewTarget === state.currentView);
    });

    elements.views.forEach((view) => {
        const isActive = view.dataset.view === state.currentView;
        view.hidden = !isActive;
        view.classList.toggle('is-active', isActive);
    });
};

const setCurrentView = (view) => {
    if (!VIEW_CONFIG[view]) {
        return;
    }

    state.currentView = view;
    renderView();
};

const renderOnboardingPanel = () => {
    if (state.onboarding.status !== ONBOARDING_STATUS.pending) {
        elements.dashboardOnboardingPanel.hidden = true;
        return;
    }

    const progress = getOnboardingProgress();
    const firstIncompleteIndex = getFirstIncompleteOnboardingStepIndex();

    if (firstIncompleteIndex === -1) {
        closeOnboarding(ONBOARDING_STATUS.completed);
        return;
    }

    elements.dashboardOnboardingPanel.hidden = false;

    elements.onboardingStepCards.forEach((card) => {
        const stepId = card.dataset.onboardingStepCard;
        const isComplete = Boolean(progress[stepId]);
        const isCurrent = stepId === ONBOARDING_STEPS[firstIncompleteIndex]?.id;
        const statusLabel =
            stepId === 'login'
                ? elements.onboardingStepStatusLogin
                : stepId === 'social'
                  ? elements.onboardingStepStatusSocial
                  : elements.onboardingStepStatusGenerate;

        card.classList.toggle('is-complete', isComplete);
        card.classList.toggle('is-current', isCurrent);

        if (statusLabel) {
            statusLabel.textContent = isComplete ? 'Concluído' : isCurrent ? 'Agora' : 'Pendente';
        }
    });

    elements.startOnboardingButton.textContent = state.onboarding.visible
        ? 'Continuar tutorial'
        : firstIncompleteIndex > 0
          ? 'Continuar passo a passo'
          : 'Começar passo a passo';
};

const renderOnboardingCoachmark = () => {
    if (state.onboarding.status !== ONBOARDING_STATUS.pending || !state.onboarding.visible) {
        elements.onboardingLayer.hidden = true;
        document.body.classList.remove('onboarding-active');
        clearOnboardingFocus();
        return;
    }

    const step = ONBOARDING_STEPS[state.onboarding.activeStepIndex];
    const progress = getOnboardingProgress();
    const isCurrentStepDone = Boolean(progress[step.id]);
    const isLastStep = state.onboarding.activeStepIndex === ONBOARDING_STEPS.length - 1;

    elements.onboardingProgressLabel.textContent = `Passo ${state.onboarding.activeStepIndex + 1} de ${ONBOARDING_STEPS.length}`;
    elements.onboardingCardTitle.textContent = step.title;
    elements.onboardingCardDescription.textContent = isCurrentStepDone
        ? `${step.description} Esse passo já está ok por aqui.`
        : step.description;
    elements.onboardingCardTip.textContent = step.tip;
    elements.onboardingPrevButton.hidden = state.onboarding.activeStepIndex === 0;
    elements.onboardingNextButton.textContent = isLastStep ? 'Concluir tutorial' : 'Próximo passo';
    elements.onboardingLayer.hidden = false;
    document.body.classList.add('onboarding-active');
};

const syncOnboardingStepView = () => {
    if (state.onboarding.status !== ONBOARDING_STATUS.pending || !state.onboarding.visible) {
        return;
    }

    const step = ONBOARDING_STEPS[state.onboarding.activeStepIndex];

    if (!step) {
        return;
    }

    if (state.currentView !== step.view) {
        setCurrentView(step.view);
    }

    clearOnboardingFocus();

    const target = elements[step.targetKey];

    if (target) {
        target.classList.add('is-onboarding-focus');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    renderOnboardingPanel();
    renderOnboardingCoachmark();
};

const startOnboarding = (stepIndex = null) => {
    if (state.onboarding.status !== ONBOARDING_STATUS.pending) {
        return;
    }

    const firstIncompleteIndex = getFirstIncompleteOnboardingStepIndex();

    if (firstIncompleteIndex === -1) {
        closeOnboarding(ONBOARDING_STATUS.completed);
        return;
    }

    state.onboarding.visible = true;
    state.onboarding.activeStepIndex =
        typeof stepIndex === 'number'
            ? Math.max(0, Math.min(stepIndex, ONBOARDING_STEPS.length - 1))
            : firstIncompleteIndex;

    syncOnboardingStepView();
};

const syncOnboardingState = () => {
    if (state.onboarding.status !== ONBOARDING_STATUS.pending) {
        elements.dashboardOnboardingPanel.hidden = true;
        elements.onboardingLayer.hidden = true;
        clearOnboardingFocus();
        return;
    }

    const firstIncompleteIndex = getFirstIncompleteOnboardingStepIndex();

    if (firstIncompleteIndex === -1) {
        closeOnboarding(ONBOARDING_STATUS.completed);
        return;
    }

    renderOnboardingPanel();

    if (state.onboarding.visible) {
        syncOnboardingStepView();
        return;
    }

    renderOnboardingCoachmark();
};

const renderInstagramHelper = () => {
    const isProMode = state.instagramHelpMode === 'pro';

    elements.instagramHelpProButton.classList.toggle('button-primary', isProMode);
    elements.instagramHelpProButton.classList.toggle('button-ghost', !isProMode);
    elements.instagramHelpUnsureButton.classList.toggle('button-primary', !isProMode);
    elements.instagramHelpUnsureButton.classList.toggle('button-ghost', isProMode);
    elements.instagramHelpProButton.setAttribute('aria-pressed', String(isProMode));
    elements.instagramHelpUnsureButton.setAttribute('aria-pressed', String(!isProMode));

    elements.instagramHelpViewPro.hidden = !isProMode;
    elements.instagramHelpViewUnsure.hidden = isProMode;
    elements.instagramHelpViewPro.classList.toggle('is-active', isProMode);
    elements.instagramHelpViewUnsure.classList.toggle('is-active', !isProMode);
};

const openFeaturesHelpPopover = () => {
    if (!elements.featuresHelpPopover || !elements.featuresHelpTrigger) {
        return;
    }

    elements.featuresHelpPopover.hidden = false;
    elements.featuresHelpTrigger.setAttribute('aria-expanded', 'true');
};

const closeFeaturesHelpPopover = () => {
    if (!elements.featuresHelpPopover || !elements.featuresHelpTrigger) {
        return;
    }

    elements.featuresHelpPopover.hidden = true;
    elements.featuresHelpTrigger.setAttribute('aria-expanded', 'false');
};

const toggleFeaturesHelpPopover = () => {
    if (!elements.featuresHelpPopover) {
        return;
    }

    if (elements.featuresHelpPopover.hidden) {
        openFeaturesHelpPopover();
        return;
    }

    closeFeaturesHelpPopover();
};

const showGenerationModeLockHint = () => {
    if (!elements.generationModeLockHint) {
        return;
    }

    elements.generationModeLockHint.hidden = false;
};

const hideGenerationModeLockHint = () => {
    if (!elements.generationModeLockHint) {
        return;
    }

    elements.generationModeLockHint.hidden = true;
};

// Mantemos a UI consistente com o plano do usuário para evitar pedir algo que o backend vai negar ou ajustar.
const applyPlanToModeSelector = () => {
    const plan = state.user?.subscriptionPlan || 'free';
    const isPremium = plan === 'premium';
    const selectedValue = elements.generationModeSelect.value;

    [...elements.generationModeSelect.options].forEach((option) => {
        option.disabled = !isPremium && option.value !== 'short';
        option.textContent = option.value === 'short'
            ? 'Curto'
            : !isPremium
                ? `🔒 ${option.value === 'medium' ? 'Médio' : 'Premium'}`
                : option.value === 'medium'
                    ? 'Médio'
                    : 'Premium';
    });

    if (elements.generationModeLockOptionsWrap) {
        elements.generationModeLockOptionsWrap.hidden = isPremium;
    }

    elements.generationModeLockOptions.forEach((button) => {
        button.setAttribute('aria-disabled', String(isPremium));
        button.hidden = isPremium;
    });

    if (!isPremium) {
        elements.generationModeSelect.value = 'short';
        elements.generationModeHint.textContent =
            'No plano gratuito, o Postara gera textos curtos para você começar sem complicação.';
    } else if (!['short', 'medium', 'premium'].includes(selectedValue)) {
        elements.generationModeSelect.value = 'premium';
        elements.generationModeHint.textContent =
            'No premium, você escolhe entre curto, médio e premium conforme a profundidade que quiser no texto.';
    } else {
        elements.generationModeHint.textContent =
            'No premium, você escolhe entre curto, médio e premium conforme a profundidade que quiser no texto.';
    }

    if (!isPremium) {
        elements.generationPlanCallout.hidden = false;
        elements.generationPlanBadge.textContent = state.user ? 'Plano gratuito' : 'Modo gratuito';
        elements.generationPlanTitle.textContent = state.user
            ? 'Você está no plano gratuito — gera textos curtos.'
            : 'Você está no modo gratuito — gera textos curtos.';
        elements.generationPlanText.textContent = state.user
            ? 'Quer textos mais completos? Assine por R$19,90/mês.'
            : 'Quer textos mais completos e salvar seu histórico? Entre na conta e assine por R$19,90/mês.';
        elements.generationUpgradeButton.textContent = state.user ? 'Ver plano premium' : 'Entrar e ver planos';
    } else {
        elements.generationPlanCallout.hidden = true;
        hideGenerationModeLockHint();
    }
};

const renderDashboard = () => {
    if (!state.user) {
        elements.dashboardGreeting.textContent = 'Olá! Por onde começar?';
    } else {
        const firstName = getDisplayFirstName(state.user.name);
        elements.dashboardGreeting.textContent = firstName
            ? `Olá, ${firstName}! Por onde você quer começar?`
            : 'Olá! Por onde começar?';
    }

    elements.dashboardSubtitle.textContent =
        'Gere um post, reveja seu histórico ou conecte suas redes.';

    if (!state.user) {
        elements.dashboardProgressNote.hidden = true;
        elements.dashboardProgressNote.textContent = '';
    } else if (state.history.total > 0) {
        elements.dashboardProgressNote.hidden = false;
        elements.dashboardProgressNote.textContent = `🎉 Você já gerou ${state.history.total} post(s) pelo Postara!`;
    } else {
        elements.dashboardProgressNote.hidden = false;
        elements.dashboardProgressNote.textContent = '👋 Gere seu primeiro post agora e veja o resultado aqui.';
    }

    if (!state.user) {
        elements.dashboardAuthStatus.textContent = 'Você ainda não está logado.';
        elements.dashboardPlanStatus.textContent =
            'Faça login para salvar histórico e desbloquear o fluxo premium.';
    } else {
        const planLabel = state.user.subscriptionPlan === 'premium' ? 'Premium' : 'Free';
        elements.dashboardAuthStatus.textContent = `${state.user.name || 'Usuário Postara'} conectado(a).`;
        elements.dashboardPlanStatus.textContent = state.socialConnections.length
            ? `Facebook e Instagram vinculados e prontos para publicar. Plano atual: ${planLabel}.`
            : `Plano atual: ${planLabel}. Conecte suas redes para publicar direto pelo app.`;
    }

    if (!state.user) {
        elements.dashboardHistoryStatus.textContent = 'Seu histórico está bloqueado até o login.';
    } else if (state.history.total === 0) {
        elements.dashboardHistoryStatus.textContent = 'Nenhuma geração salva ainda para esta conta.';
    } else {
        elements.dashboardHistoryStatus.textContent = `${state.history.total} geração(ões) salvas.`;
    }

    if (!state.currentResult) {
        elements.dashboardResultStatus.textContent = 'Nenhum conteúdo gerado ainda.';
    } else {
        elements.dashboardResultStatus.textContent = `Último: ${state.currentResult.title}`;
    }

    syncOnboardingState();
};

const getResultMarkup = (result, meta = null, options = {}) => {
    const { showMeta = true } = options;

    if (!result) {
        return `
            <div class="empty-state">
                Gere um post ou abra de novo um item do histórico para ver título, legenda, CTA, hashtags e detalhes do conteúdo.
            </div>
        `;
    }

    const normalizedResult = normalizeResultShape(result);
    const selectedOption = normalizedResult.options[normalizedResult.selectedOptionIndex];
    const orderedOptions = normalizedResult.options
        .map((option, index) => ({
            ...option,
            originalIndex: index,
            isSelected: index === normalizedResult.selectedOptionIndex
        }))
        .sort((left, right) => Number(right.isSelected) - Number(left.isSelected) || left.originalIndex - right.originalIndex);
    const badges = [
        `Plano ${normalizedResult.subscriptionPlan}`,
        `Modo ${normalizedResult.generationMode}`,
        `${normalizedResult.source} • ${normalizedResult.model}`,
        normalizedResult.fallbackUsed ? 'Fallback ativo' : 'Primário ativo'
    ];

    if (normalizedResult.modeAdjusted) {
        badges.push('Modo ajustado pela regra do plano');
    }

    if (meta?.historyId) {
        badges.push(`Histórico ${meta.historyId.slice(0, 8)}`);
    }

    const isLoadingResultAction = state.resultActionState.isLoading;
    const hasMultipleOptions = normalizedResult.options.length > 1;

    return `
        <article class="result-view">
            ${
                showMeta
                    ? `
                        <div class="result-meta">
                            ${badges
                                .map((badge) => `<span class="badge badge-muted">${escapeHtml(badge)}</span>`)
                                .join('')}
                        </div>
                    `
                    : ''
            }
            ${
                hasMultipleOptions
                    ? `
                        <div class="result-block">
                            <h4>Opções criadas pela IA</h4>
                            <div class="option-grid">
                                ${orderedOptions
                                    .map(
                                        (option) => `
                                            <article class="option-card ${
                                                option.isSelected ? 'is-active' : 'is-dimmed'
                                            }" ${option.isSelected ? 'data-selected-option-card="true"' : ''}>
                                                <div class="option-card-head">
                                                    <span class="badge ${
                                                        option.isSelected ? '' : 'badge-muted'
                                                    }">Opção ${option.originalIndex + 1}</span>
                                                    ${
                                                        option.isSelected
                                                            ? '<span class="option-selected-badge">✓ Selecionada</span>'
                                                            : ''
                                                    }
                                                </div>
                                                <h5>${escapeHtml(option.title)}</h5>
                                                <p>${escapeHtml(option.caption.slice(0, 150))}${
                                                    option.caption.length > 150 ? '…' : ''
                                                }</p>
                                                <div class="option-card-actions">
                                                    <button
                                                        class="button ${option.isSelected ? '' : 'button-ghost'}"
                                                        type="button"
                                                        data-option-select="${option.originalIndex}"
                                                        ${isLoadingResultAction ? 'disabled' : ''}
                                                    >
                                                        ${option.isSelected ? 'Em uso' : 'Usar opção'}
                                                    </button>
                                                    <button
                                                        class="button button-ghost"
                                                        type="button"
                                                        data-option-regenerate="${option.originalIndex}"
                                                        ${isLoadingResultAction ? 'disabled' : ''}
                                                    >
                                                        Refazer esta
                                                    </button>
                                                </div>
                                            </article>
                                        `
                                    )
                                    .join('')}
                            </div>
                            <div class="result-actions">
                                <button
                                    class="button button-ghost"
                                    type="button"
                                    data-options-regenerate-all="true"
                                    ${isLoadingResultAction ? 'disabled' : ''}
                                >
                                    Refazer as 3 opções
                                </button>
                            </div>
                        </div>
                    `
                    : ''
            }
            <h3>${escapeHtml(selectedOption.title)}</h3>
            <div class="result-block">
                <h4>Legenda</h4>
                <p>${escapeHtml(selectedOption.caption)}</p>
            </div>
            <div class="result-block">
                <h4>CTA</h4>
                <p>${escapeHtml(selectedOption.cta)}</p>
            </div>
            <div class="result-block">
                <h4>Hashtags</h4>
                <div class="tag-list">
                    ${selectedOption.hashtags
                        .map((hashtag) => `<span class="tag">${escapeHtml(hashtag)}</span>`)
                        .join('')}
                </div>
            </div>
            <div class="result-block">
                <h4>Texto pronto para postar</h4>
                <pre>${escapeHtml(selectedOption.description || buildPostReadyText(selectedOption))}</pre>
            </div>
            ${buildPublishPanelMarkup()}
        </article>
    `;
};

const getLiveGeneratorRequestContext = () => {
    if (!elements.generatorForm) {
        return {
            productName: '',
            productFeatures: undefined,
            targetAudience: undefined,
            tone: undefined,
            generationMode: 'short'
        };
    }

    return createRequestContextFromFormData(new FormData(elements.generatorForm));
};

const renderGeneratorPhotoTip = () => {
    if (!elements.generationPhotoTip) {
        return;
    }

    const draft = getLiveGeneratorRequestContext();
    const hasProductContext = Boolean(
        draft.productName || draft.productFeatures || draft.targetAudience || draft.tone
    );

    elements.generationPhotoTip.hidden = !hasProductContext;
};

const getGenerateDraftPreviewMarkup = () => {
    const draft = getLiveGeneratorRequestContext();
    const hasContent = Boolean(
        draft.productName || draft.productFeatures || draft.targetAudience || draft.tone
    );

    if (!hasContent) {
        return '';
    }

    const detailItems = [
        draft.productFeatures
            ? `
                <div class="draft-preview-item">
                    <span class="draft-preview-label">Características e especificações</span>
                    <p class="draft-preview-value">${escapeHtml(draft.productFeatures)}</p>
                </div>
            `
            : '',
        draft.targetAudience
            ? `
                <div class="draft-preview-item">
                    <span class="draft-preview-label">Público-alvo</span>
                    <p class="draft-preview-value">${escapeHtml(draft.targetAudience)}</p>
                </div>
            `
            : '',
        draft.tone
            ? `
                <div class="draft-preview-item">
                    <span class="draft-preview-label">Tom escolhido</span>
                    <p class="draft-preview-value">${escapeHtml(draft.tone)}</p>
                </div>
            `
            : '',
        `
            <div class="draft-preview-item">
                <span class="draft-preview-label">Modo de geração</span>
                <p class="draft-preview-value">${escapeHtml(formatGenerationModeLabel(draft.generationMode))}</p>
            </div>
        `
    ]
        .filter(Boolean)
        .join('');

    return `
        <article class="draft-preview-card">
            <div class="draft-preview-head">
                <span class="badge badge-muted">O que você informou</span>
            </div>
            ${
                draft.productName
                    ? `
                        <div class="draft-preview-hero">
                            <h4>${escapeHtml(draft.productName)}</h4>
                        </div>
                    `
                    : ''
            }
            <div class="draft-preview-grid">
                ${detailItems}
            </div>
        </article>
    `;
};

const getGeneratePreviewMarkup = (result, meta = null) => {
    const draftMarkup = getGenerateDraftPreviewMarkup();
    const resultMarkup = result
        ? `
            <div class="result-preview-divider"></div>
            ${getResultMarkup(result, meta, { showMeta: false })}
        `
        : '';

    if (!draftMarkup && !resultMarkup) {
        return `
            <div class="empty-state">
                Escreva sobre o seu produto e a prévia mostra aqui só o que você informou. Quando você clicar em gerar, o texto criado pela IA aparece abaixo.
            </div>
        `;
    }

    return `
        <div class="generate-preview-stack">
            ${draftMarkup}
            ${resultMarkup}
        </div>
    `;
};

// Renderizamos a mesma resposta em slots diferentes para reaproveitar o preview nas áreas de geração e histórico.
const renderResult = (result, meta = null) => {
    state.currentResult = normalizeResultShape(result);
    state.currentHistoryMeta = meta;

    elements.resultSlots.forEach((slot) => {
        const slotType = slot.dataset.resultSlot;
        slot.innerHTML =
            slotType === 'generate'
                ? getGeneratePreviewMarkup(state.currentResult, meta)
                : getResultMarkup(state.currentResult, meta);
    });

    renderDashboard();
    syncPublishConfirmation();
    renderGenerateFeedback();
    renderGeneratorPhotoTip();
};

const renderAuthView = () => {
    const isAuthenticated = Boolean(state.user);

    elements.guestAuthView.hidden = isAuthenticated;
    elements.memberAuthView.hidden = !isAuthenticated;

    if (!isAuthenticated) {
        const showingLogin = state.currentAuthTab === 'login';
        elements.showLoginTab.classList.toggle('is-active', showingLogin);
        elements.showRegisterTab.classList.toggle('is-active', !showingLogin);
        elements.loginForm.hidden = !showingLogin;
        elements.registerForm.hidden = showingLogin;
        elements.googleLoginButton.hidden = !showingLogin;
        elements.googleRegisterButton.hidden = showingLogin;
        elements.googleRegisterDivider.hidden = showingLogin;
        elements.accountNavSummary.textContent = 'Entrar e gerenciar plano';
        renderSidebarIdentity();
        applyPlanToModeSelector();
        renderSocialConnections();
        renderDashboard();
        return;
    }

    elements.memberName.textContent = state.user.name || 'Usuário Postara';
    elements.memberEmail.textContent = state.user.email;
    elements.memberPlanBadge.textContent = state.user.subscriptionPlan === 'premium' ? 'Premium' : 'Free';
    elements.memberIdBadge.textContent = `ID ${state.user.id.slice(0, 8)}`;
    elements.memberAvatar.textContent = getUserInitial(state.user.name, state.user.email);
    elements.accountNavSummary.textContent = `${getDisplayFirstName(state.user.name) || state.user.email} · ${
        state.user.subscriptionPlan === 'premium' ? 'Premium' : 'Free'
    }`;
    elements.profileNameInput.value = state.user.name || '';
    elements.subscriptionToggleButton.textContent =
        state.user.subscriptionPlan === 'premium' ? 'Voltar para Free' : 'Ir para Premium';

    renderSidebarIdentity();
    applyPlanToModeSelector();
    renderSocialConnections();
    renderDashboard();
};

const renderHistory = () => {
    const isAuthenticated = Boolean(state.user);

    elements.historyLockedState.hidden = isAuthenticated;
    elements.historyContent.hidden = !isAuthenticated;

    if (!isAuthenticated) {
        elements.historyList.innerHTML = '';
        renderDashboard();
        return;
    }

    if (state.history.entries.length === 0) {
        elements.historyList.innerHTML =
            '<div class="empty-state">Nenhuma geração salva para este usuário ainda.</div>';
    } else {
        elements.historyList.innerHTML = state.history.entries
            .map((entry) => {
                const preview = entry.response.caption.slice(0, 140).trim();

                return `
                    <article class="history-item">
                        <div class="result-meta">
                            <span class="badge badge-muted">${escapeHtml(formatDateTime(entry.createdAt))}</span>
                            <span class="badge badge-muted">${escapeHtml(entry.response.generationMode)}</span>
                            <span class="badge badge-muted">${escapeHtml(entry.response.source)}</span>
                        </div>
                        <h3>${escapeHtml(entry.response.title)}</h3>
                        <p>${escapeHtml(preview)}${entry.response.caption.length > 140 ? '…' : ''}</p>
                        <div class="history-item-actions">
                            <button class="button button-ghost" type="button" data-history-open="${escapeHtml(entry.id)}">
                                Abrir de novo
                            </button>
                        </div>
                    </article>
                `;
            })
            .join('');
    }

    elements.historyPaginationLabel.textContent = `Página ${state.history.page} • ${state.history.total} itens`;
    elements.historyPrevButton.disabled = state.history.page <= 1;
    elements.historyNextButton.disabled = !state.history.hasNextPage;
    renderDashboard();
};

const syncHistoryLimit = () => {
    elements.historyLimitSelect.value = String(state.history.limit);
};

const updateAuthenticatedState = (user) => {
    state.user = user;

    if (!user) {
        state.socialDebug = null;
    }

    renderAuthView();
    renderHistory();
    renderSocialConnections();
};

const resetHistoryState = () => {
    state.history = {
        entries: [],
        page: 1,
        limit: Number(elements.historyLimitSelect.value || 5),
        total: 0,
        hasNextPage: false
    };
    renderHistory();
};

const fetchCurrentUserProfile = async () => {
    const client = ensureSupabaseClient();
    const {
        data: { session },
        error: sessionError
    } = await client.auth.getSession();

    if (sessionError) {
        throw sessionError;
    }

    if (!session?.user) {
        return null;
    }

    const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('id, name, email, subscription_plan, created_at, updated_at')
        .eq('id', session.user.id)
        .maybeSingle();

    if (profileError) {
        throw profileError;
    }

    return mapProfileToUser(profile, session.user);
};

const loadCurrentUser = async () => {
    if (!supabaseClient) {
        updateAuthenticatedState(null);
        return;
    }

    try {
        const user = await fetchCurrentUserProfile();
        updateAuthenticatedState(user);
    } catch (error) {
        updateAuthenticatedState(null);
        setToast(getErrorMessage(error, 'Não foi possível carregar o perfil atual.'), 'error');
    }
};

const loadSocialConnections = async () => {
    if (!state.user) {
        state.socialConnections = [];
        state.publishDraft = createInitialPublishDraft();
        state.publishState.results = [];
        renderSocialConnections();

        if (state.currentResult) {
            renderResult(state.currentResult, state.currentHistoryMeta);
        }
        return;
    }

    const payload = await apiRequest('/api/social/connections');
    state.socialConnections = Array.isArray(payload.data)
        ? payload.data.map((connection) => ({
              id: connection.id,
              provider: connection.provider,
              facebookPageId: connection.facebook_page_id,
              facebookPageName: connection.facebook_page_name,
              instagramBusinessId: connection.instagram_business_id,
              instagramUsername: connection.instagram_username,
              supportsFacebook: Boolean(connection.supports_facebook),
              supportsInstagram: Boolean(connection.supports_instagram)
          }))
        : [];

    ensurePublishDraftConnection();
    renderSocialConnections();

    if (state.currentResult) {
        renderResult(state.currentResult, state.currentHistoryMeta);
    }
};

const tryLoadSocialConnections = async (showErrorToast = false) => {
    try {
        await loadSocialConnections();
    } catch (error) {
        state.socialConnections = [];
        renderSocialConnections();

        if (state.currentResult) {
            renderResult(state.currentResult, state.currentHistoryMeta);
        }

        if (showErrorToast) {
            setToast(getErrorMessage(error, 'Não foi possível carregar as redes sociais.'), 'error');
        }
    }
};

const loadHistoryPage = async (page = 1) => {
    if (!state.user) {
        resetHistoryState();
        return;
    }

    const client = ensureSupabaseClient();
    const from = (page - 1) * state.history.limit;
    const to = from + state.history.limit - 1;

    const { data, count, error } = await client
        .from('generation_history')
        .select('id, created_at, request_json, response_json', { count: 'exact' })
        .eq('user_id', state.user.id)
        .order('created_at', { ascending: false })
        .range(from, to);

    if (error) {
        throw error;
    }

    state.history.entries = (data || []).map((row) => mapHistoryRow(row));
    state.history.total = count || 0;
    state.history.page = page;
    state.history.hasNextPage = to + 1 < state.history.total;
    renderHistory();
};

const handleLoginSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    try {
        const client = ensureSupabaseClient();
        setLoading(event.currentTarget.querySelector('button[type="submit"]'), true, 'Entrando...');

        const { error } = await client.auth.signInWithPassword({
            email: String(formData.get('email') || ''),
            password: String(formData.get('password') || '')
        });

        if (error) {
            throw error;
        }

        await loadCurrentUser();
        await tryLoadSocialConnections(true);
        await loadHistoryPage(1);
        setCurrentView('generate');
        event.currentTarget.reset();
        setToast('Login realizado com sucesso.');
    } catch (error) {
        setToast(getErrorMessage(error, 'Não foi possível entrar agora.'), 'error');
    } finally {
        setLoading(event.currentTarget.querySelector('button[type="submit"]'), false);
    }
};

const handleRegisterSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    try {
        const client = ensureSupabaseClient();
        setLoading(event.currentTarget.querySelector('button[type="submit"]'), true, 'Criando...');

        const name = String(formData.get('name') || '').trim();
        const { data, error } = await client.auth.signUp({
            email: String(formData.get('email') || ''),
            password: String(formData.get('password') || ''),
            options: {
                emailRedirectTo: window.location.origin,
                data: {
                    name
                }
            }
        });

        if (error) {
            throw error;
        }

        event.currentTarget.reset();

        if (data.session?.user) {
            await loadCurrentUser();
            await tryLoadSocialConnections(true);
            await loadHistoryPage(1);
            setCurrentView('generate');
            setToast('Conta criada com sucesso.');
            return;
        }

        setCurrentView('account');
        setToast('Conta criada. Agora confirme seu e-mail para liberar o login.');
    } catch (error) {
        setToast(getErrorMessage(error, 'Não foi possível criar a conta agora.'), 'error');
    } finally {
        setLoading(event.currentTarget.querySelector('button[type="submit"]'), false);
    }
};

const handleGoogleAuth = async () => {
    try {
        const client = ensureSupabaseClient();

        setLoading(elements.googleLoginButton, true, 'Redirecionando...');
        setLoading(elements.googleRegisterButton, true, 'Redirecionando...');

        const { error } = await client.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });

        if (error) {
            throw error;
        }
    } catch (error) {
        setToast(getErrorMessage(error, 'Não foi possível iniciar o login com Google.'), 'error');
        setLoading(elements.googleLoginButton, false);
        setLoading(elements.googleRegisterButton, false);
    }
};

const handleMetaConnect = async (target = 'facebook') => {
    const isInstagram = target === 'instagram';
    const trigger = isInstagram ? elements.connectMetaInstagramButton : elements.connectMetaButton;

    try {
        setLoading(trigger, true, 'Conectando...');
        const payload = await apiRequest(`/api/social/meta/connect?target=${encodeURIComponent(target)}`, {
            method: 'POST'
        });

        if (!payload?.data?.authorizationUrl) {
            throw new Error('A URL de autorização da Meta não foi retornada.');
        }

        window.location.href = payload.data.authorizationUrl;
    } catch (error) {
        setToast(getErrorMessage(error, 'Não foi possível iniciar a conexão com a Meta.'), 'error');
        setLoading(trigger, false);
    }
};

const handleRefreshSocialConnections = async () => {
    try {
        setLoading(elements.refreshSocialButton, true, 'Atualizando...');
        await apiRequest('/api/social/connections/refresh', {
            method: 'POST'
        });
        await loadSocialConnections();
        setToast('Redes sociais atualizadas com sucesso.');
    } catch (error) {
        setToast(getErrorMessage(error, 'Não foi possível atualizar as redes conectadas.'), 'error');
    } finally {
        setLoading(elements.refreshSocialButton, false);
    }
};

const handleMetaDebug = async () => {
    try {
        setLoading(elements.debugMetaButton, true, 'Lendo...');
        const payload = await apiRequest('/api/social/meta/debug', {
            method: 'GET'
        });
        state.socialDebug = payload?.data || null;
        renderSocialConnections();
        setToast('Teste de conexão atualizado.');
    } catch (error) {
        state.socialDebug = null;
        renderSocialConnections();
        setToast(getErrorMessage(error, 'Não foi possível gerar o diagnóstico da Meta.'), 'error');
    } finally {
        setLoading(elements.debugMetaButton, false);
    }
};

const handleDisconnectMeta = async () => {
    try {
        setLoading(elements.disconnectMetaButton, true, 'Desconectando...');
        await apiRequest('/api/social/connections?provider=meta', {
            method: 'DELETE'
        });
        state.socialConnections = [];
        state.socialDebug = null;
        state.publishDraft = createInitialPublishDraft();
        renderSocialConnections();

        if (state.currentResult) {
            renderResult(state.currentResult, state.currentHistoryMeta);
        }

        setToast('Conexão Meta removida.');
    } catch (error) {
        setToast(getErrorMessage(error, 'Não foi possível desconectar a Meta.'), 'error');
    } finally {
        setLoading(elements.disconnectMetaButton, false);
    }
};

const handleLogout = async () => {
    try {
        const client = ensureSupabaseClient();
        setLoading(elements.logoutButton, true, 'Saindo...');

        const { error } = await client.auth.signOut();

        if (error) {
            throw error;
        }

        updateAuthenticatedState(null);
        state.currentRequestContext = null;
        state.socialConnections = [];
        state.publishState.results = [];
        state.publishState.confirmationOpen = false;
        setPublishFeedback('idle', '');
        setGenerateFeedback('idle', '');
        state.publishDraft = createInitialPublishDraft();
        resetHistoryState();
        renderResult(null);
        setCurrentView('dashboard');
        setToast('Sessão encerrada.');
    } catch (error) {
        setToast(getErrorMessage(error, 'Não foi possível sair agora.'), 'error');
    } finally {
        setLoading(elements.logoutButton, false);
    }
};

const handlePublishSelected = async () => {
    if (!state.currentResult) {
        setPublishFeedback('error', 'Gere um conteúdo ou abra um salvo antes de publicar.');
        renderResult(state.currentResult, state.currentHistoryMeta);
        setToast('Gere um conteúdo ou abra um salvo antes de publicar.', 'error');
        return;
    }

    const selectedConnection = ensurePublishDraftConnection();

    if (!selectedConnection) {
        setPublishFeedback('error', 'Conecte uma conta antes de tentar publicar.');
        renderResult(state.currentResult, state.currentHistoryMeta);
        setToast('Conecte uma conta Meta antes de publicar.', 'error');
        return;
    }

    const targets = getSelectedPublishTargets(selectedConnection);

    if (!targets.length) {
        setPublishFeedback('error', 'Escolha Facebook, Instagram ou ambos antes de continuar.');
        renderResult(state.currentResult, state.currentHistoryMeta);
        setToast('Selecione Facebook, Instagram ou ambos para publicar.', 'error');
        return;
    }

    if (targets.includes('instagram') && !state.publishDraft.mediaUrl.trim()) {
        setPublishFeedback('error', 'Para publicar no Instagram, escolha uma imagem antes de continuar.');
        renderResult(state.currentResult, state.currentHistoryMeta);
        setToast('Para Instagram, envie uma imagem antes de publicar.', 'error');
        return;
    }

    openPublishConfirmation();
};

const confirmPublishSelected = async () => {
    if (!state.currentResult) {
        setPublishFeedback('error', 'Gere um conteúdo ou abra um salvo antes de publicar.');
        renderResult(state.currentResult, state.currentHistoryMeta);
        setToast('Gere um conteúdo ou abra um salvo antes de publicar.', 'error');
        return;
    }

    const selectedConnection = ensurePublishDraftConnection();

    if (!selectedConnection) {
        closePublishConfirmation();
        setPublishFeedback('error', 'Conecte uma conta antes de tentar publicar.');
        renderResult(state.currentResult, state.currentHistoryMeta);
        setToast('Conecte uma conta Meta antes de publicar.', 'error');
        return;
    }

    const targets = getSelectedPublishTargets(selectedConnection);

    if (!targets.length) {
        closePublishConfirmation();
        setPublishFeedback('error', 'Escolha Facebook, Instagram ou ambos antes de continuar.');
        renderResult(state.currentResult, state.currentHistoryMeta);
        setToast('Selecione Facebook, Instagram ou ambos para publicar.', 'error');
        return;
    }

    try {
        state.publishState.isLoading = true;
        state.publishState.results = [];
        setPublishFeedback('loading', 'Estamos enviando seu post. Isso pode levar alguns segundos.');
        closePublishConfirmation();
        renderResult(state.currentResult, state.currentHistoryMeta);

        const payload = await apiRequest('/api/social/publish', {
            method: 'POST',
            body: {
                connectionId: selectedConnection.id,
                targets,
                mediaUrl: state.publishDraft.mediaUrl.trim() || undefined,
                captionText: state.currentResult.description,
                generationHistoryId: state.currentHistoryMeta?.historyId || undefined
            }
        });

        state.publishState.results = (payload?.data?.publications || []).map((publication) => ({
            networkLabel:
                publication.network === 'instagram'
                    ? 'Instagram'
                    : publication.network === 'facebook'
                    ? 'Facebook'
                    : publication.network,
            status: publication.status || 'success',
            message:
                publication.network === 'instagram'
                    ? 'Post enviado para o Instagram com sucesso.'
                    : 'Post enviado para o Facebook com sucesso.'
        }));
        setPublishFeedback(
            'success',
            targets.length === 2
                ? 'Seu post foi enviado para Facebook e Instagram.'
                : `Seu post foi enviado para ${targets[0] === 'instagram' ? 'Instagram' : 'Facebook'}.`
        );

        renderResult(state.currentResult, state.currentHistoryMeta);
        setToast(
            targets.length === 2
                ? 'Post enviado para Facebook e Instagram.'
                : `Post enviado para ${targets[0] === 'instagram' ? 'Instagram' : 'Facebook'}.`
        );
    } catch (error) {
        const publishErrorMessage = getErrorMessage(error, 'Não foi possível publicar agora.');
        state.publishState.results = [
            {
                networkLabel: 'Publicação',
                status: 'error',
                message: publishErrorMessage
            }
        ];
        setPublishFeedback('error', publishErrorMessage);
        renderResult(state.currentResult, state.currentHistoryMeta);
        setToast(publishErrorMessage, 'error');
    } finally {
        state.publishState.isLoading = false;
        renderResult(state.currentResult, state.currentHistoryMeta);
    }
};

const handleSubscriptionToggle = async () => {
    if (!state.user) {
        return;
    }

    const nextPlan = state.user.subscriptionPlan === 'premium' ? 'free' : 'premium';

    try {
        const client = ensureSupabaseClient();
        setLoading(elements.subscriptionToggleButton, true, 'Atualizando...');

        const { data, error } = await client
            .from('profiles')
            .update({
                subscription_plan: nextPlan
            })
            .eq('id', state.user.id)
            .select('id, name, email, subscription_plan, created_at, updated_at')
            .single();

        if (error) {
            throw error;
        }

        updateAuthenticatedState(
            mapProfileToUser(data, {
                id: data.id,
                email: data.email,
                created_at: data.created_at,
                user_metadata: {
                    name: data.name
                }
            })
        );
        setToast(`Assinatura alterada para ${data.subscription_plan}.`);
    } catch (error) {
        setToast(getErrorMessage(error, 'Não foi possível atualizar a assinatura.'), 'error');
    } finally {
        setLoading(elements.subscriptionToggleButton, false);
    }
};

const handleRefreshProfile = async () => {
    try {
        setLoading(elements.refreshProfileButton, true, 'Atualizando...');
        await loadCurrentUser();
        await tryLoadSocialConnections(true);
        await loadHistoryPage(state.history.page);
        setToast('Perfil atualizado.');
    } catch (error) {
        setToast(getErrorMessage(error, 'Não foi possível atualizar o perfil.'), 'error');
    } finally {
        setLoading(elements.refreshProfileButton, false);
    }
};

const handleProfileUpdate = async (event) => {
    event.preventDefault();

    if (!state.user) {
        return;
    }

    try {
        const client = ensureSupabaseClient();
        setLoading(elements.saveProfileButton, true, 'Salvando...');

        const name = elements.profileNameInput.value.trim();

        const { data, error } = await client
            .from('profiles')
            .update({
                name: name || null
            })
            .eq('id', state.user.id)
            .select('id, name, email, subscription_plan, created_at, updated_at')
            .single();

        if (error) {
            throw error;
        }

        updateAuthenticatedState(
            mapProfileToUser(data, {
                id: data.id,
                email: data.email,
                created_at: data.created_at,
                user_metadata: {
                    name: data.name
                }
            })
        );
        setToast('Nome atualizado com sucesso.');
    } catch (error) {
        setToast(getErrorMessage(error, 'Não foi possível atualizar o nome.'), 'error');
    } finally {
        setLoading(elements.saveProfileButton, false);
    }
};

const saveGenerationToHistory = async (requestContext, result) => {
    if (!state.user) {
        return null;
    }

    const client = ensureSupabaseClient();
    const requestSnapshot = {
        productName: requestContext.productName,
        productFeatures: requestContext.productFeatures ?? undefined,
        targetAudience: requestContext.targetAudience ?? undefined,
        tone: requestContext.tone ?? undefined,
        userId: state.user.id,
        sessionId: state.sessionId,
        subscriptionPlan: result.subscriptionPlan,
        requestedGenerationMode: requestContext.generationMode || undefined,
        appliedGenerationMode: result.generationMode,
        modeAdjusted: result.modeAdjusted
    };

    const { data, error } = await client
        .from('generation_history')
        .insert({
            user_id: state.user.id,
            session_id: state.sessionId,
            subscription_plan: result.subscriptionPlan,
            requested_generation_mode: requestContext.generationMode || null,
            applied_generation_mode: result.generationMode,
            mode_adjusted: result.modeAdjusted,
            product_name: requestSnapshot.productName,
            product_features: requestSnapshot.productFeatures ?? null,
            target_audience: requestSnapshot.targetAudience ?? null,
            tone: requestSnapshot.tone ?? null,
            response_source: result.source,
            response_provider: result.provider,
            response_model: result.model,
            fallback_used: result.fallbackUsed,
            request_json: requestSnapshot,
            response_json: result
        })
        .select('id, created_at, request_json, response_json')
        .single();

    if (error) {
        throw error;
    }

    return mapHistoryRow(data);
};

const requestGeneration = async (requestContext, options = {}) => {
    const payload = await apiRequest('/api/ai/generate-description', {
        method: 'POST',
        body: {
            productName: requestContext.productName,
            productFeatures: requestContext.productFeatures,
            targetAudience: requestContext.targetAudience,
            tone: requestContext.tone,
            generationMode: requestContext.generationMode,
            sessionId: state.sessionId,
            optionCount: options.optionCount ?? getRequestedOptionCount(false),
            existingOptions: options.existingOptions
        }
    });

    return normalizeResultShape(payload.data);
};

const persistGeneratedResult = async (requestContext, result) => {
    if (!state.user) {
        return null;
    }

    const historyEntry = await saveGenerationToHistory(requestContext, result);
    await loadHistoryPage(1);
    return historyEntry;
};

const handleGenerateSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const requestContext = createRequestContextFromFormData(formData);

    try {
        setLoading(elements.generateButton, true, 'Gerando...');
        state.publishState.results = [];
        setGenerateFeedback('loading', 'Estamos montando seu post. Aguarde só um instante.');
        state.currentRequestContext = requestContext;
        const result = await requestGeneration(requestContext, {
            optionCount: getRequestedOptionCount(false)
        });

        let historyEntry = null;

        historyEntry = await persistGeneratedResult(requestContext, result);

        setCurrentView('generate');
        renderResult(result, historyEntry ? { historyId: historyEntry.id, createdAt: historyEntry.createdAt } : null);
        setGenerateFeedback(
            'success',
            result.options.length > 1
                ? 'Pronto! Criamos 3 opções para você comparar e escolher a melhor.'
                : 'Pronto! Seu post foi criado e já está aqui ao lado para revisar.'
        );
        setToast(
            result.options.length > 1
                ? `3 opções criadas via ${result.source}.`
                : `Conteúdo gerado via ${result.source}.`
        );
    } catch (error) {
        setGenerateFeedback('error', getErrorMessage(error, 'Não foi possível gerar o conteúdo agora.'));
        setToast(getErrorMessage(error, 'Não foi possível gerar o conteúdo.'), 'error');
    } finally {
        setLoading(elements.generateButton, false);
    }
};

const handleGeneratorDraftChange = () => {
    if (state.generateState.status !== 'idle') {
        setGenerateFeedback('idle', '');
    }
    if (elements.generationModeSelect.value === 'short') {
        hideGenerationModeLockHint();
    }
    renderGenerationPhotoTip();
    renderResult(state.currentResult, state.currentHistoryMeta);
};

const handleGenerationUpgradeClick = () => {
    setCurrentView('account');
    elements.memberAuthView.hidden
        ? elements.authPanel.scrollIntoView({ behavior: 'smooth', block: 'start' })
        : elements.memberPlanBadge.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

const renderGenerationPhotoTip = () => {
    if (!elements.generationPhotoTip) {
        return;
    }

    const requestContext = getLiveGeneratorRequestContext();
    const shouldShow = Boolean(
        requestContext.productName ||
            requestContext.productFeatures ||
            requestContext.targetAudience ||
            requestContext.tone
    );

    elements.generationPhotoTip.hidden = !shouldShow;
};

const handleResultAction = async (event) => {
    const connectionSelect = event.target.closest('[data-publish-connection-select]');
    const facebookCheckbox = event.target.closest('[data-publish-facebook]');
    const instagramCheckbox = event.target.closest('[data-publish-instagram]');
    const mediaFileInput = event.target.closest('[data-publish-media-file]');
    const publishTrigger = event.target.closest('[data-publish-selected]');
    const selectTrigger = event.target.closest('[data-option-select]');
    const regenerateTrigger = event.target.closest('[data-option-regenerate]');
    const regenerateAllTrigger = event.target.closest('[data-options-regenerate-all]');

    if (connectionSelect) {
        state.publishDraft.connectionId = connectionSelect.value;
        ensurePublishDraftConnection();
        renderResult(state.currentResult, state.currentHistoryMeta);
        return;
    }

    if (facebookCheckbox) {
        state.publishDraft.facebook = facebookCheckbox.checked;
        ensurePublishDraftConnection();
        renderResult(state.currentResult, state.currentHistoryMeta);
        return;
    }

    if (instagramCheckbox) {
        state.publishDraft.instagram = instagramCheckbox.checked;
        ensurePublishDraftConnection();
        renderResult(state.currentResult, state.currentHistoryMeta);
        return;
    }

    if (mediaFileInput) {
        const file = mediaFileInput.files?.[0];

        if (!file) {
            return;
        }

        try {
            await uploadInstagramImage(file);
            renderResult(state.currentResult, state.currentHistoryMeta);
            setToast('Imagem enviada e pronta para o Instagram.');
        } catch (error) {
            renderResult(state.currentResult, state.currentHistoryMeta);
            setToast(getErrorMessage(error, 'Não foi possível enviar essa imagem.'), 'error');
        }
        return;
    }

    if (publishTrigger) {
        await handlePublishSelected();
        return;
    }

    if (!selectTrigger && !regenerateTrigger && !regenerateAllTrigger) {
        return;
    }

    if (selectTrigger) {
        const selectedIndex = Number(selectTrigger.dataset.optionSelect);
        renderResult(applySelectedOption(state.currentResult, selectedIndex), state.currentHistoryMeta);
        requestAnimationFrame(() => {
            document.querySelector('[data-result-slot="generate"] [data-selected-option-card="true"]')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        });
        return;
    }

    if (!state.currentResult || !state.currentRequestContext) {
        setToast('Abra ou gere um conteúdo antes de pedir uma nova variação.', 'error');
        return;
    }

    const currentResult = normalizeResultShape(state.currentResult);
    const currentRequestContext = {
        ...state.currentRequestContext,
        generationMode: state.currentRequestContext.generationMode || currentResult.generationMode
    };

    try {
        const isSingleRegeneration = Boolean(regenerateTrigger);
        const optionIndex = isSingleRegeneration ? Number(regenerateTrigger.dataset.optionRegenerate) : null;

        state.resultActionState = {
            isLoading: true,
            scope: isSingleRegeneration ? 'single' : 'all',
            optionIndex
        };
        renderResult(currentResult, state.currentHistoryMeta);

        const regeneratedResult = await requestGeneration(currentRequestContext, {
            optionCount: getRequestedOptionCount(isSingleRegeneration),
            existingOptions: currentResult.options
        });

        let nextResult = regeneratedResult;

        if (isSingleRegeneration) {
            const safeOptionIndex = Math.max(0, Math.min(optionIndex, currentResult.options.length - 1));
            const mergedOptions = currentResult.options.map((option, index) =>
                index === safeOptionIndex ? regeneratedResult.options[0] : option
            );

            nextResult = applySelectedOption(
                {
                    ...currentResult,
                    ...regeneratedResult,
                    options: mergedOptions
                },
                safeOptionIndex
            );
        }

        state.currentRequestContext = currentRequestContext;
        const historyEntry = await persistGeneratedResult(currentRequestContext, nextResult);

        renderResult(nextResult, historyEntry ? { historyId: historyEntry.id, createdAt: historyEntry.createdAt } : null);
        setCurrentView('generate');
        setToast(
            isSingleRegeneration
                ? `Opção ${optionIndex + 1} refeita com sucesso.`
                : 'As 3 opções foram recriadas com sucesso.'
        );
    } catch (error) {
        setToast(getErrorMessage(error, 'Não foi possível refazer essa opção agora.'), 'error');
    } finally {
        state.resultActionState = {
            isLoading: false,
            scope: null,
            optionIndex: null
        };

        if (state.currentResult) {
            renderResult(state.currentResult, state.currentHistoryMeta);
        }
    }
};

const openHistoryEntry = async (historyId) => {
    try {
        const client = ensureSupabaseClient();
        const { data, error } = await client
            .from('generation_history')
            .select('id, created_at, request_json, response_json')
            .eq('id', historyId)
            .single();

        if (error) {
            throw error;
        }

        const entry = mapHistoryRow(data);
        state.publishState.results = [];
        state.currentRequestContext = createRequestContextFromHistoryRequest(entry.request);
        setCurrentView('history');
        renderResult(entry.response, {
            historyId: entry.id,
            createdAt: entry.createdAt
        });
        setToast('Histórico reaberto com sucesso.');
    } catch (error) {
        setToast(getErrorMessage(error, 'Não foi possível abrir esse item de novo.'), 'error');
    }
};

const registerAuthListener = () => {
    if (!supabaseClient) {
        return;
    }

    supabaseClient.auth.onAuthStateChange((event) => {
        if (event === 'INITIAL_SESSION') {
            return;
        }

        window.setTimeout(async () => {
            await loadCurrentUser();

            if (state.user) {
                await tryLoadSocialConnections(true);
                await loadHistoryPage(1);
            } else {
                await tryLoadSocialConnections(false);
                resetHistoryState();
            }
        }, 0);
    });
};

const consumeSocialRedirectState = () => {
    const currentUrl = new URL(window.location.href);
    const socialStatus = currentUrl.searchParams.get('social_status');
    const socialMessage = currentUrl.searchParams.get('social_message');

    if (!socialStatus && !socialMessage) {
        return;
    }

    if (socialMessage) {
        setToast(socialMessage, socialStatus === 'connected' ? 'success' : 'error');
    }

    currentUrl.searchParams.delete('social_status');
    currentUrl.searchParams.delete('social_message');
    const nextSearch = currentUrl.searchParams.toString();
    const nextUrl = `${currentUrl.pathname}${nextSearch ? `?${nextSearch}` : ''}${currentUrl.hash}`;
    window.history.replaceState({}, '', nextUrl);
};

const wireEvents = () => {
    elements.viewButtons.forEach((button) => {
        button.addEventListener('click', () => {
            setCurrentView(button.dataset.viewTarget);
        });
    });

    elements.goViewButtons.forEach((button) => {
        button.addEventListener('click', () => {
            setCurrentView(button.dataset.goView);
        });
    });

    elements.showLoginTab.addEventListener('click', () => {
        state.currentAuthTab = 'login';
        renderAuthView();
    });

    elements.showRegisterTab.addEventListener('click', () => {
        state.currentAuthTab = 'register';
        renderAuthView();
    });

    elements.loginForm.addEventListener('submit', handleLoginSubmit);
    elements.registerForm.addEventListener('submit', handleRegisterSubmit);
    elements.profileForm.addEventListener('submit', handleProfileUpdate);
    elements.googleLoginButton.addEventListener('click', handleGoogleAuth);
    elements.googleRegisterButton.addEventListener('click', handleGoogleAuth);
    elements.connectMetaButton.addEventListener('click', () => handleMetaConnect('facebook'));
    elements.connectMetaInstagramButton.addEventListener('click', () => handleMetaConnect('instagram'));
    elements.refreshSocialButton.addEventListener('click', handleRefreshSocialConnections);
    elements.debugMetaButton.addEventListener('click', handleMetaDebug);
    elements.disconnectMetaButton.addEventListener('click', handleDisconnectMeta);
    elements.logoutButton.addEventListener('click', handleLogout);
    elements.subscriptionToggleButton.addEventListener('click', handleSubscriptionToggle);
    elements.refreshProfileButton.addEventListener('click', handleRefreshProfile);
    elements.startOnboardingButton.addEventListener('click', () => {
        startOnboarding();
    });
    elements.skipOnboardingButton.addEventListener('click', () => {
        closeOnboarding(ONBOARDING_STATUS.skipped);
    });
    elements.onboardingCardSkip.addEventListener('click', () => {
        closeOnboarding(ONBOARDING_STATUS.skipped);
    });
    elements.onboardingPrevButton.addEventListener('click', () => {
        state.onboarding.activeStepIndex = Math.max(0, state.onboarding.activeStepIndex - 1);
        syncOnboardingStepView();
    });
    elements.onboardingNextButton.addEventListener('click', () => {
        if (state.onboarding.activeStepIndex >= ONBOARDING_STEPS.length - 1) {
            closeOnboarding(ONBOARDING_STATUS.completed);
            return;
        }

        state.onboarding.activeStepIndex += 1;
        syncOnboardingStepView();
    });
    elements.instagramHelpProButton.addEventListener('click', () => {
        state.instagramHelpMode = 'pro';
        renderInstagramHelper();
        elements.instagramHelpViewPro.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    elements.instagramHelpUnsureButton.addEventListener('click', () => {
        state.instagramHelpMode = 'unsure';
        renderInstagramHelper();
        elements.instagramHelpViewUnsure.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    elements.publishConfirmCancel.addEventListener('click', closePublishConfirmation);
    elements.publishConfirmCancelFooter.addEventListener('click', closePublishConfirmation);
    elements.publishConfirmSubmit.addEventListener('click', confirmPublishSelected);
    elements.publishConfirmLayer.addEventListener('click', (event) => {
        if (event.target === elements.publishConfirmLayer) {
            closePublishConfirmation();
        }
    });
    elements.featuresHelpTrigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFeaturesHelpPopover();
    });
    elements.featuresHelpPopover.addEventListener('click', (event) => {
        event.stopPropagation();
    });
    elements.generatorForm.addEventListener('submit', handleGenerateSubmit);
    elements.generatorForm.addEventListener('input', handleGeneratorDraftChange);
    elements.generatorForm.addEventListener('change', handleGeneratorDraftChange);
    elements.openPhotoGuideButton.addEventListener('click', () => {
        setCurrentView('photo-guide');
    });
    elements.generationUpgradeButton.addEventListener('click', handleGenerationUpgradeClick);
    elements.generationModeUpgradeLink.addEventListener('click', handleGenerationUpgradeClick);
    elements.generationModeLockOptions.forEach((button) => {
        button.addEventListener('click', () => {
            showGenerationModeLockHint();
        });
    });
    document.addEventListener('click', (event) => {
        if (
            !elements.featuresHelpPopover.hidden &&
            !elements.featuresHelpPopover.contains(event.target) &&
            !elements.featuresHelpTrigger.contains(event.target)
        ) {
            closeFeaturesHelpPopover();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeFeaturesHelpPopover();
        }
    });
    elements.historyLimitSelect.addEventListener('change', async () => {
        state.history.limit = Number(elements.historyLimitSelect.value);
        await loadHistoryPage(1);
    });
    elements.refreshHistoryButton.addEventListener('click', async () => {
        try {
            setLoading(elements.refreshHistoryButton, true, 'Atualizando...');
            await loadHistoryPage(state.history.page);
            setToast('Histórico atualizado.');
        } catch (error) {
            setToast(getErrorMessage(error, 'Não foi possível atualizar o histórico.'), 'error');
        } finally {
            setLoading(elements.refreshHistoryButton, false);
        }
    });
    elements.historyPrevButton.addEventListener('click', () => loadHistoryPage(Math.max(1, state.history.page - 1)));
    elements.historyNextButton.addEventListener('click', () => {
        if (state.history.hasNextPage) {
            loadHistoryPage(state.history.page + 1);
        }
    });
    elements.historyList.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-history-open]');

        if (!trigger) {
            return;
        }

        openHistoryEntry(trigger.dataset.historyOpen);
    });
    elements.resultSlots.forEach((slot) => {
        slot.addEventListener('click', handleResultAction);
        slot.addEventListener('change', handleResultAction);
        slot.addEventListener('input', handleResultAction);
    });
};

const bootstrap = async () => {
    consumeSocialRedirectState();
    syncHistoryLimit();
    renderDeploymentNotice();
    renderView();
    renderDashboard();
    renderAuthView();
    renderResult(null);
    renderHistory();
    renderInstagramHelper();
    renderGenerationPhotoTip();
    wireEvents();
    registerAuthListener();
    await loadCurrentUser();
    await tryLoadSocialConnections(false);

    if (state.user) {
        await loadHistoryPage(1);
    }

    syncOnboardingState();
};

const hideAppSplash = () => {
    document.body.classList.add('app-ready');

    if (elements.appSplash) {
        window.setTimeout(() => {
            elements.appSplash.remove();
        }, 420);
    }
};

bootstrap().catch((error) => {
    console.error(error);
    setToast('Falha ao inicializar o frontend.', 'error');
}).finally(() => {
    hideAppSplash();
    window.setTimeout(() => {
        if (state.onboarding.status === ONBOARDING_STATUS.pending && !state.onboarding.hasAutoStarted) {
            state.onboarding.hasAutoStarted = true;
            startOnboarding();
        }
    }, 520);
});
