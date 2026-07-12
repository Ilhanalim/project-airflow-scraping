const crypto = require('crypto');

const getRequestApiKey = (req) => {
  const headerKey = req.get('x-api-key');

  if (headerKey) {
    return headerKey;
  }

  const authorization = req.get('authorization');
  if (authorization && authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length);
  }

  return null;
};

const isSameSecret = (actual, expected) => {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

const requireApiKey = (req, res, next) => {
  const expectedApiKey = process.env.API_KEY;

  if (!expectedApiKey) {
    return res.status(500).json({ error: 'API key is not configured' });
  }

  const requestApiKey = getRequestApiKey(req);

  if (!requestApiKey || !isSameSecret(requestApiKey, expectedApiKey)) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }

  return next();
};

module.exports = requireApiKey;
