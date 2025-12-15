import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SantotoBench",
  description: "Agent decision viewer in the cider house simulator",
  icons: {
    icon: "/santotobench_logo.png",
    apple: "/santotobench_logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} font-sans antialiased`}>
        {/* Navbar */}
        <nav className="sticky top-0 z-50 border-b border-pizarra-200/50 bg-white/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link
                href="/"
                className="flex items-center gap-3 cursor-pointer group"
              >
                <div className="w-11 h-11 rounded-xl bg-white shadow-lg shadow-sidra-500/20 group-hover:shadow-sidra-500/40 transition-shadow flex items-center justify-center p-1.5">
                  <Image
                    src="/santotobench_logo.png"
                    alt="SantotoBench"
                    width={40}
                    height={40}
                    priority
                  />
                </div>
                <span className="font-bold text-lg text-pizarra-800 group-hover:text-sidra-600 transition-colors">
                  SantotoBench
                </span>
              </Link>

              <div className="flex items-center gap-3">
                <Link
                  href="/"
                  className="px-3 py-2 rounded-lg text-sm font-medium text-pizarra-600 hover:text-sidra-600 hover:bg-sidra-50 transition-colors cursor-pointer"
                >
                  Leaderboard
                </Link>
                <Link
                  href="/about"
                  className="px-3 py-2 rounded-lg text-sm font-medium text-pizarra-600 hover:text-sidra-600 hover:bg-sidra-50 transition-colors cursor-pointer"
                >
                  About
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* Main content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-pizarra-200/50 bg-white/50 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-sm text-pizarra-500 text-center md:text-left">
                <Image
                  src="/santotobench_logo.png"
                  alt="SantotoBench"
                  width={28}
                  height={28}
                  className="cursor-pointer"
                />
                <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
                  <span className="font-semibold text-pizarra-700">
                    SantotoBench
                  </span>
                  <span className="text-pizarra-400">
                    Built with ❤️ and the invaluable help
                    of Cursor by{" "}
                    <Link
                      href="https://www.linkedin.com/in/echeverriajuan/"
                      className="text-pizarra-600 hover:text-sidra-600 underline decoration-dotted"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Juan Echeverria
                    </Link>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
