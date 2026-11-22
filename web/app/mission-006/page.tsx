"use client";
import {useState} from "react";
import Link from "next/link";

const evidence = [
  {label:"Pod watch",body:"12s  READY 1/1  Running  RESTARTS 0\n50s  READY 1/1  Running  RESTARTS 1\n95s  READY 1/1  Running  RESTARTS 2",insight:"Same Pod name, increasing restarts: kubelet is restarting the container, not the Deployment creating a new Pod."},
  {label:"Kubelet events",body:'Warning Unhealthy (x15): Liveness probe failed: connect: connection refused\nNormal Killing (x5): Container slow-api failed liveness probe, will be restarted',insight:"The events confirm the immediate cause: repeated liveness failures trigger container restarts."},
  {label:"Recovery",body:"Pod slow-api-7bfcf5cb9-75grf\nREADY 1/1  STATUS Running  RESTARTS 0\nDeployment: 1 desired | 1 updated | 1 available | 0 unavailable",insight:"Revision 2 rolled out successfully with startup, readiness and liveness probes."}
];
const questions=[
 {q:"At 10 seconds, Python is still in its 45-second initialization. What happens when kubelet requests /health?",options:["HTTP 200 because Python is running","Connection refused because the server is not listening yet","HTTP 503 generated automatically by Python"],correct:1,why:"The HTTPServer is created after the sleep, so port 8000 is not accepting connections."},
 {q:"The Pod name stays the same, but RESTARTS rises from 0 to 2. Who is restarting the container?",options:["The Deployment controller creates a new Pod for each failed probe","Kubelet restarts the container inside the existing Pod","The Service restarts its endpoints"],correct:1,why:"The kubelet manages container lifecycle and reacts to failed liveness probes. A Deployment maintains desired Pod replicas."},
 {q:"The app takes 45 seconds to start. What is the best way to protect initialization without a fixed 60-second liveness delay?",options:["Add a startupProbe with enough failure budget","Increase replicas from one to two","Disable all health probes forever"],correct:0,why:"A startup probe gates liveness and readiness until actual startup success, while still allowing a bounded restart if startup is stuck."},
 {q:"The app is running but cannot safely receive traffic. Which probe controls Service endpoint eligibility?",options:["Liveness","Readiness","Startup"],correct:1,why:"Readiness marks a Pod unavailable for new traffic through normal Service routing. A readiness failure does not restart it."}
];
export default function Mission006Interactive(){
 const [stage,setStage]=useState(0);
 const [answers,setAnswers]=useState<Record<number,number>>({});
 const [submitted,setSubmitted]=useState<Record<number,boolean>>({});
 const [tab,setTab]=useState(0);
 const [delay,setDelay]=useState(5);
 const [period,setPeriod]=useState(5);
 const [threshold,setThreshold]=useState(3);
 const [startup,setStartup]=useState(false);
 const [copied,setCopied]=useState(false);
 const firstFailure=delay+period*(threshold-1);
 const likelyRestart=firstFailure<45&&!startup;
 const score=questions.filter((q,i)=>submitted[i]&&answers[i]===q.correct).length;
 const stages=["Observe","Investigate","Experiment","Recover","Reflect"];
 const broken=`livenessProbe:
  httpGet:
    path: /health
    port: 8000
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 3`;
 const fixed=`startupProbe:
  httpGet: { path: /health, port: 8000 }
  periodSeconds: 5
  failureThreshold: 12
readinessProbe:
  httpGet: { path: /health, port: 8000 }
  periodSeconds: 5
  failureThreshold: 2
livenessProbe:
  httpGet: { path: /health, port: 8000 }
  periodSeconds: 5
  failureThreshold: 3`;
 const question=questions[Math.min(stage,3)];
 const choice=answers[stage];
 const done=submitted[stage];
 return <main className="interactive-mission">
 <Link href="/" className="back">← ALL MISSIONS</Link>
 <div className="eyebrow">GUIDED INCIDENT LAB / MISSION 006</div>
 <h1>CrashLoopBackOff: <em>the 45-second trap.</em></h1>
 <p className="mission-lead">A Python API needs 45 seconds to initialize. Kubernetes keeps restarting it. You are the on-call engineer. Inspect the evidence, make decisions, and recover the workload.</p>
 <div className="mission-note">Based on a real kind-cluster lab performed on 22 Nov 2026. The simulator is educational; it does not execute commands in your cluster.</div>
 <nav className="mission-steps" aria-label="Mission stages">{stages.map((s,i)=><button key={s} type="button" onClick={()=>setStage(i)} className={stage===i?"selected":""}><span>{String(i+1).padStart(2,"0")}</span>{s}</button>)}</nav>
 {stage===0&&<section className="mission-panel"><div className="eyebrow">01 / THE SYMPTOM</div><h2>Running. Ready. Restarting. How?</h2><p>Watch the real observations from the broken deployment. The Pod showed <strong>1/1 Ready</strong> even before the app could listen because there was no readiness probe.</p><pre>{evidence[0].body}</pre><p>Application behavior: <code>time.sleep(45)</code> runs <strong>before</strong> <code>HTTPServer(...).serve_forever()</code>.</p></section>}
 {stage===1&&<section className="mission-panel"><div className="eyebrow">02 / FORENSICS</div><h2>Read the evidence before changing YAML.</h2><div className="mission-tabs">{evidence.map((e,i)=><button type="button" key={e.label} className={tab===i?"selected":""} onClick={()=>setTab(i)}>{e.label}</button>)}</div><pre>{evidence[tab].body}</pre><p>{evidence[tab].insight}</p><p className="muted">Commands to reproduce locally: <code>kubectl -n warfare-006 describe pod &lt;pod-name&gt;</code> and <code>kubectl -n warfare-006 logs &lt;pod-name&gt; --previous</code>.</p></section>}
 {stage===2&&<section className="mission-panel"><div className="eyebrow">03 / PROBE PLAYGROUND</div><h2>Can your probe outlast startup?</h2><p>Move the controls and predict the outcome. This is a simplified timeline, not a kubelet scheduling emulator.</p><div className="probe-controls"><label>Initial delay: <strong>{delay}s</strong><input aria-label="Initial delay" type="range" min="0" max="75" step="5" value={delay} onChange={e=>setDelay(Number(e.target.value))}/></label><label>Period: <strong>{period}s</strong><input aria-label="Probe period" type="range" min="5" max="20" step="5" value={period} onChange={e=>setPeriod(Number(e.target.value))}/></label><label>Failure threshold: <strong>{threshold}</strong><input aria-label="Failure threshold" type="range" min="1" max="12" value={threshold} onChange={e=>setThreshold(Number(e.target.value))}/></label></div><label className="mission-toggle"><input type="checkbox" checked={startup} onChange={e=>setStartup(e.target.checked)}/> Add a startup probe (5s period, 12 failures)</label><div className="mission-timeline"><div className="mission-timefill" style={{width:"75%"}}/><span>0s</span><span>App listens at 45s</span><span>60s</span></div><div className={likelyRestart?"mission-result danger":"mission-result safe"}><strong>{likelyRestart?"Likely restart before initialization":"Startup can complete under these assumptions"}</strong><p>{startup?"Startup probing gates liveness until /health succeeds, assuming the startup failure budget is sufficient.":`Approximate third-probe decision at ${firstFailure}s; the application starts listening around 45s.`}</p></div><p className="muted">Actual kubelet probe scheduling, response times, termination grace, and backoff can change observed timings.</p></section>}
 {stage===3&&<section className="mission-panel"><div className="eyebrow">04 / THE RECOVERY</div><h2>Compare the broken and repaired probes.</h2><div className="mission-compare"><div><h3>Broken</h3><pre>{broken}</pre></div><div><h3>Recovered</h3><pre>{fixed}</pre></div></div><p><strong>Verified on kind:</strong> new Pod <code>slow-api-7bfcf5cb9-75grf</code>, <code>1/1 Running</code>, <code>0 restarts</code>, Deployment revision 2 with one available replica.</p><a className="outline" href="https://github.com/bapuoldtown/production-engineering-warfare">View the source repository ↗</a></section>}
 {stage===4&&<section className="mission-panel"><div className="eyebrow">05 / STAFF ENGINEER REFLECTION</div><h2>Fix the system. Defend the tradeoff.</h2><p><strong>Startup:</strong> Am I initialized? <strong>Readiness:</strong> Can I serve traffic? <strong>Liveness:</strong> Should kubelet restart me?</p><div className="mission-lessons"><p>✓ A Pod can be Ready too early if no readiness probe exists.</p><p>✓ Liveness checks should not kill a legitimately slow-starting application.</p><p>✓ A shared database outage can make every replica NotReady; choose dependencies carefully.</p><p>✓ An HTTP 200 health endpoint does not necessarily detect a deadlock in another component.</p></div><h3>Your decision record</h3><p>Knowledge checks answered correctly: <strong>{score} / 4</strong>. Your answers are kept in this browser session only.</p><button className="btn" type="button" onClick={()=>{setStage(0);setAnswers({});setSubmitted({});setCopied(false)}}>Replay mission ↻</button></section>}
 {stage<4&&<section className="mission-panel mission-question"><div className="eyebrow">YOUR DECISION / NO SPOILERS</div><h3>{question.q}</h3><div className="mission-options">{question.options.map((option,i)=><button type="button" disabled={!!done} className={choice===i?"chosen":""} onClick={()=>setAnswers(a=>({...a,[stage]:i}))} key={i}><b>{String.fromCharCode(65+i)}</b>{option}</button>)}</div>{!done?<button type="button" className="btn" disabled={choice===undefined} onClick={()=>setSubmitted(s=>({...s,[stage]:true}))}>Submit diagnosis</button>:<div className="mission-feedback"><strong>{choice===question.correct?"Correct decision ✓":"Not quite — examine the evidence"}</strong><p>{question.why}</p></div>}</section>}
 <div className="mission-navigation"><button type="button" className="outline" disabled={stage===0} onClick={()=>setStage(s=>Math.max(0,s-1))}>← Previous</button><button type="button" className="btn" disabled={stage<4&&!submitted[stage]} onClick={()=>setStage(s=>Math.min(4,s+1))}>{stage===4?"Mission reviewed ✓":"Next stage →"}</button></div>
 </main>;
}
