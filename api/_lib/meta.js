const META_PROVIDER = 'meta';
const DEFAULT_META_API_VERSION = 'v24.0';
const META_SCOPES = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'instagram_basic',
    'instagram_content_publish'
];

const getMetaConfig = () => {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const configId = process.env.META_CONFIG_ID || process.env.META_BUSINESS_LOGIN_CONFIG_ID || '';

    if (!appId || !appSecret) {
        throw new Error('As variáveis META_APP_ID e META_APP_SECRET precisam ser configuradas.');
    }

    return {
        appId,
        appSecret,
        configId,
        version: process.env.META_API_VERSION || DEFAULT_META_API_VERSION
    };
};

const buildMetaOAuthUrl = ({ redirectUri, state }) => {
    const { appId, version, configId } = getMetaConfig();
    const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: redirectUri,
        response_type: 'code',
        state
    });

    if (configId) {
        params.set('config_id', configId);
        params.set('override_default_response_type', 'true');
    } else {
        params.set('scope', META_SCOPES.join(','));
    }

    return `https://www.facebook.com/${version}/dialog/oauth?${params.toString()}`;
};

const readMetaJson = async (response) => {
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        const message = payload?.error?.message || payload?.error_message || 'Falha ao falar com a Meta.';
        const error = new Error(message);
        error.status = response.status;
        error.payload = payload;
        throw error;
    }

    return payload;
};

const exchangeCodeForLongLivedToken = async ({ code, redirectUri }) => {
    const { appId, appSecret, version } = getMetaConfig();
    const shortLivedTokenResponse = await fetch(
        `https://graph.facebook.com/${version}/oauth/access_token?${new URLSearchParams({
            client_id: appId,
            client_secret: appSecret,
            redirect_uri: redirectUri,
            code
        }).toString()}`
    );
    const shortLivedTokenPayload = await readMetaJson(shortLivedTokenResponse);

    const longLivedTokenResponse = await fetch(
        `https://graph.facebook.com/${version}/oauth/access_token?${new URLSearchParams({
            grant_type: 'fb_exchange_token',
            client_id: appId,
            client_secret: appSecret,
            fb_exchange_token: shortLivedTokenPayload.access_token
        }).toString()}`
    );
    const longLivedTokenPayload = await readMetaJson(longLivedTokenResponse);

    return {
        accessToken: longLivedTokenPayload.access_token,
        expiresIn: Number(longLivedTokenPayload.expires_in || 0) || null
    };
};

const metaGraphGet = async (path, accessToken) => {
    const { version } = getMetaConfig();
    const response = await fetch(`https://graph.facebook.com/${version}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}`);
    return readMetaJson(response);
};

const metaGraphPost = async (path, accessToken, body) => {
    const { version } = getMetaConfig();
    const params = new URLSearchParams({
        access_token: accessToken
    });

    Object.entries(body || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            params.set(key, String(value));
        }
    });

    const response = await fetch(`https://graph.facebook.com/${version}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
    });

    return readMetaJson(response);
};

const fetchMetaProfile = async (userAccessToken) => metaGraphGet('/me?fields=id,name', userAccessToken);

const readInstagramAccountFromPagePayload = (pagePayload) => {
    const instagramAccount =
        pagePayload?.instagram_business_account ||
        pagePayload?.connected_instagram_account ||
        null;

    return {
        instagramBusinessId: instagramAccount?.id || null,
        instagramUsername: instagramAccount?.username || null,
        supportsInstagram: Boolean(instagramAccount?.id)
    };
};

const hydratePageInstagramAccount = async (page, userAccessToken) => {
    const initialInstagramData = readInstagramAccountFromPagePayload(page);

    if (initialInstagramData.supportsInstagram) {
        return initialInstagramData;
    }

    const pageFields =
        'instagram_business_account{id,username},connected_instagram_account{id,username}';

    try {
        const pagePayload = await metaGraphGet(`/${page.id}?fields=${pageFields}`, page.access_token);
        const hydratedInstagramData = readInstagramAccountFromPagePayload(pagePayload);

        if (hydratedInstagramData.supportsInstagram) {
            return hydratedInstagramData;
        }
    } catch (error) {
        // Se a leitura com token da página falhar, ainda tentamos com o token do usuário.
    }

    try {
        const pagePayload = await metaGraphGet(`/${page.id}?fields=${pageFields}`, userAccessToken);
        return readInstagramAccountFromPagePayload(pagePayload);
    } catch (error) {
        return initialInstagramData;
    }
};

const fetchMetaConnections = async (userAccessToken) => {
    const payload = await metaGraphGet(
        '/me/accounts?fields=id,name,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}&limit=100',
        userAccessToken
    );

    if (!Array.isArray(payload?.data) || !payload.data.length) {
        return [];
    }

    const normalizedConnections = await Promise.all(
        payload.data.map(async (page) => {
            const instagramData = await hydratePageInstagramAccount(page, userAccessToken);

            return {
                facebookPageId: page.id,
                facebookPageName: page.name,
                pageAccessToken: page.access_token,
                instagramBusinessId: instagramData.instagramBusinessId,
                instagramUsername: instagramData.instagramUsername,
                supportsFacebook: Boolean(page.id && page.access_token),
                supportsInstagram: instagramData.supportsInstagram
            };
        })
    );

    return normalizedConnections;
};

const publishToFacebookPage = async ({ pageId, pageAccessToken, message }) =>
    metaGraphPost(`/${pageId}/feed`, pageAccessToken, {
        message
    });

const publishToInstagramAccount = async ({ instagramBusinessId, pageAccessToken, caption, mediaUrl }) => {
    if (!mediaUrl) {
        throw new Error('Para publicar no Instagram, informe uma URL pública de imagem.');
    }

    const container = await metaGraphPost(`/${instagramBusinessId}/media`, pageAccessToken, {
        image_url: mediaUrl,
        caption
    });

    return metaGraphPost(`/${instagramBusinessId}/media_publish`, pageAccessToken, {
        creation_id: container.id
    });
};

module.exports = {
    META_PROVIDER,
    META_SCOPES,
    buildMetaOAuthUrl,
    exchangeCodeForLongLivedToken,
    fetchMetaConnections,
    fetchMetaProfile,
    publishToFacebookPage,
    publishToInstagramAccount
};
