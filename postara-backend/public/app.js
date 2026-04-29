const STORAGE_KEYS = {
    token: 'postara.auth.token',
    sessionId: 'postara.session.id'
};

const state = {
    token: localStorage.getItem(STORAGE_KEYS.token),
    sessionId: localStorage.getItem(STORAGE_KEYS.sessionId) || crypto.randomUUID(),
    user: null,
    currentAuthTab: 'login',
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

// Referências centrais do DOM para manter o código do scaffold organizado.
const elements = {
    toast: document.getElementById('toast'),
    planBadge: document.getElementById('plan-badge'),
    sessionBadge: document.getElementById('session-badge'),
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
    resultEmptyState: document.getElementById('result-empty-state'),
    resultView: document.getElementById('result-view'),
    resultMeta: document.getElementById('result-meta'),
    resultTitle: document.getElementById('result-title'),
    resultCaption: document.getElementById('result-caption'),
    resultCta: document.getElementById('result-cta'),
    resultHashtags: document.getElementById('result-hashtags'),
    resultDescription: document.getElementById('result-description'),
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

const apiRequest = async (path, options = {}) => {
    const headers = {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
    };

    if (state.token) {
        headers.Authorization = `Bearer ${state.token}`;
    }

    const response = await fetch(path, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        const message = payload?.error?.message || 'A requisição falhou.';
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
        return;
    }

    elements.memberName.textContent = state.user.name || 'Usuário Postara';
    elements.memberEmail.textContent = state.user.email;
    elements.memberPlanBadge.textContent = state.user.subscriptionPlan === 'premium' ? 'Premium' : 'Free';
    elements.memberIdBadge.textContent = `ID ${state.user.id.slice(0, 8)}`;
    elements.subscriptionToggleButton.textContent =
        state.user.subscriptionPlan === 'premium' ? 'Voltar para Free' : 'Ir para Premium';
    applyPlanToModeSelector();
};

const renderResult = (result, meta = null) => {
    state.currentResult = result;
    state.currentHistoryMeta = meta;

    if (!result) {
        elements.resultEmptyState.hidden = false;
        elements.resultView.hidden = true;
        return;
    }

    elements.resultEmptyState.hidden = true;
    elements.resultView.hidden = false;
    elements.resultTitle.textContent = result.title;
    elements.resultCaption.textContent = result.caption;
    elements.resultCta.textContent = result.cta;
    elements.resultDescription.textContent = result.description;
    elements.resultHashtags.innerHTML = result.hashtags
        .map((hashtag) => `<span class="tag">${escapeHtml(hashtag)}</span>`)
        .join('');

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

    elements.resultMeta.innerHTML = badges
        .map((badge) => `<span class="badge badge-muted">${escapeHtml(badge)}</span>`)
        .join('');
};

const renderHistory = () => {
    const isAuthenticated = Boolean(state.user);

    elements.historyLockedState.hidden = isAuthenticated;
    elements.historyContent.hidden = !isAuthenticated;

    if (!isAuthenticated) {
        elements.historyList.innerHTML = '';
        return;
    }

    if (state.history.entries.length === 0) {
        elements.historyList.innerHTML = '<div class="empty-state">Nenhuma geração salva para este usuário ainda.</div>';
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
