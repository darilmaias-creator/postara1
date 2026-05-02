const { getBaseUrl, createErrorResponse, json } = require('../../_lib/http');
const { buildMetaOAuthUrl, META_CONNECTION_TARGETS } = require('../../_lib/meta');
const { signState } = require('../../_lib/crypto');
const { fetchAuthenticatedUser } = require('../../_lib/supabase');

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
        return json(res, 401, createErrorResponse('UNAUTHORIZED', 'Faça login antes de conectar suas redes sociais.'));
    }

    try {
        const baseUrl = process.env.POSTARA_PUBLIC_APP_URL || getBaseUrl(req);
        const redirectUri = process.env.META_REDIRECT_URI || `${baseUrl}/api/social/meta/callback`;
        const requestedTarget =
            req.query?.target === META_CONNECTION_TARGETS.instagram
                ? META_CONNECTION_TARGETS.instagram
                : META_CONNECTION_TARGETS.facebook;
        const state = signState({
            userId: user.id,
            timestamp: Date.now(),
            target: requestedTarget
        });

        return json(res, 200, {
            status: 'success',
            data: {
                authorizationUrl: buildMetaOAuthUrl({
                    redirectUri,
                    state,
                    target: requestedTarget
                })
            }
        });
    } catch (error) {
        return json(
            res,
            500,
            createErrorResponse(
                'SOCIAL_CONNECT_ERROR',
                error instanceof Error ? error.message : 'Não foi possível iniciar a conexão com a Meta.'
            )
        );
    }
};
