const STORAGE_KEYS = {
    sessionId: 'postara.session.id'
};

const runtimeConfig = window.POSTARA_CONFIG || {};
const API_BASE_URL = String(runtimeConfig.apiBaseUrl || '').replace(/\/$/, '');
const SUPABASE_URL = String(runtimeConfig.supabaseUrl || '').replace(/\/$/, '');
const SUPABASE_PUBLISHABLE_KEY = String(runtimeConfig.supabasePublishableKey || '').trim();
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
        description: 'Veja o estado da conta, o fluxo do app e os atalhos para continuar o trabalho.'
    },
    generate: {
        title: 'Gerar conteúdo',
        description: 'Crie novos posts com o plano atual e acompanhe a prévia completa em um espaço dedicado.'
    },
    history: {
        title: 'Histórico',
        description: 'Reabra resultados antigos com mais conforto e navegue pela timeline com paginação.'
    },
    account: {
        title: 'Conta',
        description: 'Entre, altere o plano de teste e mantenha o app alinhado ao tipo de usuário.'
    }
};

const state = {
    sessionId: localStorage.getItem(STORAGE_KEYS.sessionId) || crypto.randomUUID(),
    user: null,
    socialConnections: [],
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
        results: []
    },
    publishDraft: {
        connectionId: '',
        facebook: true,
        instagram: false,
        mediaUrl: ''
    },
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
    toast: document.getElementById('toast'),
    deploymentNotice: document.getElementById('deployment-notice'),
    viewTitle: document.getElementById('view-title'),
    viewDescription: document.getElementById('view-description'),
    viewButtons: [...document.querySelectorAll('[data-view-target]')],
    goViewButtons: [...document.querySelectorAll('[data-go-view]')],
    accountNavSummary: document.getElementById('account-nav-summary'),
    views: [...document.querySelectorAll('[data-view]')],
    resultSlots: [...document.querySelectorAll('[data-result-slot]')],
    dashboardAuthStatus: document.getElementById('dashboard-auth-status'),
    dashboardPlanStatus: document.getElementById('dashboard-plan-status'),
    dashboardHistoryStatus: document.getElementById('dashboard-history-status'),
    dashboardResultStatus: document.getElementById('dashboard-result-status'),
    guestAuthView: document.getElementById('guest-auth-view'),
    memberAuthView: document.getElementById('member-auth-view'),
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
    subscriptionToggleButton: document.getElementById('subscription-toggle-button'),
    refreshProfileButton: document.getElementById('refresh-profile-button'),
    logoutButton: document.getElementById('logout-button'),
    connectMetaButton: document.getElementById('connect-meta-button'),
    refreshSocialButton: document.getElementById('refresh-social-button'),
    disconnectMetaButton: document.getElementById('disconnect-meta-button'),
    socialEmptyState: document.getElementById('social-empty-state'),
    socialConnectionsList: document.getElementById('social-connections-list'),
    generatorForm: document.getElementById('generator-form'),
    generateButton: document.getElementById('generate-button'),
    generationModeSelect: document.getElementById('generation-mode-select'),
    generationModeHint: document.getElementById('generation-mode-hint'),
    historyLockedState: document.getElementById('history-locked-state'),
    historyContent: document.getElementById('history-content'),
    historyList: document.getElementById('history-list'),
    historyLimitSelect: document.getElementById('history-limit-select'),
    refreshHistoryButton: document.getElementById('refresh-history-button'),
    historyPrevButton: document.getElementById('history-prev-button'),
    historyNextButton: document.getElementById('history-next-button'),
    historyPaginationLabel: document.getElementById('history-pagination-label')
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

const ensurePublishDraftConnection = () => {
    const selectedConnection = getSelectedSocialConnection();

    if (!selectedConnection) {
        state.publishDraft.connectionId = '';
        state.publishDraft.facebook = true;
        state.publishDraft.instagram = false;
        return null;
    }

    state.publishDraft.connectionId = selectedConnection.id;

    if (!selectedConnection.supportsFacebook) {
        state.publishDraft.facebook = false;
    }

    if (!selectedConnection.supportsInstagram) {
        state.publishDraft.instagram = false;
        state.publishDraft.mediaUrl = '';
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
    elements.refreshSocialButton.disabled = !isAuthenticated || !hasConnections;
    elements.disconnectMetaButton.disabled = !isAuthenticated || !hasConnections;

    if (!isAuthenticated) {
        elements.socialEmptyState.hidden = false;
        elements.socialEmptyState.textContent =
            'Faça login e conecte a Meta para liberar envio direto para Facebook e Instagram.';
        elements.socialConnectionsList.innerHTML = '';
        return;
    }

    if (!hasConnections) {
        elements.socialEmptyState.hidden = false;
        elements.socialEmptyState.textContent =
            'Nenhuma rede Meta conectada ainda. Use o botão acima para importar páginas do Facebook e contas profissionais do Instagram.';
        elements.socialConnectionsList.innerHTML = '';
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

            ${
                instagramSelected
                    ? `
                        <label class="field">
                            <span>URL pública da imagem para Instagram</span>
                            <input
                                type="url"
                                placeholder="https://seu-servidor.com/imagem.jpg"
                                value="${escapeHtml(state.publishDraft.mediaUrl)}"
                                data-publish-media-url
                            />
                        </label>
                    `
                    : ''
            }

            <p class="hint">
                Facebook pode publicar só o texto. Instagram exige uma imagem pública e usa o texto pronto selecionado no preview.
            </p>

            <button class="button button-primary" type="button" data-publish-selected ${publishDisabled ? 'disabled' : ''}>
                ${state.publishState.isLoading ? 'Postando...' : 'Postar descrição selecionada'}
            </button>

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
    if (!hasSupabaseConfig) {
        elements.deploymentNotice.hidden = false;
        elements.deploymentNotice.textContent =
            'Supabase ainda não foi configurado no frontend. Sem isso, login e histórico não funcionam.';
        return;
    }

    if (API_BASE_URL) {
        elements.deploymentNotice.hidden = false;
        elements.deploymentNotice.textContent =
            `Auth e histórico estão no Supabase. A geração está conectada à API em ${API_BASE_URL}.`;
        return;
    }

    elements.deploymentNotice.hidden = false;
    elements.deploymentNotice.textContent =
        'Auth e histórico já estão conectados ao Supabase. A geração agora usa a API da própria Vercel quando a chave Gemini estiver configurada.';
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

// Mantemos a UI consistente com o plano do usuário para evitar pedir algo que o backend vai negar ou ajustar.
const applyPlanToModeSelector = () => {
    const plan = state.user?.subscriptionPlan || 'free';
    const isPremium = plan === 'premium';
    const selectedValue = elements.generationModeSelect.value;

    [...elements.generationModeSelect.options].forEach((option) => {
        option.disabled = !isPremium && option.value !== 'short';
    });

    if (!isPremium) {
        elements.generationModeSelect.value = 'short';
        elements.generationModeHint.textContent =
            'Plano free usa modo short. Faça upgrade para desbloquear medium e premium.';
    } else if (!['short', 'medium', 'premium'].includes(selectedValue)) {
        elements.generationModeSelect.value = 'premium';
        elements.generationModeHint.textContent =
            'Plano premium libera short, medium e premium. Use o modo conforme o nível de profundidade desejado.';
    } else {
        elements.generationModeHint.textContent =
            'Plano premium libera short, medium e premium. Use o modo conforme o nível de profundidade desejado.';
    }
};

const renderDashboard = () => {
    if (!state.user) {
        elements.dashboardAuthStatus.textContent = 'Navegação em modo visitante.';
        elements.dashboardPlanStatus.textContent =
            'Faça login para salvar histórico e desbloquear o fluxo premium.';
    } else {
        const planLabel = state.user.subscriptionPlan === 'premium' ? 'Premium' : 'Free';
        elements.dashboardAuthStatus.textContent = `${state.user.name || 'Usuário Postara'} conectado(a).`;
        elements.dashboardPlanStatus.textContent =
            `Plano atual: ${planLabel}. O app já ajusta os modos permitidos para esse perfil.`;
    }

    if (!state.user) {
        elements.dashboardHistoryStatus.textContent = 'Seu histórico está bloqueado até o login.';
    } else if (state.history.total === 0) {
        elements.dashboardHistoryStatus.textContent = 'Nenhuma geração salva ainda para esta conta.';
    } else {
        elements.dashboardHistoryStatus.textContent =
            `${state.history.total} geração(ões) disponíveis para reabrir e reaproveitar.`;
    }

    if (!state.currentResult) {
        elements.dashboardResultStatus.textContent = 'Nenhum conteúdo gerado ainda.';
    } else {
        elements.dashboardResultStatus.textContent =
            `${state.currentResult.title} • ${state.currentResult.generationMode} • ${state.currentResult.source}`;
    }
};

const getResultMarkup = (result, meta = null) => {
    if (!result) {
        return `
            <div class="empty-state">
                Gere um post ou reabra um item do histórico para visualizar título, legenda, CTA, hashtags e metadados.
            </div>
        `;
    }

    const normalizedResult = normalizeResultShape(result);
    const selectedOption = normalizedResult.options[normalizedResult.selectedOptionIndex];
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
            <div class="result-meta">
                ${badges
                    .map((badge) => `<span class="badge badge-muted">${escapeHtml(badge)}</span>`)
                    .join('')}
            </div>
            ${
                hasMultipleOptions
                    ? `
                        <div class="result-block">
                            <h4>Opções criadas pela IA</h4>
                            <div class="option-grid">
                                ${normalizedResult.options
                                    .map(
                                        (option, index) => `
                                            <article class="option-card ${
                                                index === normalizedResult.selectedOptionIndex ? 'is-active' : ''
                                            }">
                                                <div class="option-card-head">
                                                    <span class="badge ${
                                                        index === normalizedResult.selectedOptionIndex ? '' : 'badge-muted'
                                                    }">Opção ${index + 1}</span>
                                                    ${
                                                        index === normalizedResult.selectedOptionIndex
                                                            ? '<span class="option-status">Selecionada</span>'
                                                            : ''
                                                    }
                                                </div>
                                                <h5>${escapeHtml(option.title)}</h5>
                                                <p>${escapeHtml(option.caption.slice(0, 150))}${
                                                    option.caption.length > 150 ? '…' : ''
                                                }</p>
                                                <div class="option-card-actions">
                                                    <button
                                                        class="button ${index === normalizedResult.selectedOptionIndex ? '' : 'button-ghost'}"
                                                        type="button"
                                                        data-option-select="${index}"
                                                        ${isLoadingResultAction ? 'disabled' : ''}
                                                    >
                                                        ${index === normalizedResult.selectedOptionIndex ? 'Em uso' : 'Usar opção'}
                                                    </button>
                                                    <button
                                                        class="button button-ghost"
                                                        type="button"
                                                        data-option-regenerate="${index}"
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

// Renderizamos a mesma resposta em slots diferentes para reaproveitar o preview nas áreas de geração e histórico.
const renderResult = (result, meta = null) => {
    state.currentResult = normalizeResultShape(result);
    state.currentHistoryMeta = meta;

    const markup = getResultMarkup(state.currentResult, meta);
    elements.resultSlots.forEach((slot) => {
        slot.innerHTML = markup;
    });

    renderDashboard();
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
        applyPlanToModeSelector();
        renderSocialConnections();
        renderDashboard();
        return;
    }

    elements.memberName.textContent = state.user.name || 'Usuário Postara';
    elements.memberEmail.textContent = state.user.email;
    elements.memberPlanBadge.textContent = state.user.subscriptionPlan === 'premium' ? 'Premium' : 'Free';
    elements.memberIdBadge.textContent = `ID ${state.user.id.slice(0, 8)}`;
    elements.accountNavSummary.textContent = `${state.user.name || state.user.email} - ${
        state.user.subscriptionPlan === 'premium' ? 'Premium' : 'Free'
    }`;
    elements.profileNameInput.value = state.user.name || '';
    elements.subscriptionToggleButton.textContent =
        state.user.subscriptionPlan === 'premium' ? 'Voltar para Free' : 'Ir para Premium';

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
                                Reabrir
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
        state.publishDraft = {
            connectionId: '',
            facebook: true,
            instagram: false,
            mediaUrl: ''
        };
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

const handleMetaConnect = async () => {
    try {
        setLoading(elements.connectMetaButton, true, 'Conectando...');
        const payload = await apiRequest('/api/social/meta/connect', {
            method: 'POST'
        });

        if (!payload?.data?.authorizationUrl) {
            throw new Error('A URL de autorização da Meta não foi retornada.');
        }

        window.location.href = payload.data.authorizationUrl;
    } catch (error) {
        setToast(getErrorMessage(error, 'Não foi possível iniciar a conexão com a Meta.'), 'error');
        setLoading(elements.connectMetaButton, false);
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

const handleDisconnectMeta = async () => {
    try {
        setLoading(elements.disconnectMetaButton, true, 'Desconectando...');
        await apiRequest('/api/social/connections?provider=meta', {
            method: 'DELETE'
        });
        state.socialConnections = [];
        state.publishDraft = {
            connectionId: '',
            facebook: true,
            instagram: false,
            mediaUrl: ''
        };
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
        state.publishDraft = {
            connectionId: '',
            facebook: true,
            instagram: false,
            mediaUrl: ''
        };
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
        setToast('Gere ou reabra um conteúdo antes de publicar.', 'error');
        return;
    }

    const selectedConnection = ensurePublishDraftConnection();

    if (!selectedConnection) {
        setToast('Conecte uma conta Meta antes de publicar.', 'error');
        return;
    }

    const targets = [];

    if (state.publishDraft.facebook && selectedConnection.supportsFacebook) {
        targets.push('facebook');
    }

    if (state.publishDraft.instagram && selectedConnection.supportsInstagram) {
        targets.push('instagram');
    }

    if (!targets.length) {
        setToast('Selecione Facebook, Instagram ou ambos para publicar.', 'error');
        return;
    }

    if (targets.includes('instagram') && !state.publishDraft.mediaUrl.trim()) {
        setToast('Para Instagram, informe uma URL pública de imagem.', 'error');
        return;
    }

    try {
        state.publishState.isLoading = true;
        state.publishState.results = [];
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

        renderResult(state.currentResult, state.currentHistoryMeta);
        setToast(
            targets.length === 2
                ? 'Post enviado para Facebook e Instagram.'
                : `Post enviado para ${targets[0] === 'instagram' ? 'Instagram' : 'Facebook'}.`
        );
    } catch (error) {
        state.publishState.results = [
            {
                networkLabel: 'Publicação',
                status: 'error',
                message: getErrorMessage(error, 'Não foi possível publicar agora.')
            }
        ];
        renderResult(state.currentResult, state.currentHistoryMeta);
        setToast(getErrorMessage(error, 'Não foi possível publicar agora.'), 'error');
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
        state.currentRequestContext = requestContext;
        const result = await requestGeneration(requestContext, {
            optionCount: getRequestedOptionCount(false)
        });

        let historyEntry = null;

        historyEntry = await persistGeneratedResult(requestContext, result);

        setCurrentView('generate');
        renderResult(result, historyEntry ? { historyId: historyEntry.id, createdAt: historyEntry.createdAt } : null);
        setToast(
            result.options.length > 1
                ? `3 opções criadas via ${result.source}.`
                : `Conteúdo gerado via ${result.source}.`
        );
    } catch (error) {
        setToast(getErrorMessage(error, 'Não foi possível gerar o conteúdo.'), 'error');
    } finally {
        setLoading(elements.generateButton, false);
    }
};

const handleResultAction = async (event) => {
    const connectionSelect = event.target.closest('[data-publish-connection-select]');
    const facebookCheckbox = event.target.closest('[data-publish-facebook]');
    const instagramCheckbox = event.target.closest('[data-publish-instagram]');
    const mediaUrlInput = event.target.closest('[data-publish-media-url]');
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

    if (mediaUrlInput) {
        state.publishDraft.mediaUrl = mediaUrlInput.value;
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
        setToast(getErrorMessage(error, 'Não foi possível reabrir esse item.'), 'error');
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
    elements.connectMetaButton.addEventListener('click', handleMetaConnect);
    elements.refreshSocialButton.addEventListener('click', handleRefreshSocialConnections);
    elements.disconnectMetaButton.addEventListener('click', handleDisconnectMeta);
    elements.logoutButton.addEventListener('click', handleLogout);
    elements.subscriptionToggleButton.addEventListener('click', handleSubscriptionToggle);
    elements.refreshProfileButton.addEventListener('click', handleRefreshProfile);
    elements.generatorForm.addEventListener('submit', handleGenerateSubmit);
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
    wireEvents();
    registerAuthListener();
    await loadCurrentUser();
    await tryLoadSocialConnections(false);

    if (state.user) {
        await loadHistoryPage(1);
    }
};

bootstrap().catch((error) => {
    console.error(error);
    setToast('Falha ao inicializar o frontend.', 'error');
});
