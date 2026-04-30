const { createErrorResponse, json } = require('../_lib/http');
const {
    disconnectSocialProvider,
    fetchAuthenticatedUser,
    listSocialConnectionsForUser
} = require('../_lib/supabase');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }

    const user = await fetchAuthenticatedUser(req.headers.authorization);

    if (!user) {
        return json(res, 401, createErrorResponse('UNAUTHORIZED', 'Faça login para gerenciar redes sociais.'));
    }

    try {
        if (req.method === 'GET') {
            const connections = await listSocialConnectionsForUser(user.id);
            return json(res, 200, {
                status: 'success',
                data: connections
            });
        }

        if (req.method === 'DELETE') {
            const provider = req.query?.provider || 'meta';
            await disconnectSocialProvider(user.id, provider);

            return json(res, 200, {
                status: 'success',
                data: {
                    disconnected: true,
                    provider
                }
            });
        }

        return json(res, 405, createErrorResponse('METHOD_NOT_ALLOWED', 'Método não permitido.'));
    } catch (error) {
        return json(
            res,
            500,
            createErrorResponse(
                'SOCIAL_CONNECTIONS_ERROR',
                error instanceof Error ? error.message : 'Não foi possível gerenciar as conexões sociais.'
            )
        );
    }
};
