import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import GitHub from 'next-auth/providers/github'
import Credentials from 'next-auth/providers/credentials'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
    Credentials({
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' },
      },
      async authorize(credentials) {
        const password = credentials.password as string

        // Handle 2FA JWT pass-through (after verify-2fa page)
        if (password.startsWith('__2FA_JWT__:')) {
          const jwt = password.replace('__2FA_JWT__:', '')
          // Verify the JWT is valid by calling /me
          const meRes = await fetch(`${API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${jwt}` },
          })
          const meData = await meRes.json()
          if (!meRes.ok || !meData.success) {
            throw new Error('Invalid session')
          }
          return {
            id: meData.data.id,
            email: meData.data.email,
            name: meData.data.name,
            backendJwt: jwt,
            projectId: meData.data.projectId,
            totpEnabled: meData.data.totpEnabled,
          }
        }

        const res = await fetch(`${API_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: credentials.email,
            password,
          }),
        })

        const data = await res.json()

        if (!res.ok || !data.success) {
          throw new Error(data.error ?? 'Invalid credentials')
        }

        // If 2FA is required, pass it through as a special error
        if (data.data.requires2FA) {
          throw new Error(`2FA_REQUIRED:${data.data.tempToken}`)
        }

        return {
          id: data.data.user.id,
          email: data.data.user.email,
          name: data.data.user.name,
          backendJwt: data.data.token,
          projectId: data.data.user.projectId,
          totpEnabled: data.data.user.totpEnabled,
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async signIn({ user, account }) {
      // For OAuth providers, call backend to create/link user and get JWT
      if (account?.provider && account.provider !== 'credentials') {
        try {
          const res = await fetch(`${API_URL}/api/auth/oauth-callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              email: user.email,
              name: user.name,
            }),
          })

          const data = await res.json()
          if (!data.success) return false

          // Attach backend JWT and project data to user object
          ;(user as Record<string, unknown>).backendJwt = data.data.token
          ;(user as Record<string, unknown>).projectId = data.data.user.projectId
          ;(user as Record<string, unknown>).totpEnabled = data.data.user.totpEnabled
          ;(user as Record<string, unknown>).id = data.data.user.id
        } catch {
          return false
        }
      }
      return true
    },
    async jwt({ token, user }) {
      // On initial sign-in, copy user data to JWT token
      if (user) {
        token.backendJwt = (user as Record<string, unknown>).backendJwt as string
        token.userId = user.id
        token.projectId = (user as Record<string, unknown>).projectId as string | null
        token.totpEnabled = (user as Record<string, unknown>).totpEnabled as boolean
      }
      return token
    },
    async session({ session, token }) {
      // Expose backend JWT and user data to client
      ;(session as unknown as Record<string, unknown>).backendJwt = token.backendJwt
      if (session.user) {
        session.user.id = token.userId as string
        ;(session.user as unknown as Record<string, unknown>).projectId = token.projectId
        ;(session.user as unknown as Record<string, unknown>).totpEnabled = token.totpEnabled
      }
      return session
    },
  },
})
