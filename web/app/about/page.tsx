import Link from "next/link";
export const metadata={title:"About Guru Prasad Pattnayak | Production Engineering Warfare",description:"Meet the engineer behind Production Engineering Warfare and join a welcoming, practical learning community."};
export default function About(){return <main className="detail about">
<Link href="/" className="back">← BACK TO MISSIONS</Link>
<div className="eyebrow">THE HUMAN BEHIND THE INCIDENTS</div>
<h1>Engineering is hard.<br/><span className="accent">Learning it shouldn't feel lonely.</span></h1>
<p className="about-lead">I'm <strong>Guru Prasad Pattnayak</strong>, a backend and platform engineer who believes complex production systems become understandable when we explore them one failure at a time.</p>
<section className="about-panel"><div className="eyebrow">WHY I BUILT THIS</div><h2>Less memorizing. More understanding.</h2><p>We've all faced explanations that skip the difficult part: what actually happened, which signal matters, and how to decide what to do next. Production Engineering Warfare is my attempt to make that journey clearer, kinder and more practical.</p><p>Here we intentionally reproduce failures in local labs, investigate with real commands, compare tradeoffs, and document what the evidence does—and does not—prove. It's okay to be confused at first. The goal is to develop the confidence to ask better questions.</p></section>
<section className="about-principles"><h2>What you can expect here</h2><div className="about-grid">
<div><span>01 /</span><h3>Start with a real problem</h3><p>Every mission opens with a production scenario and a concrete objective.</p></div>
<div><span>02 /</span><h3>Learn the why</h3><p>Understand what each command, script, Kubernetes controller and failure signal means.</p></div>
<div><span>03 /</span><h3>Experiment without shame</h3><p>Break things safely in a local environment, observe the evidence and learn from surprises.</p></div>
<div><span>04 /</span><h3>Grow together</h3><p>Share corrections, ask questions and suggest missions that would help other engineers.</p></div>
</div></section>
<section className="about-panel"><div className="eyebrow">LET'S CONNECT</div><h2>Have a question or an idea?</h2><p>Whether you're learning Kubernetes, debugging Python APIs, studying distributed systems, or preparing for a technical interview, you're welcome here. You don't need to know everything before joining the conversation.</p><div className="actions"><a className="btn" href="https://github.com/bapuoldtown" target="_blank" rel="noopener noreferrer">Connect with me on GitHub ↗</a><a className="outline" href="https://github.com/bapuoldtown/production-engineering-warfare/issues/new" target="_blank" rel="noopener noreferrer">Ask a question or suggest a mission ↗</a></div><p className="about-note">GitHub Issues are public. Please don't share credentials, personal information, or confidential production details.</p></section>
<p className="about-signoff">Let's make production engineering easier to understand—one mission, one experiment, one lesson at a time. <strong>— Guru</strong></p>
</main>}