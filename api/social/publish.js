const { decryptText } = require('../_lib/crypto');
const { createErrorResponse, json, parseBody } = require('../_lib/http');
const {
    META_PROVIDER,
    publishToFacebookPage,
    publishToInstagramAccount
} = require('../_lib/meta');
const {
    createSocialPublication,
    fetchAuthenticatedUser,
    getSocialConnectionForUser
} = require('../_lib/supabase');

const normalizePublishErrorMessage = (error) => {
    const rawMessage = error instanceof Error ? error.message : 'Não foi possível publicar o conteúdo agora.';

    if (rawMessage.includes('pages_read_engagement')) {
        return 'A Meta reconheceu a página, mas não liberou a permissão necessária para o Postara publicar no Facebook nesta configuração.';
    }

    if (rawMessage.includes('pages_manage_posts')) {
        return 'A Meta ainda não concedeu ao Postara a permissão para publicar posts nessa página do Facebook.';
    }

    if (rawMessage.includes('instagram_content_publish')) {
        return 'A Meta ainda não liberou a permissão de publicação no Instagram para esta conexão.';
    }

    return rawMessage;
};

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
        return json(res, 401, createErrorResponse('UNAUTHORIZED', 'Faça login antes de publicar em redes sociais.'));
    }

    const body = parseBody(req.body);

    if (!body || typeof body !== 'object') {
        return json(res, 400, createErrorResponse('BAD_REQUEST', 'O corpo da requisição precisa ser um JSON válido.'));
    }

    const connectionId = typeof body.connectionId === 'string' ? body.connectionId.trim() : '';
    const captionText = typeof body.captionText === 'string' ? body.captionText.trim() : '';
    const mediaUrl = typeof body.mediaUrl === 'string' ? body.mediaUrl.trim() : '';
    const targets = Array.isArray(body.targets) ? body.targets.filter((target) => typeof target === 'string') : [];
    const generationHistoryId =
        typeof body.generationHistoryId === 'string' && body.generationHistoryId.trim()
            ? body.generationHistoryId.trim()
            : null;

    if (!connectionId) {
        return json(res, 400, createErrorResponse('BAD_REQUEST', 'Escolha uma conta conectada para publicar.'));
    }

    if (!captionText) {
        return json(res, 400, createErrorResponse('BAD_REQUEST', 'O texto selecionado para postagem está vazio.'));
    }

    if (!targets.length) {
        return json(res, 400, createErrorResponse('BAD_REQUEST', 'Selecione pelo menos um destino de publicação.'));
    }

    try {
        const connection = await getSocialConnectionForUser(user.id, connectionId);

        if (!connection || connection.provider !== META_PROVIDER) {
            return json(
                res,
                404,
                createErrorResponse('SOCIAL_CONNECTION_NOT_FOUND', 'A conta social escolhida não foi encontrada.')
            );
        }

        const pageAccessToken = decryptText(connection.encrypted_page_access_token);
        const publications = [];

        if (targets.includes('facebook')) {
            if (!connection.supports_facebook) {
                throw new Error('Essa conexão não possui uma página do Facebook apta para postagem.');
            }

            const facebookResponse = await publishToFacebookPage({
                pageId: connection.facebook_page_id,
                pageAccessToken,
                message: captionText,
                mediaUrl: mediaUrl || undefined
            });

            publications.push({
                network: 'facebook',
                status: 'success',
                response: facebookResponse
            });

            await createSocialPublication({
                user_id: user.id,
                connection_id: connection.id,
                generation_history_id: generationHistoryId,
                destination_network: 'facebook',
                status: 'success',
                caption_text: captionText,
                media_url: mediaUrl || null,
                response_json: facebookResponse
            });
        }

        if (targets.includes('instagram')) {
            if (!connection.supports_instagram || !connection.instagram_business_id) {
                throw new Error('Essa conexão não possui uma conta do Instagram profissional vinculada.');
            }

            if (!mediaUrl) {
                throw new Error('Para publicar no Instagram, envie uma imagem antes de continuar.');
            }

            const instagramResponse = await publishToInstagramAccount({
                instagramBusinessId: connection.instagram_business_id,
                pageAccessToken,
                caption: captionText,
                mediaUrl
            });

            publications.push({
                network: 'instagram',
                status: 'success',
                response: instagramResponse
            });

            await createSocialPublication({
                user_id: user.id,
                connection_id: connection.id,
                generation_history_id: generationHistoryId,
                destination_network: 'instagram',
                status: 'success',
                caption_text: captionText,
                media_url: mediaUrl,
                response_json: instagramResponse
            });
        }

        return json(res, 200, {
            status: 'success',
            data: {
                connectionId: connection.id,
                publications
            }
        });
    } catch (error) {
        const normalizedMessage = normalizePublishErrorMessage(error);

        if (connectionId && captionText) {
            await createSocialPublication({
                user_id: user.id,
                connection_id: connectionId,
                generation_history_id: generationHistoryId,
                destination_network: targets.includes('instagram') && !targets.includes('facebook') ? 'instagram' : 'facebook',
                status: 'error',
                caption_text: captionText,
                media_url: mediaUrl || null,
                response_json: {
                    message: normalizedMessage
                }
            }).catch(() => null);
        }

        return json(
            res,
            500,
            createErrorResponse(
                'SOCIAL_PUBLISH_ERROR',
                normalizedMessage
            )
        );
    }
};
