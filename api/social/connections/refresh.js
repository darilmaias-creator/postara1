const { decryptText, encryptText } = require('../../_lib/crypto');
const { createErrorResponse, json } = require('../../_lib/http');
const { META_PROVIDER, fetchMetaConnections } = require('../../_lib/meta');
const {
    fetchAuthenticatedUser,
    getSocialAuthAccountForUser,
    listSocialConnectionsForUser,
    replaceSocialConnections
} = require('../../_lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }

    if (req.method !== 'POST') {
        return json(res, 405, createErrorResponse('METHOD_NOT_ALLOWED', 'Método não permitido.'));
    }

    const user = await fetchAuthenticatedUser(req.headers.authorization);

    if (!user) {
        return json(res, 401, createErrorResponse('UNAUTHORIZED', 'Faça login para atualizar as conexões.'));
    }

    try {
        const authAccount = await getSocialAuthAccountForUser(user.id, META_PROVIDER);

        if (!authAccount) {
            return json(
                res,
                404,
                createErrorResponse('SOCIAL_NOT_CONNECTED', 'Nenhuma conta Meta está conectada para este usuário.')
            );
        }

        const userAccessToken = decryptText(authAccount.encrypted_access_token);
        const connections = await fetchMetaConnections(userAccessToken);

        await replaceSocialConnections({
            userId: user.id,
            provider: META_PROVIDER,
            authAccountId: authAccount.id,
            connections: connections.map((connection) => ({
                ...connection,
                encryptedPageAccessToken: encryptText(connection.pageAccessToken)
            }))
        });

        const refreshedConnections = await listSocialConnectionsForUser(user.id);

        return json(res, 200, {
            status: 'success',
            data: refreshedConnections
        });
    } catch (error) {
        return json(
            res,
            500,
            createErrorResponse(
                'SOCIAL_REFRESH_ERROR',
                error instanceof Error ? error.message : 'Não foi possível atualizar as conexões Meta.'
            )
        );
    }
};
