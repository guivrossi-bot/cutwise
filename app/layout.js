import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata = {
  title: 'Cutwise — Cutting Technology Selector',
  description: 'Find the right cutting technology for your material, tolerance, and budget.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}