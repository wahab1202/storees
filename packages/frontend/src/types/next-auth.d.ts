import 'next-auth'

type AdminRole = 'admin' | 'manager' | 'agent'

declare module 'next-auth' {
  interface Session {
    backendJwt?: string
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      projectId?: string | null
      role?: AdminRole
      agentId?: string | null
      totpEnabled?: boolean
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    backendJwt?: string
    userId?: string
    projectId?: string | null
    role?: AdminRole
    agentId?: string | null
    totpEnabled?: boolean
  }
}
