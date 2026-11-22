import Link from "next/link";
import {notFound} from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {getMissions,getReadme} from "../../../lib/missions";
export async function generateStaticParams(){return (await getMissions()).map(m=>({slug:m.slug}));}
export const dynamicParams=false;
export default async function Page({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;const [missions,md]=await Promise.all([getMissions(),getReadme(slug)]);const mission=missions.find(m=>m.slug===slug);if(!mission||!md)notFound();
 const base="https://github.com/bapuoldtown/production-engineering-warfare";
 return <main className="detail"><Link href="/" className="back">← ALL MISSIONS</Link><div className="eyebrow">FIELD MANUAL / {mission.area.toUpperCase()} / MISSION {mission.number}</div><h1>{mission.title}</h1><div className="actions"><a className="btn" href={base+"/tree/main/labs/"+slug}>Run lab on GitHub ↗</a><a className="outline" href={base+"/tree/main/infra/kind"}>Cluster setup ↗</a></div><article className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{a:({href,children})=><a href={href?.startsWith("http")||href?.startsWith("#")?href:base+"/blob/main/labs/"+slug+"/"+(href||"").replace(/^\.\//,"")} target="_blank" rel="noreferrer">{children}</a>}}>{md}</ReactMarkdown></article><Link href="/" className="back">← ALL MISSIONS</Link></main>
}
