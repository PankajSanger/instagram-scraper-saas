const { verifyToken } = require('../services/auth');

function requireAuth(req, res, sendJson) {
  const secret = process.env.JWT_SECRET || 'dev-secret';
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    sendJson(res, 401, { error: 'missing_token' });
    return null;
  }
  const payload = verifyToken(token, secret);
  if (!payload || !payload.userId) {
    sendJson(res, 401, { error: 'invalid_token' });
    return null;
  }
  return payload;
}

module.exports = { requireAuth };
