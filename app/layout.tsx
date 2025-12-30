import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { AuthProvider } from '@/components/auth-provider'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const geist = Geist({ 
  subsets: ["latin"],
  variable: "--font-sans",
});
const geistMono = Geist_Mono({ 
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: 'Speech to Text | Local Transcription',
  description: 'Transform your audio files into accurate text transcriptions using local Whisper AI. Support for multiple languages and fast processing.',
  generator: 'Next.js',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geist.variable} ${geistMono.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <div className="modern-bg min-h-screen">
              {/* Neon glow effects */}
              <div className="neon-glow neon-glow-orange w-[500px] h-[500px] -top-32 -left-32" />
              <div className="neon-glow neon-glow-blue w-[400px] h-[400px] top-1/2 -right-24" />
              <div className="neon-glow neon-glow-purple w-[350px] h-[350px] -bottom-20 left-1/3" />
              
              {/* Main content */}
              <div className="content-layer">
                {children}
              </div>
            </div>
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
