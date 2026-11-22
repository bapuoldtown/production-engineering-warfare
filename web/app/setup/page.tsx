import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {promises as fs} from "node:fs";
import path from "node:path";
export default async function Setup(){
 const content=await fs.readFile(path.resolve(process.cwd(),"../infra/kind/SCRIPT-WALKTHROUGH.md"),"utf8");
 const base="https://github.com/bapuoldtown/production-engineering-warfare/blob/main/infra/kind/";
 return <main className="detail"><Link href="/" className="back">← ALL MISSIONS</Link><div className="eyebrow">LOCAL LAB / WINDOWS + DOCKER + KIND</div><h1>Understand your lab environment.</h1><p className="muted">Every PowerShell script explained: what it creates, what it stops, what it destroys, and how to verify it.</p><article className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:({href,children})=><a href={href?.startsWith("http")?href:base+(href||"")} target="_blank" rel="noreferrer">{children}</a>}}>{content}</ReactMarkdown></article><Link href="/" className="back">← ALL MISSIONS</Link></main>;
}
