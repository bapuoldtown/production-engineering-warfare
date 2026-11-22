import { promises as fs } from "node:fs";
import path from "node:path";

export type Mission = { slug:string; title:string; area:string; number:string; summary:string };
const labs = path.resolve(process.cwd(),"../labs");
const safe = (s:string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
export async function getMissions():Promise<Mission[]> {
 const entries = await fs.readdir(labs,{withFileTypes:true});
 const result = await Promise.all(entries.filter(e=>e.isDirectory()&&safe(e.name)).map(async e=>{
  let md="";try{md=await fs.readFile(path.join(labs,e.name,"README.md"),"utf8")}catch{}
  const title=(md.match(/^#\s+(.+)$/m)?.[1]||e.name.replace(/-/g," ")).replace(/\*\*/g,"");
  const summary=(md.split(/\n\s*\n/).slice(1).find(s=>!s.trim().startsWith("#")&&!s.trim().startsWith("```")&&s.trim())||"Explore the failure, investigation, root cause and recovery.").replace(/\[[^\]]+\]\([^)]*\)/g,"").replace(/[*`>#]/g,"").trim().slice(0,210);
  const area=e.name.includes("postgresql")?"Database":e.name.includes("api-latency")?"Backend":"Kubernetes";
  return {slug:e.name,title,area,number:e.name.split("-")[0],summary};
 }));
 return result.sort((a,b)=>a.number.localeCompare(b.number)||a.slug.localeCompare(b.slug));
}
export async function getReadme(slug:string) {
 if(!safe(slug))return null;
 try{return await fs.readFile(path.join(labs,slug,"README.md"),"utf8")}catch{return null}
}
