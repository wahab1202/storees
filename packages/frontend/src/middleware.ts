import { auth } from '@/lib/auth'

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl

  // Public routes — no auth required
  const publicRoutes = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-2fa', '/oauth/shopify/callback']
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  if (!isLoggedIn && !isPublicRoute) {
    const loginUrl = new URL('/login', req.nextUrl)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return Response.redirect(loginUrl)
  }

  // Redirect logged-in users away from auth pages
  if (isLoggedIn && isPublicRoute) {
    return Response.redirect(new URL('/dashboard', req.nextUrl))
  }
})

export const config = {
  matcher: [
    // Match all routes except Next.js internals and static files
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
