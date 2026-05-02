const { decryptText } = require('../../_lib/crypto');
const { createErrorResponse, json } = require('../../_lib/http');
const {
    META_INSTAGRAM_PROVIDER,
    META_PROVIDER,
    fetchMetaAccountsDebug,
    fetchMetaConnections,
    fetchMetaPermissions,
    fetchMetaProfile
} = require('../../_lib/meta');
const { fetchAuthenticatedUser, getSocialAuthAccountForUser } = require('../../_lib/supabase');

const loadProviderDebugSnapshot = async (authAccount, providerLabel) => {
    const userAccessToken = decryptText(authAccount.encrypted_access_token);
    const [profile, permissionsPayload, rawAccounts, normalizedConnections] = await Promise.all([
        fetchMetaProfile(userAccessToken),
        fetchMetaPermissions(userAccessToken),
        fetchMetaAccountsDebug(userAccessToken),
        fetchMetaConnections(userAccessToken)
    ]);

    return {
        providerLabel,
        profile: {
            id: profile?.id || null,
            name: profile?.name || null
        },
        grantedPermissions: Array.isArray(permissionsPayload?.data)
            ? permissionsPayload.data.map((permission) => ({
                  permission: permission.permission,
                  status: permission.status
              }))
            : [],
        rawAccounts,
        normalizedConnections,
        summary: {
            rawAccountCount: rawAccounts.length,
            normalizedConnectionCount: normalizedConnections.length,
            instagramConnectionCount: normalizedConnections.filter((connection) => connection.supportsInstagram).length
        }
    };
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }

    if (req.method !== 'GET') {
        return json(res, 405, createErrorResponse('METHOD_NOT_ALLOWED', 'Método não permitido.'));
    }

    const user = await fetchAuthenticatedUser(req.headers.authorization);

    if (!user) {
        return json(res, 401, createErrorResponse('UNAUTHORIZED', 'Faça login para diagnosticar a conexão Meta.'));
    }

    try {
        const [facebookAuthAccount, instagramAuthAccount] = await Promise.all([
            getSocialAuthAccountForUser(user.id, META_PROVIDER),
            getSocialAuthAccountForUser(user.id, META_INSTAGRAM_PROVIDER)
        ]);

        const availableAccounts = [
            facebookAuthAccount ? { authAccount: facebookAuthAccount, label: 'facebook' } : null,
            instagramAuthAccount ? { authAccount: instagramAuthAccount, label: 'instagram' } : null
        ].filter(Boolean);

        if (!availableAccounts.length) {
            return json(
                res,
                404,
                createErrorResponse('SOCIAL_NOT_CONNECTED', 'Conecte a Meta primeiro para gerar o diagnóstico.')
            );
        }

        const providerSnapshots = await Promise.all(
            availableAccounts.map(({ authAccount, label }) => loadProviderDebugSnapshot(authAccount, label))
        );
        const primarySnapshot = providerSnapshots[0];

        return json(res, 200, {
            status: 'success',
            data: {
                profile: primarySnapshot.profile,
                grantedPermissions: primarySnapshot.grantedPermissions,
                rawAccounts: primarySnapshot.rawAccounts,
                normalizedConnections: primarySnapshot.normalizedConnections,
                summary: primarySnapshot.summary,
                providerSnapshots
            }
        });
    } catch (error) {
        return json(
            res,
            500,
            createErrorResponse(
                'SOCIAL_META_DEBUG_ERROR',
                error instanceof Error ? error.message : 'Não foi possível gerar o diagnóstico da Meta.'
            )
        );
    }
};
