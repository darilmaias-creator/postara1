const { decryptText } = require('../../_lib/crypto');
const { createErrorResponse, json } = require('../../_lib/http');
const {
    META_PROVIDER,
    fetchMetaAccountsDebug,
    fetchMetaConnections,
    fetchMetaPermissions,
    fetchMetaProfile
} = require('../../_lib/meta');
const { fetchAuthenticatedUser, getSocialAuthAccountForUser } = require('../../_lib/supabase');

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
        const authAccount = await getSocialAuthAccountForUser(user.id, META_PROVIDER);

        if (!authAccount) {
            return json(
                res,
                404,
                createErrorResponse('SOCIAL_NOT_CONNECTED', 'Conecte a Meta primeiro para gerar o diagnóstico.')
            );
        }

        const userAccessToken = decryptText(authAccount.encrypted_access_token);
        const [profile, permissionsPayload, rawAccounts, normalizedConnections] = await Promise.all([
            fetchMetaProfile(userAccessToken),
            fetchMetaPermissions(userAccessToken),
            fetchMetaAccountsDebug(userAccessToken),
            fetchMetaConnections(userAccessToken)
        ]);

        return json(res, 200, {
            status: 'success',
            data: {
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
                    instagramConnectionCount: normalizedConnections.filter((connection) => connection.supportsInstagram)
                        .length
                }
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
