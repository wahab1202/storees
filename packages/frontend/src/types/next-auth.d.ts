import 'next-auth'

declare module 'next-auth' {
  interface Session {
    backendJwt?: string
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      projectId?: string | null
      totpEnabled?: boolean
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    backendJwt?: string
    userId?: string
    projectId?: string | null
    totpEnabled?: boolean
  }
}
