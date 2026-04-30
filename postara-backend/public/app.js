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
        'Auth e histórico já estão conectados ao Supabase. O próximo passo é publicar a geração de conteúdo.';
};

const apiRequest = async (path, options = {}) => {
    if (!API_BASE_URL) {
        throw new Error(
            'A geração ainda não está conectada a uma API publicada. Auth e histórico já estão funcionando via Supabase.'
        );
    }

    const requestUrl = `${API_BASE_URL}${path}`;
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

const handleLogout = async () => {
    try {
        const client = ensureSupabaseClient();
        setLoading(elements.logoutButton, true, 'Saindo...');

        const { error } = await client.auth.signOut();

        if (error) {
            throw error;
        }

        updateAuthenticatedState(null);
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

const saveGenerationToHistory = async (formData, result) => {
    if (!state.user) {
        return null;
    }

    const client = ensureSupabaseClient();
    const requestSnapshot = {
        productName: String(formData.get('productName') || ''),
        productFeatures: String(formData.get('productFeatures') || '') || undefined,
        targetAudience: String(formData.get('targetAudience') || '') || undefined,
        tone: String(formData.get('tone') || '') || undefined,
        userId: state.user.id,
        sessionId: state.sessionId,
        subscriptionPlan: result.subscriptionPlan,
        requestedGenerationMode: elements.generationModeSelect.value || undefined,
        appliedGenerationMode: result.generationMode,
        modeAdjusted: result.modeAdjusted
    };

    const { data, error } = await client
        .from('generation_history')
        .insert({
            user_id: state.user.id,
            session_id: state.sessionId,
            subscription_plan: result.subscriptionPlan,
            requested_generation_mode: elements.generationModeSelect.value || null,
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

        let historyEntry = null;

        if (state.user) {
            historyEntry = await saveGenerationToHistory(formData, payload.data);
            await loadHistoryPage(1);
        }

        setCurrentView('generate');
        renderResult(payload.data, historyEntry ? { historyId: historyEntry.id, createdAt: historyEntry.createdAt } : null);
        setToast(`Conteúdo gerado via ${payload.data.source}.`);
    } catch (error) {
        setToast(getErrorMessage(error, 'Não foi possível gerar o conteúdo.'), 'error');
    } finally {
        setLoading(elements.generateButton, false);
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
                await loadHistoryPage(1);
            } else {
                resetHistoryState();
            }
        }, 0);
    });
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
    registerAuthListener();
    await loadCurrentUser();

    if (state.user) {
        await loadHistoryPage(1);
    }
};

bootstrap().catch((error) => {
    console.error(error);
    setToast('Falha ao inicializar o frontend.', 'error');
});
