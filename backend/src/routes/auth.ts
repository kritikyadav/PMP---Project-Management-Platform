import { Router } from 'express';
import { ConfidentialClientApplication, Configuration } from '@azure/msal-node';
import jwt, { SignOptions } from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { db } from '../db';
import axios from 'axios';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { requireAuth, requireRole, requireProjectAccess } from '../middleware/rbac';
import { sendPasswordResetEmail } from '../utils/email';

export const authRouter = Router();

// Pre-computed bcrypt hash used only for timing-safe dummy comparisons.
const DUMMY_HASH = '$2b$12$aaaaaaaaaaaaaaaaaaaaauBHwTkvbo7N6iMNMFWCrg3dWN4dxXA6';

// Rate limiter: 5 attempts per 15 minutes per IP, 15-minute lockout
const credentialsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  // Return a JSON error body so the frontend can display the message
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// Refresh limiter: 30 attempts per 15 minutes per IP to prevent spamming session rotation
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many session refresh requests. Please try again later.' });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const msalConfig: Configuration = {
  auth: {
    clientId: config.azure.clientId,
    authority: `https://login.microsoftonline.com/${config.azure.tenantId}`,
    clientSecret: config.azure.clientSecret,
  },
};

const cca = new ConfidentialClientApplication(msalConfig);

function setTokensAndCookies(res: any, user: { id: string; email: string; role: string; name?: string }) {
  const signOptions: SignOptions = { expiresIn: config.jwt.expiresIn as SignOptions['expiresIn'] };
  const refreshSignOptions: SignOptions = { expiresIn: config.jwt.refreshExpiresIn as SignOptions['expiresIn'] };

  const accessToken = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name || '' }, config.jwt.secret, signOptions);
  const refreshToken = jwt.sign({ id: user.id }, config.jwt.refreshSecret, refreshSignOptions);

  // const isProd = config.nodeEnv === 'production';
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    // secure: isProd,
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000 // 15 mins
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    // secure: isProd,
    sameSite: 'strict',
    path: '/auth/refresh',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  return { accessToken, refreshToken };
}

authRouter.get('/login', async (req, res) => {
  const authCodeUrlParameters = {
    scopes: ['User.Read'],
    redirectUri: config.azure.redirectUri,
  };

  try {
    const response = await cca.getAuthCodeUrl(authCodeUrlParameters);
    res.redirect(response);
  } catch (error) {
    console.error('Error generating auth code url:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.get('/callback', async (req, res) => {
  const tokenRequest = {
    code: req.query.code as string,
    scopes: ['User.Read'],
    redirectUri: config.azure.redirectUri,
  };

  try {
    const response = await cca.acquireTokenByCode(tokenRequest);
    const accessToken = response.accessToken;

    const graphResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    const email = (graphResponse.data.mail || graphResponse.data.userPrincipalName).toLowerCase();

    const userResult = await db.query('SELECT id, name, role, is_active FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      res.redirect(`${config.cors.origin}/auth/error?message=account_not_provisioned`);
      return;
    }
    
    const user = userResult.rows[0];
    if (!user.is_active) {
      res.redirect(`${config.cors.origin}/auth/error?message=account_deactivated`);
      return;
    }

    // Generate short-lived auth code
    const code = crypto.randomBytes(32).toString('hex');
    await db.query(`INSERT INTO auth_codes (code, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 minute')`, [code, user.id]);

    res.redirect(`${config.cors.origin}/auth/success?code=${code}`);
  } catch (error) {
    console.error('Error in auth callback:', error);
    res.redirect(`${config.cors.origin}/auth/error?message=auth_failed`);
  }
});

authRouter.post('/exchange', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing code' });

  try {
    const result = await db.query(`
      DELETE FROM auth_codes 
      WHERE code = $1 AND expires_at > NOW() 
      RETURNING user_id
    `, [code]);

    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid or expired code' });

    const user_id = result.rows[0].user_id;
    const userResult = await db.query('SELECT id, email, name, role FROM users WHERE id = $1', [user_id]);
    if (userResult.rows.length === 0) return res.status(401).json({ error: 'User not found' });

    const user = userResult.rows[0];
    const tokens = setTokensAndCookies(res, user);
    const refreshToken = tokens.refreshToken;
    
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    await db.query(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')`, [user.id, tokenHash]);

    res.json({ user, token: tokens.accessToken, accessToken: tokens.accessToken });
  } catch (error) {
    console.error('Exchange error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

authRouter.post('/credentials', credentialsLimiter, async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  try {
    const userResult = await db.query(
      'SELECT id, email, name, role, is_active, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      await bcrypt.compare(password, DUMMY_HASH);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = userResult.rows[0];

    if (!user.is_active || !user.password_hash) {
      await bcrypt.compare(password, user.password_hash ?? DUMMY_HASH);
      res.status(401).json({ error: 'Invalid credentials or account deactivated' });
      return;
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const tokens = setTokensAndCookies(res, user);
    const refreshToken = tokens.refreshToken;
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    await db.query(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')`, [user.id, tokenHash]);

    res.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name }, token: tokens.accessToken, accessToken: tokens.accessToken });
  } catch (error) {
    console.error('Error in credentials login:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.post('/refresh', refreshLimiter, async (req, res) => {
  const { refreshToken } = req.cookies;
  if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

  try {
    const payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as { id: string };
    
    // Check DB
    const tokensResult = await db.query('SELECT id, token_hash FROM refresh_tokens WHERE user_id = $1 AND expires_at > NOW()', [payload.id]);
    
    let isValid = false;
    let tokenId = null;
    for (const row of tokensResult.rows) {
      if (await bcrypt.compare(refreshToken, row.token_hash)) {
        isValid = true;
        tokenId = row.id;
        break;
      }
    }

    if (!isValid) throw new Error('Token revoked or invalid');

    const userResult = await db.query('SELECT id, email, name, role FROM users WHERE id = $1', [payload.id]);
    if (userResult.rows.length === 0) throw new Error('User not found');
    const user = userResult.rows[0];

    const tokens = setTokensAndCookies(res, user);
    const newRefreshToken = tokens.refreshToken;
    const newTokenHash = await bcrypt.hash(newRefreshToken, 10);
    
    // Rotate token in DB
    await db.query('UPDATE refresh_tokens SET token_hash = $1, expires_at = NOW() + INTERVAL \'7 days\' WHERE id = $2', [newTokenHash, tokenId]);

    res.json({ user, token: tokens.accessToken, accessToken: tokens.accessToken });
  } catch (error) {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken', { path: '/auth/refresh' });
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

authRouter.post('/logout', async (req, res) => {
  const { refreshToken } = req.cookies;
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken', { path: '/auth/refresh' });
  
  if (refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as { id: string };
      // Delete specific token matching hash
      const tokensResult = await db.query('SELECT id, token_hash FROM refresh_tokens WHERE user_id = $1', [payload.id]);
      for (const row of tokensResult.rows) {
        if (await bcrypt.compare(refreshToken, row.token_hash)) {
          await db.query('DELETE FROM refresh_tokens WHERE id = $1', [row.id]);
          break;
        }
      }
    } catch {
      // Ignore
    }
  }
  res.json({ success: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user, accessToken: req.cookies.accessToken });
});

// Rate limiter: 5 forgot-password requests per hour per IP
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many password reset requests. Please try again in 1 hour.' });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /auth/forgot-password
 * Generates a hashed reset token, stores it in DB, and emails the reset link.
 * Always returns 200 to prevent user enumeration.
 */
authRouter.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body as { email?: string };

  if (!email) {
    res.status(400).json({ error: 'email is required' });
    return;
  }

  try {
    const userResult = await db.query(
      'SELECT id, email, is_active FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    // Silent return if user not found — prevents user enumeration
    if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
      res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
      return;
    }

    const user = userResult.rows[0];

    // Generate a secure random token and store its SHA-256 hash
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.query(
      'UPDATE users SET password_reset_token = $1, password_reset_expires_at = $2 WHERE id = $3',
      [tokenHash, expiresAt, user.id]
    );

    const resetUrl = `${config.app.frontendUrl}/auth/reset-password?token=${rawToken}`;

    // Send email (fire-and-forget — don't let email failure break the response)
    sendPasswordResetEmail(user.email, resetUrl).catch((err) => {
      console.error('[PASSWORD RESET] Email send failed:', err);
    });

    console.log(`[PASSWORD RESET] Reset link for ${email}: ${resetUrl}`);

    res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (error) {
    console.error('Error in forgot-password:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /auth/validate-reset-token?token=...
 * Validates a reset token without consuming it.
 * Returns { valid: true } or { valid: false }.
 */
authRouter.get('/validate-reset-token', async (req, res) => {
  const { token } = req.query as { token?: string };

  if (!token) {
    res.json({ valid: false });
    return;
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await db.query(
      'SELECT id, password_reset_expires_at FROM users WHERE password_reset_token = $1',
      [tokenHash]
    );

    if (result.rows.length === 0) {
      res.json({ valid: false });
      return;
    }

    const user = result.rows[0];
    if (!user.password_reset_expires_at || new Date(user.password_reset_expires_at) < new Date()) {
      // Token expired — clean it up
      await db.query(
        'UPDATE users SET password_reset_token = NULL, password_reset_expires_at = NULL WHERE id = $1',
        [user.id]
      );
      res.json({ valid: false });
      return;
    }

    res.json({ valid: true });
  } catch (error) {
    console.error('Error in validate-reset-token:', error);
    res.json({ valid: false });
  }
});

/**
 * POST /auth/reset-password
 * Verifies the raw token, sets the new hashed password, and clears the reset token.
 */
authRouter.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };

  if (!token || !newPassword) {
    res.status(400).json({ error: 'token and newPassword are required' });
    return;
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await db.query(
      'SELECT id, password_reset_expires_at FROM users WHERE password_reset_token = $1',
      [tokenHash]
    );

    if (result.rows.length === 0) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
      return;
    }

    const user = result.rows[0];
    if (!user.password_reset_expires_at || new Date(user.password_reset_expires_at) < new Date()) {
      await db.query(
        'UPDATE users SET password_reset_token = NULL, password_reset_expires_at = NULL WHERE id = $1',
        [user.id]
      );
      res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await db.query(
      `UPDATE users
         SET password_hash              = $1,
             password_reset_token       = NULL,
             password_reset_expires_at  = NULL
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    res.json({ message: 'Password has been reset successfully. You can now log in.' });
  } catch (error) {
    console.error('Error in reset-password:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
