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

const fetchMetaPermissions = async (userAccessToken) => metaGraphGet('/me/permissions', userAccessToken);

const fetchMetaAccountsDebug = async (userAccessToken) => {
    const payload = await metaGraphGet(
        '/me/accounts?fields=id,name,tasks,category,instagram_business_account{id,username},connected_instagram_account{id,username}&limit=100',
        userAccessToken
    );

    return Array.isArray(payload?.data)
        ? payload.data.map((page) => ({
              id: page.id,
              name: page.name,
              category: page.category || null,
              tasks: Array.isArray(page.tasks) ? page.tasks : [],
              instagramBusinessAccount: page.instagram_business_account || null,
              connectedInstagramAccount: page.connected_instagram_account || null
          }))
        : [];
};

const fetchMetaConnections = async (userAccessToken) => {
    const payload = await metaGraphGet(
        '/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100',
        userAccessToken
    );

    return Array.isArray(payload?.data)
        ? payload.data.map((page) => ({
              facebookPageId: page.id,
              facebookPageName: page.name,
              pageAccessToken: page.access_token,
              instagramBusinessId: page.instagram_business_account?.id || null,
              instagramUsername: page.instagram_business_account?.username || null,
              supportsFacebook: Boolean(page.id && page.access_token),
              supportsInstagram: Boolean(page.instagram_business_account?.id)
          }))
        : [];
};

const publishToFacebookPage = async ({ pageId, pageAccessToken, message }) =>
    metaGraphPost(`/${pageId}/feed`, pageAccessToken, {
        message
    });

const publishToInstagramAccount = async ({ instagramBusinessId, pageAccessToken, caption, mediaUrl }) => {
    if (!mediaUrl) {
        throw new Error('Para publicar no Instagram, envie uma imagem antes de continuar.');
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
    fetchMetaAccountsDebug,
    fetchMetaConnections,
    fetchMetaPermissions,
    fetchMetaProfile,
    publishToFacebookPage,
    publishToInstagramAccount
};
