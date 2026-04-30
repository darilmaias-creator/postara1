const DEFAULT_SUPABASE_URL = 'https://knktwfccotaudwhxpyma.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_v4ZJWa-hq3YRU3AGAeOV2Q_sSW4pM7F';

const getSupabaseUrl = () => process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
const getSupabasePublishableKey = () => process.env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

const getSupabaseServiceRoleKey = () => {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
        throw new Error('A variável SUPABASE_SERVICE_ROLE_KEY não foi configurada.');
    }

    return serviceRoleKey;
};

const fetchAuthenticatedUser = async (authorizationHeader) => {
    const supabaseUrl = getSupabaseUrl();
    const publishableKey = getSupabasePublishableKey();

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
    return {
        id: authUser.id,
        email: authUser.email,
        name: authUser.user_metadata?.name || null
    };
};

const supabaseAdminFetch = async (path, options = {}) => {
    const serviceRoleKey = getSupabaseServiceRoleKey();
    const response = await fetch(`${getSupabaseUrl()}${path}`, {
        method: options.method || 'GET',
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : await response.text().catch(() => null);

    if (!response.ok) {
        const message =
            payload?.message ||
            payload?.error_description ||
            payload?.error ||
            `Supabase respondeu com status ${response.status}.`;
        const error = new Error(message);
        error.status = response.status;
        error.payload = payload;
        throw error;
    }

    return payload;
};

const upsertSocialAuthAccount = async ({
    userId,
    provider,
    providerUserId,
    providerUserName,
    encryptedAccessToken,
    tokenExpiresAt,
    grantedScopes
}) => {
    const payload = await supabaseAdminFetch(
        '/rest/v1/social_auth_accounts?on_conflict=user_id,provider&select=id,user_id,provider',
        {
            method: 'POST',
            headers: {
                Prefer: 'resolution=merge-duplicates,return=representation'
            },
            body: [
                {
                    user_id: userId,
                    provider,
                    provider_user_id: providerUserId,
                    provider_user_name: providerUserName,
                    encrypted_access_token: encryptedAccessToken,
                    token_expires_at: tokenExpiresAt,
                    granted_scopes: grantedScopes
                }
            ]
        }
    );

    return payload?.[0] || null;
};

const replaceSocialConnections = async ({ userId, provider, authAccountId, connections }) => {
    await supabaseAdminFetch(
        `/rest/v1/social_connections?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(
            provider
        )}`,
        {
            method: 'DELETE',
            headers: {
                Prefer: 'return=minimal'
            }
        }
    );

    if (!connections.length) {
        return [];
    }

    return supabaseAdminFetch('/rest/v1/social_connections?select=*', {
        method: 'POST',
        headers: {
            Prefer: 'return=representation'
        },
        body: connections.map((connection) => ({
            user_id: userId,
            auth_account_id: authAccountId,
            provider,
            facebook_page_id: connection.facebookPageId,
            facebook_page_name: connection.facebookPageName,
            encrypted_page_access_token: connection.encryptedPageAccessToken,
            instagram_business_id: connection.instagramBusinessId,
            instagram_username: connection.instagramUsername,
            supports_facebook: connection.supportsFacebook,
            supports_instagram: connection.supportsInstagram,
            last_synced_at: new Date().toISOString()
        }))
    });
};

const listSocialConnectionsForUser = async (userId) =>
    supabaseAdminFetch(
        `/rest/v1/social_connections?user_id=eq.${encodeURIComponent(
            userId
        )}&select=id,provider,facebook_page_id,facebook_page_name,instagram_business_id,instagram_username,supports_facebook,supports_instagram,created_at,updated_at,last_synced_at&order=facebook_page_name.asc`
    );

const getSocialConnectionForUser = async (userId, connectionId) => {
    const payload = await supabaseAdminFetch(
        `/rest/v1/social_connections?id=eq.${encodeURIComponent(connectionId)}&user_id=eq.${encodeURIComponent(
            userId
        )}&select=*`
    );

    return payload?.[0] || null;
};

const getSocialAuthAccountForUser = async (userId, provider) => {
    const payload = await supabaseAdminFetch(
        `/rest/v1/social_auth_accounts?user_id=eq.${encodeURIComponent(
            userId
        )}&provider=eq.${encodeURIComponent(provider)}&select=*`
    );

    return payload?.[0] || null;
};

const disconnectSocialProvider = async (userId, provider) =>
    supabaseAdminFetch(
        `/rest/v1/social_auth_accounts?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(
            provider
        )}`,
        {
            method: 'DELETE',
            headers: {
                Prefer: 'return=minimal'
            }
        }
    );

const createSocialPublication = async (publication) =>
    supabaseAdminFetch('/rest/v1/social_publications', {
        method: 'POST',
        headers: {
            Prefer: 'return=minimal'
        },
        body: [publication]
    });

module.exports = {
    createSocialPublication,
    disconnectSocialProvider,
    fetchAuthenticatedUser,
    getSocialAuthAccountForUser,
    getSocialConnectionForUser,
    getSupabasePublishableKey,
    getSupabaseServiceRoleKey,
    getSupabaseUrl,
    listSocialConnectionsForUser,
    replaceSocialConnections,
    supabaseAdminFetch,
    upsertSocialAuthAccount
};
