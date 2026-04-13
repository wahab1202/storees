import { Router, Request, Response } from 'express'
import { db } from '../db/connection.js'
import { adminUsers, passwordResetTokens, oauthAccounts } from '../db/schema.js'
import { eq, and, isNull } from 'drizzle-orm'
import { rateLimiter } from '../middleware/rateLimiter.js'
import { requireAuth, type AuthenticatedRequest } from '../middleware/requireAuth.js'
import { redis } from '../services/redis.js'
import { sendEmail } from '../services/emailService.js'
import {
  hashPassword,
  verifyPassword,
  generateJwt,
  verifyJwt,
  generatePasswordResetToken,
  hashToken,
  generateTotpSecret,
  verifyTotp,
  generateQrCode,
} from '../services/authService.js'

const router = Router()

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000'

// ── POST /register ──

router.post('/register', rateLimiter(5), async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body

    if (!email || !password || !name) {
      return res.status(400).json({ success: false, error: 'Email, password, and name are required' })
    }

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' })
    }

    // Check for existing user
    const [existing] = await db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(eq(adminUsers.email, email.toLowerCase()))
      .limit(1)

    if (existing) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists' })
    }

    const passwordHash = await hashPassword(password)

    const [user] = await db
      .insert(adminUsers)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        name,
        emailVerified: true, // skip email verification for now
      })
      .returning({ id: adminUsers.id, email: adminUsers.email, name: adminUsers.name, projectId: adminUsers.projectId })

    const token = generateJwt({
      userId: user.id,
      email: user.email,
      projectId: user.projectId,
    })

    res.status(201).json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name, projectId: user.projectId },
      },
    })
  } catch (err) {
    console.error('Register error:', err)
    res.status(500).json({ success: false, error: 'Registration failed' })
  }
})

// ── POST /login ──

router.post('/login', rateLimiter(10), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' })
    }

    const [user] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, email.toLowerCase()))
      .limit(1)

    if (!user || !user.passwordHash) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' })
    }

    // If 2FA is enabled, return a temp token
    if (user.totpEnabled) {
      const tempToken = generateJwt({
        userId: user.id,
        email: user.email,
        projectId: user.projectId,
        pending2FA: true,
      })

      return res.json({
        success: true,
        data: {
          requires2FA: true,
          tempToken,
        },
      })
    }

    const token = generateJwt({
      userId: user.id,
      email: user.email,
      projectId: user.projectId,
    })

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          projectId: user.projectId,
          totpEnabled: user.totpEnabled,
        },
      },
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ success: false, error: 'Login failed' })
  }
})

// ── POST /verify-2fa ──

router.post('/verify-2fa', rateLimiter(5), async (req: Request, res: Response) => {
  try {
    const { tempToken, code } = req.body

    if (!tempToken || !code) {
      return res.status(400).json({ success: false, error: 'Temp token and TOTP code are required' })
    }

    const payload = verifyJwt(tempToken)
    if (!payload || !payload.pending2FA) {
      return res.status(401).json({ success: false, error: 'Invalid or expired verification token' })
    }

    const [user] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, payload.userId))
      .limit(1)

    if (!user || !user.totpSecret) {
      return res.status(401).json({ success: false, error: 'Invalid user or 2FA not configured' })
    }

    if (!verifyTotp(user.totpSecret, code)) {
      return res.status(401).json({ success: false, error: 'Invalid TOTP code' })
    }

    // Issue full JWT
    const token = generateJwt({
      userId: user.id,
      email: user.email,
      projectId: user.projectId,
    })

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          projectId: user.projectId,
          totpEnabled: user.totpEnabled,
        },
      },
    })
  } catch (err) {
    console.error('2FA verify error:', err)
    res.status(500).json({ success: false, error: '2FA verification failed' })
  }
})

// ── POST /forgot-password ──

router.post('/forgot-password', rateLimiter(3), async (req: Request, res: Response) => {
  try {
    const { email } = req.body

    // Always return 200 to prevent email enumeration
    if (!email) {
      return res.json({ success: true, data: { message: 'If an account exists, a reset link has been sent' } })
    }

    const [user] = await db
      .select({ id: adminUsers.id, email: adminUsers.email })
      .from(adminUsers)
      .where(eq(adminUsers.email, email.toLowerCase()))
      .limit(1)

    if (user) {
      const { token, tokenHash } = generatePasswordResetToken()

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      })

      const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`

      await sendEmail({
        to: user.email,
        subject: 'Reset your Storees password',
        html: `
          <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #1e293b; margin-bottom: 16px;">Reset your password</h2>
            <p style="color: #475569; line-height: 1.6;">
              We received a request to reset your password. Click the button below to set a new password.
              This link expires in 1 hour.
            </p>
            <a href="${resetUrl}" style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 24px 0; font-weight: 500;">
              Reset Password
            </a>
            <p style="color: #94a3b8; font-size: 14px;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        `,
      })
    }

    res.json({ success: true, data: { message: 'If an account exists, a reset link has been sent' } })
  } catch (err) {
    console.error('Forgot password error:', err)
    res.json({ success: true, data: { message: 'If an account exists, a reset link has been sent' } })
  }
})

// ── POST /reset-password ──

router.post('/reset-password', rateLimiter(5), async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, error: 'Token and new password are required' })
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' })
    }

    const tokenHash = hashToken(token)

    const [resetRecord] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
        )
      )
      .limit(1)

    if (!resetRecord) {
      return res.status(400).json({ success: false, error: 'Invalid or already used reset token' })
    }

    if (new Date(resetRecord.expiresAt) < new Date()) {
      return res.status(400).json({ success: false, error: 'Reset token has expired' })
    }

    const passwordHash = await hashPassword(newPassword)

    // Update password and mark token as used
    await Promise.all([
      db
        .update(adminUsers)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(adminUsers.id, resetRecord.userId)),
      db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, resetRecord.id)),
    ])

    res.json({ success: true, data: { message: 'Password has been reset successfully' } })
  } catch (err) {
    console.error('Reset password error:', err)
    res.status(500).json({ success: false, error: 'Password reset failed' })
  }
})

// ── POST /setup-2fa ── (requires auth)

router.post('/setup-2fa', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.adminUser!.userId
    const email = req.adminUser!.email

    const { secret, otpauthUrl } = generateTotpSecret(email)
    const qrCode = await generateQrCode(otpauthUrl)

    // Store secret temporarily in Redis (10 min TTL)
    await redis.set(`2fa-setup:${userId}`, secret, 'EX', 600)

    res.json({
      success: true,
      data: { qrCode, secret, otpauthUrl },
    })
  } catch (err) {
    console.error('2FA setup error:', err)
    res.status(500).json({ success: false, error: '2FA setup failed' })
  }
})

// ── POST /enable-2fa ── (requires auth)

router.post('/enable-2fa', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.adminUser!.userId
    const { code } = req.body

    if (!code) {
      return res.status(400).json({ success: false, error: 'TOTP code is required' })
    }

    const secret = await redis.get(`2fa-setup:${userId}`)
    if (!secret) {
      return res.status(400).json({ success: false, error: '2FA setup expired. Please start again.' })
    }

    if (!verifyTotp(secret, code)) {
      return res.status(400).json({ success: false, error: 'Invalid TOTP code. Please try again.' })
    }

    // Save secret and enable 2FA
    await db
      .update(adminUsers)
      .set({ totpSecret: secret, totpEnabled: true, updatedAt: new Date() })
      .where(eq(adminUsers.id, userId))

    // Clean up Redis
    await redis.del(`2fa-setup:${userId}`)

    res.json({ success: true, data: { message: '2FA has been enabled' } })
  } catch (err) {
    console.error('Enable 2FA error:', err)
    res.status(500).json({ success: false, error: 'Failed to enable 2FA' })
  }
})

// ── POST /disable-2fa ── (requires auth)

router.post('/disable-2fa', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.adminUser!.userId
    const { code } = req.body

    if (!code) {
      return res.status(400).json({ success: false, error: 'TOTP code is required to disable 2FA' })
    }

    const [user] = await db
      .select({ totpSecret: adminUsers.totpSecret })
      .from(adminUsers)
      .where(eq(adminUsers.id, userId))
      .limit(1)

    if (!user?.totpSecret) {
      return res.status(400).json({ success: false, error: '2FA is not enabled' })
    }

    if (!verifyTotp(user.totpSecret, code)) {
      return res.status(400).json({ success: false, error: 'Invalid TOTP code' })
    }

    await db
      .update(adminUsers)
      .set({ totpSecret: null, totpEnabled: false, updatedAt: new Date() })
      .where(eq(adminUsers.id, userId))

    res.json({ success: true, data: { message: '2FA has been disabled' } })
  } catch (err) {
    console.error('Disable 2FA error:', err)
    res.status(500).json({ success: false, error: 'Failed to disable 2FA' })
  }
})

// ── POST /oauth-callback ── (called by NextAuth during OAuth sign-in)

router.post('/oauth-callback', async (req: Request, res: Response) => {
  try {
    const { provider, providerAccountId, email, name } = req.body

    if (!provider || !providerAccountId || !email) {
      return res.status(400).json({ success: false, error: 'Provider, account ID, and email are required' })
    }

    // Check if OAuth account already exists
    const [existingOauth] = await db
      .select({ userId: oauthAccounts.userId })
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.provider, provider),
          eq(oauthAccounts.providerAccountId, providerAccountId),
        )
      )
      .limit(1)

    let userId: string

    if (existingOauth) {
      userId = existingOauth.userId
    } else {
      // Check if user with this email exists
      const [existingUser] = await db
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(eq(adminUsers.email, email.toLowerCase()))
        .limit(1)

      if (existingUser) {
        userId = existingUser.id
      } else {
        // Create new user
        const [newUser] = await db
          .insert(adminUsers)
          .values({
            email: email.toLowerCase(),
            name: name || email.split('@')[0],
            emailVerified: true,
          })
          .returning({ id: adminUsers.id })

        userId = newUser.id
      }

      // Link OAuth account
      await db.insert(oauthAccounts).values({
        userId,
        provider,
        providerAccountId,
      })
    }

    // Get full user data
    const [user] = await db
      .select({
        id: adminUsers.id,
        email: adminUsers.email,
        name: adminUsers.name,
        projectId: adminUsers.projectId,
        totpEnabled: adminUsers.totpEnabled,
      })
      .from(adminUsers)
      .where(eq(adminUsers.id, userId))
      .limit(1)

    const token = generateJwt({
      userId: user.id,
      email: user.email,
      projectId: user.projectId,
    })

    res.json({
      success: true,
      data: {
        token,
        user,
      },
    })
  } catch (err) {
    console.error('OAuth callback error:', err)
    res.status(500).json({ success: false, error: 'OAuth authentication failed' })
  }
})

// ── GET /me ── (requires auth)

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.adminUser!.userId

    const [user] = await db
      .select({
        id: adminUsers.id,
        email: adminUsers.email,
        name: adminUsers.name,
        role: adminUsers.role,
        projectId: adminUsers.projectId,
        emailVerified: adminUsers.emailVerified,
        totpEnabled: adminUsers.totpEnabled,
        createdAt: adminUsers.createdAt,
      })
      .from(adminUsers)
      .where(eq(adminUsers.id, userId))
      .limit(1)

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' })
    }

    // Get linked OAuth providers
    const linkedAccounts = await db
      .select({ provider: oauthAccounts.provider })
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, userId))

    res.json({
      success: true,
      data: {
        ...user,
        linkedProviders: linkedAccounts.map(a => a.provider),
      },
    })
  } catch (err) {
    console.error('Get me error:', err)
    res.status(500).json({ success: false, error: 'Failed to get user data' })
  }
})

// ── POST /change-password ── (requires auth)

router.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.adminUser!.userId
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current and new passwords are required' })
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' })
    }

    const [user] = await db
      .select({ passwordHash: adminUsers.passwordHash })
      .from(adminUsers)
      .where(eq(adminUsers.id, userId))
      .limit(1)

    if (!user?.passwordHash) {
      return res.status(400).json({ success: false, error: 'Account uses OAuth login — no password to change' })
    }

    const valid = await verifyPassword(currentPassword, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' })
    }

    const passwordHash = await hashPassword(newPassword)
    await db
      .update(adminUsers)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(adminUsers.id, userId))

    res.json({ success: true, data: { message: 'Password changed successfully' } })
  } catch (err) {
    console.error('Change password error:', err)
    res.status(500).json({ success: false, error: 'Failed to change password' })
  }
})

export default router
