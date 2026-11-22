import type {Metadata} from "next";
import "./globals.css";
export const metadata:Metadata={title:"Production Engineering Warfare",description:"Reproduce. Diagnose. Recover. Production engineering field missions."};
export default function RootLayout({children}:{children:React.ReactNode}) {
 return <html lang="en"><body><div className="shell"><header className="nav"><a href="/" className="brand"><span className="logo">PW</span>PRODUCTION <b>ENGINEERING</b> WARFARE</a><div className="navlinks"><a className="navlink" href="/about">ABOUT / CONNECT</a><a className="navlink" href="https://github.com/bapuoldtown/production-engineering-warfare">GITHUB ↗</a></div></header>{children}<footer>Built by <a href="/about">Guru Prasad Pattnayak</a> for engineers who learn by breaking and fixing real systems. <a href="https://github.com/bapuoldtown/production-engineering-warfare">Open source ↗</a></footer></div></body></html>
}
