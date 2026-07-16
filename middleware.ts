import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/subscribe(.*)',
  '/terms(.*)',
  '/api/playbook-sync',
  '/api/stripe/webhook',
])

export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth()
  const { pathname } = request.nextUrl

  // After sign-up, send new users straight to onboarding so they can't skip it.
  // After sign-in, send returning users to dashboard (SubscriptionGate handles any edge cases).
  if (userId && (pathname === '/' || pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up'))) {
    const dest = pathname.startsWith('/sign-up') ? '/onboarding' : '/dashboard'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}