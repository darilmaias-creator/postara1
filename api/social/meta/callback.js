const { encryptText, verifyState } = require('../../_lib/crypto');
const { createErrorResponse, getBaseUrl, json, redirect } = require('../../_lib/http');
const {
    META_PROVIDER,
    exchangeCodeForLongLivedToken,
    fetchMetaConnections,
    fetchMetaProfile
} = require('../../_lib/meta');
const {
    listSocialConnectionsForUser,
    replaceSocialConnections,
    upsertSocialAuthAccount
} = require('../../_lib/supabase');

const buildAppRedirect = (req, status, message) => {
    const baseUrl = process.env.POSTARA_PUBLIC_APP_URL || getBaseUrl(req);
    const params = new URLSearchParams({
        social_status: status,
        social_message: message
    });
    return `${baseUrl}/?${params.toString()}`;
};

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        return json(res, 405, createErrorResponse('METHOD_NOT_ALLOWED', 'Método não permitido.'));
    }

    const code = req.query?.code;
    const stateToken = req.query?.state;
    const errorReason = req.query?.error_reason || req.query?.error;

    if (errorReason) {
        return redirect(res, buildAppRedirect(req, 'error', 'A conexão com a Meta foi cancelada ou recusada.'));
    }

    if (!code || !stateToken) {
        return redirect(res, buildAppRedirect(req, 'error', 'A Meta não retornou os dados necessários para conectar.'));
    }

    try {
        const verifiedState = verifyState(stateToken);

        if (!verifiedState?.userId || !verifiedState?.timestamp || Date.now() - verifiedState.timestamp > 15 * 60 * 1000) {
            throw new Error('A tentativa de conexão expirou. Tente conectar novamente.');
        }

        const baseUrl = process.env.POSTARA_PUBLIC_APP_URL || getBaseUrl(req);
        const redirectUri = process.env.META_REDIRECT_URI || `${baseUrl}/api/social/meta/callback`;
        const tokenBundle = await exchangeCodeForLongLivedToken({
            code,
            redirectUri
        });
        const metaProfile = await fetchMetaProfile(tokenBundle.accessToken);
        const rawConnections = await fetchMetaConnections(tokenBundle.accessToken);

        const authAccount = await upsertSocialAuthAccount({
            userId: verifiedState.userId,
            provider: META_PROVIDER,
            providerUserId: metaProfile.id,
            providerUserName: metaProfile.name,
            encryptedAccessToken: encryptText(tokenBundle.accessToken),
            tokenExpiresAt: tokenBundle.expiresIn
                ? new Date(Date.now() + tokenBundle.expiresIn * 1000).toISOString()
                : null,
            grantedScopes: []
        });

        await replaceSocialConnections({
            userId: verifiedState.userId,
            provider: META_PROVIDER,
            authAccountId: authAccount.id,
            connections: rawConnections.map((connection) => ({
                ...connection,
                encryptedPageAccessToken: encryptText(connection.pageAccessToken)
            }))
        });

        const connections = await listSocialConnectionsForUser(verifiedState.userId);
        const hasInstagram = connections.some((connection) => connection.supports_instagram);
        const connectionCount = connections.length;
        const summaryMessage = hasInstagram
            ? `Conexão Meta concluída com ${connectionCount} página(s) e Instagram disponível.`
            : `Conexão Meta concluída com ${connectionCount} página(s).`;

        return redirect(res, buildAppRedirect(req, 'connected', summaryMessage));
    } catch (error) {
        return redirect(
            res,
            buildAppRedirect(
                req,
                'error',
                error instanceof Error ? error.message : 'Não foi possível finalizar a conexão com a Meta.'
            )
        );
    }
};
