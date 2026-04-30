module.exports = (_req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
        JSON.stringify({
            status: 'success',
            message: 'Postara API operacional.',
            timestamp: new Date().toISOString()
        })
    );
};

