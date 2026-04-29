const STORAGE_KEYS = {
    token: 'postara.auth.token',
    sessionId: 'postara.session.id'
};

const runtimeConfig = window.POSTARA_CONFIG || {};
const API_BASE_URL = String(runtimeConfig.apiBaseUrl || '').replace(/\/$/, '');
const IS_STATIC_PREVIEW_WITHOUT_API =
    window.location.hostname.endsWith('vercel.app') && !API_BASE_URL;

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
    token: localStorage.getItem(STORAGE_KEYS.token),
    sessionId: localStorage.getItem(STORAGE_KEYS.sessionId) || crypto.randomUUID(),
    user: null,
    currentAuthTab: 'login',
    currentView: 'dashboard',
    currentResult: null,
    currentHistoryMeta: null,
    history: {
        entries: [],
        page: 1,
        limit: 5,
        total: 0,
        hasNextPage: false
    }
};

localStorage.setItem(STORAGE_KEYS.sessionId, state.sessionId);

// Centralizamos os seletores para deixar a manutenção da SPA simples conforme o layout evolui.
const elements = {
    toast: document.getElementById('toast'),
    planBadge: document.getElementById('plan-badge'),
    sessionBadge: document.getElementById('session-badge'),
    deploymentNotice: document.getElementById('deployment-notice'),
    viewTitle: document.getElementById('view-title'),
    viewDescription: document.getElementById('view-description'),
    viewButtons: [...document.querySelectorAll('[data-view-target]')],
    goViewButtons: [...document.querySelectorAll('[data-go-view]')],
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
    memberName: document.getElementById('member-name'),
    memberEmail: document.getElementById('member-email'),
    memberPlanBadge: document.getElementById('member-plan-badge'),
    memberIdBadge: document.getElementById('member-id-badge'),
    subscriptionToggleButton: document.getElementById('subscription-toggle-button'),
    refreshProfileButton: document.getElementById('refresh-profile-button'),
    logoutButton: document.getElementById('logout-button'),
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
    value
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

const setToast = (message, type = 'success') => {
    elements.toast.textContent = message;
    elements.toast.className = `toast is-${type}`;
    elements.toast.hidden = false;

    window.clearTimeout(setToast.timeoutId);
    setToast.timeoutId = window.setTimeout(() => {
        elements.toast.hidden = true;
    }, 3500);
};

const renderDeploymentNotice = () => {
    if (API_BASE_URL) {
        elements.deploymentNotice.hidden = false;
        elements.deploymentNotice.textContent = `Frontend conectado à API externa em ${API_BASE_URL}.`;
        return;
    }

    if (IS_STATIC_PREVIEW_WITHOUT_API) {
        elements.deploymentNotice.hidden = false;
        elements.deploymentNotice.textContent =
            'Este preview da Vercel está publicando só o visual do app. Para testar login, geração e histórico, precisamos publicar a API e conectar a URL dela aqui.';
        return;
    }

    elements.deploymentNotice.hidden = true;
};

const apiRequest = async (path, options = {}) => {
    const requestUrl = `${API_BASE_URL}${path}`;
    const headers = {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
    };

    if (state.token) {
        headers.Authorization = `Bearer ${state.token}`;
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
        let message = payload?.error?.message || 'A requisição falhou.';

        if (IS_STATIC_PREVIEW_WITHOUT_API && !API_BASE_URL) {
            message =
                'Este preview da Vercel ainda não tem backend conectado. O visual está pronto, mas login, geração e histórico precisam de uma API publicada.';
        } else if (!contentType.includes('application/json')) {
            message =
                'A resposta da API não veio no formato esperado. Pode ser uma rota inexistente ou um backend não conectado.';
        }

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

    const badges = [
        `Plano ${result.subscriptionPlan}`,
        `Modo ${result.generationMode}`,
        `${result.source} • ${result.model}`,
        result.fallbackUsed ? 'Fallback ativo' : 'Primário ativo'
    ];

    if (result.modeAdjusted) {
        badges.push('Modo ajustado pela regra do plano');
    }

    if (meta?.historyId) {
        badges.push(`Histórico ${meta.historyId.slice(0, 8)}`);
    }

    return `
        <article class="result-view">
            <div class="result-meta">
                ${badges
                    .map((badge) => `<span class="badge badge-muted">${escapeHtml(badge)}</span>`)
                    .join('')}
            </div>
            <h3>${escapeHtml(result.title)}</h3>
            <div class="result-block">
                <h4>Legenda</h4>
                <p>${escapeHtml(result.caption)}</p>
            </div>
            <div class="result-block">
                <h4>CTA</h4>
                <p>${escapeHtml(result.cta)}</p>
            </div>
            <div class="result-block">
                <h4>Hashtags</h4>
                <div class="tag-list">
                    ${result.hashtags
                        .map((hashtag) => `<span class="tag">${escapeHtml(hashtag)}</span>`)
                        .join('')}
                </div>
            </div>
            <div class="result-block">
                <h4>Descrição completa</h4>
                <pre>${escapeHtml(result.description)}</pre>
            </div>
        </article>
    `;
};

// Renderizamos a mesma resposta em slots diferentes para reaproveitar o preview nas áreas de geração e histórico.
const renderResult = (result, meta = null) => {
    state.currentResult = result;
    state.currentHistoryMeta = meta;

    const markup = getResultMarkup(result, meta);
    elements.resultSlots.forEach((slot) => {
        slot.innerHTML = markup;
    });

    renderDashboard();
};

const renderAuthView = () => {
    const isAuthenticated = Boolean(state.user);

    elements.guestAuthView.hidden = isAuthenticated;
    elements.memberAuthView.hidden = !isAuthenticated;
    elements.planBadge.textContent = isAuthenticated
        ? `Plano ${state.user.subscriptionPlan === 'premium' ? 'Premium' : 'Free'}`
        : 'Plano Free';
    elements.sessionBadge.textContent = isAuthenticated
        ? 'Sessão autenticada ativa'
        : 'Sessão anônima ativa';

    if (!isAuthenticated) {
        const showingLogin = state.currentAuthTab === 'login';
        elements.showLoginTab.classList.toggle('is-active', showingLogin);
        elements.showRegisterTab.classList.toggle('is-active', !showingLogin);
        elements.loginForm.hidden = !showingLogin;
        elements.registerForm.hidden = showingLogin;
        applyPlanToModeSelector();
        renderDashboard();
        return;
    }

    elements.memberName.textContent = state.user.name || 'Usuário Postara';
    elements.memberEmail.textContent = state.user.email;
    elements.memberPlanBadge.textContent = state.user.subscriptionPlan === 'premium' ? 'Premium' : 'Free';
    elements.memberIdBadge.textContent = `ID ${state.user.id.slice(0, 8)}`;
    elements.subscriptionToggleButton.textContent =
        state.user.subscriptionPlan === 'premium' ? 'Voltar para Free' : 'Ir para Premium';

    applyPlanToModeSelector();
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

const persistToken = (token) => {
    state.token = token;

    if (token) {
        localStorage.setItem(STORAGE_KEYS.token, token);
    } else {
        localStorage.removeItem(STORAGE_KEYS.token);
    }
};

const updateAuthenticatedState = (user) => {
    state.user = user;
    renderAuthView();
    renderHistory();
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

const loadCurrentUser = async () => {
    if (!state.token) {
        updateAuthenticatedState(null);
        return;
    }

    try {
        const payload = await apiRequest('/api/auth/me');
        updateAuthenticatedState(payload.data);
    } catch (error) {
        persistToken(null);
        updateAuthenticatedState(null);
        setToast(error.message, 'error');
    }
};

const loadHistoryPage = async (page = 1) => {
    if (!state.user) {
        resetHistoryState();
        return;
    }

    const payload = await apiRequest(`/api/ai/history?page=${page}&limit=${state.history.limit}`);
    state.history.entries = payload.data;
    state.history.total = payload.meta.total;
    state.history.page = payload.meta.page;
    state.history.limit = payload.meta.limit;
    state.history.hasNextPage = payload.meta.hasNextPage;
    renderHistory();
};

const handleAuthSuccess = async (payload, successMessage) => {
    persistToken(payload.data.token);
    updateAuthenticatedState(payload.data.user);
    await loadHistoryPage(1);
    setCurrentView('generate');
    setToast(successMessage);
};

const handleLoginSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    try {
        setLoading(event.currentTarget.querySelector('button[type="submit"]'), true, 'Entrando...');
        const payload = await apiRequest('/api/auth/login', {
            method: 'POST',
            body: {
                email: formData.get('email'),
                password: formData.get('password')
            }
        });
        await handleAuthSuccess(payload, 'Login realizado com sucesso.');
        event.currentTarget.reset();
    } catch (error) {
        setToast(error.message, 'error');
    } finally {
        setLoading(event.currentTarget.querySelector('button[type="submit"]'), false);
    }
};

const handleRegisterSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    try {
        setLoading(event.currentTarget.querySelector('button[type="submit"]'), true, 'Criando...');
        const payload = await apiRequest('/api/auth/register', {
            method: 'POST',
            body: {
                name: formData.get('name'),
                email: formData.get('email'),
                password: formData.get('password')
            }
        });
        await handleAuthSuccess(payload, 'Conta criada com sucesso.');
        event.currentTarget.reset();
    } catch (error) {
        setToast(error.message, 'error');
    } finally {
        setLoading(event.currentTarget.querySelector('button[type="submit"]'), false);
    }
};

const handleLogout = async () => {
    try {
        setLoading(elements.logoutButton, true, 'Saindo...');
        await apiRequest('/api/auth/logout', { method: 'POST' });
        persistToken(null);
        updateAuthenticatedState(null);
        resetHistoryState();
        setCurrentView('dashboard');
        setToast('Sessão encerrada.');
    } catch (error) {
        setToast(error.message, 'error');
    } finally {
        setLoading(elements.logoutButton, false);
    }
};

const handleSubscriptionToggle = async () => {
    if (!state.user) {
        return;
    }

    const nextPlan = state.user.subscriptionPlan === 'premium' ? 'free' : 'premium';

    try {
        setLoading(elements.subscriptionToggleButton, true, 'Atualizando...');
        const payload = await apiRequest('/api/auth/me/subscription', {
            method: 'PATCH',
            body: {
                subscriptionPlan: nextPlan
            }
        });
        updateAuthenticatedState(payload.data);
        setToast(`Assinatura alterada para ${payload.data.subscriptionPlan}.`);
    } catch (error) {
        setToast(error.message, 'error');
    } finally {
        setLoading(elements.subscriptionToggleButton, false);
    }
};

const handleRefreshProfile = async () => {
    try {
        setLoading(elements.refreshProfileButton, true, 'Atualizando...');
        await loadCurrentUser();
        await loadHistoryPage(state.history.page);
        setToast('Perfil atualizado.');
    } catch (error) {
        setToast(error.message, 'error');
    } finally {
        setLoading(elements.refreshProfileButton, false);
    }
};

const handleGenerateSubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    try {
        setLoading(elements.generateButton, true, 'Gerando...');
        const payload = await apiRequest('/api/ai/generate-description', {
            method: 'POST',
            body: {
                productName: formData.get('productName'),
                productFeatures: formData.get('productFeatures'),
                targetAudience: formData.get('targetAudience'),
                tone: formData.get('tone'),
                generationMode: elements.generationModeSelect.value,
                sessionId: state.sessionId
            }
        });

        setCurrentView('generate');
        renderResult(payload.data, payload.meta);

        if (state.user) {
            await loadHistoryPage(1);
        }

        setToast(`Conteúdo gerado via ${payload.data.source}.`);
    } catch (error) {
        setToast(error.message, 'error');
    } finally {
        setLoading(elements.generateButton, false);
    }
};

const openHistoryEntry = async (historyId) => {
    try {
        const payload = await apiRequest(`/api/ai/history/${historyId}`);
        setCurrentView('history');
        renderResult(payload.data.response, {
            historyId: payload.data.id,
            createdAt: payload.data.createdAt
        });
        setToast('Histórico reaberto com sucesso.');
    } catch (error) {
        setToast(error.message, 'error');
    }
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
            setToast(error.message, 'error');
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
};

const bootstrap = async () => {
    syncHistoryLimit();
    renderDeploymentNotice();
    renderView();
    renderDashboard();
    renderAuthView();
    renderResult(null);
    renderHistory();
    wireEvents();
    await loadCurrentUser();

    if (state.user) {
        await loadHistoryPage(1);
    }
};

bootstrap().catch((error) => {
    console.error(error);
    setToast('Falha ao inicializar o frontend.', 'error');
});
