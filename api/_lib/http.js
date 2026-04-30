const json = (res, statusCode, payload) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
};

const redirect = (res, location, statusCode = 302) => {
    res.statusCode = statusCode;
    res.setHeader('Location', location);
    res.end();
};

const parseBody = (body) => {
    if (!body) {
        return {};
    }

    if (typeof body === 'object') {
        return body;
    }

    try {
        return JSON.parse(body);
    } catch {
        return null;
    }
};

const getBaseUrl = (req) => {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${protocol}://${host}`;
};

const createErrorResponse = (code, message, details) => ({
    status: 'error',
    error: {
        code,
        message,
        ...(details ? { details } : {})
    }
});

module.exports = {
    createErrorResponse,
    getBaseUrl,
    json,
    parseBody,
    redirect
};
