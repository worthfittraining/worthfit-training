import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-green-50 to-white p-8">
      <div className="max-w-2xl text-center">
        <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 text-sm font-semibold px-4 py-2 rounded-full mb-6">
          💪 WorthFit Training
        </div>
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          Your AI Nutrition Coach
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Personalized meal plans, macro tracking, and 24/7 nutrition guidance — built around you.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/sign-up"
            className="bg-green-600 text-white px-8 py-3 rounded-full text-lg font-semibold hover:bg-green-700 transition"
          >
            Get Started
          </Link>
          <Link
            href="/sign-in"
            className="border-2 border-green-600 text-green-600 px-8 py-3 rounded-full text-lg font-semibold hover:bg-green-50 transition"
          >
            Sign In
          </Link>
        </div>
      </div>
    </main>
  )
}
