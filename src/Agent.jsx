import React, { useState } from 'react';
import { ArrowRight, ArrowUp, BookOpen, Check, ChevronRight, CircleCheck, CornerDownLeft, History, Keyboard, LoaderCircle, MousePointer2, Plus, RotateCcw, Sparkles, Workflow } from 'lucide-react';
import { actionIcons, FileIcon, IconButton, base } from './ui.jsx';
import { guides } from './lib/guides.js';

const labels = { read: 'Read request', edit: 'Guided edit', create: 'Create file', command: 'Terminal command', done: 'Session complete' };

function RequestCard({ session, onContinue, onReturn, blocked, active, working, pendingDeletion, needsFolder }) {
  const a = session.action;
  const Icon = actionIcons[a.kind];
  if (a.kind === 'done') return <div className="done-card"><CircleCheck size={20}/><strong>{a.title}</strong><p>{a.reason}</p></div>;
  const isWriting = a.kind === 'edit' || (a.kind === 'create' && session.created);
  return <section className={'request-card ' + (a.kind === 'read' ? 'read-card' : '')}>
    <div className="request-type"><Icon size={15}/><strong>{labels[a.kind]}</strong></div>
    {a.path && <div className="request-file"><FileIcon path={a.path}/><span>{a.path}</span>{a.startLine && <small>L{a.startLine}{a.endLine > a.startLine && '–' + a.endLine}</small>}</div>}
    <p>{a.reason}</p>
    {blocked ? <div className="card-instruction error-text">{blocked}</div> :
    a.kind === 'read' ? session.opened ? <button className="continue-button" disabled={working} onClick={onContinue}>Continue <ArrowRight size={14}/></button>
      : <div className="card-instruction"><MousePointer2/><span>Click the green file in Explorer.</span></div>
    : isWriting ? <><div className="card-instruction"><Keyboard/><span>{pendingDeletion ? <>Press <kbd>Backspace</kbd> to clear the red selection. </> : 'Follow the hint or type your own version. '}Finish with <code>//DONE</code> on its own line.</span></div>
      {active !== a.path && <button className="text-button" onClick={onReturn}>Return to file <ArrowRight size={13}/></button>}</>
    : a.kind === 'create' ? <div className="card-instruction"><MousePointer2/><span>{needsFolder ? <>Select the green folder in Explorer and use <b>New folder</b> to build the requested path.</> : <>Select the green folder in Explorer, choose <b>New file</b>, and enter <code>{base(a.path)}</code>.</>}</span></div>
    : <div className="card-instruction"><CornerDownLeft/><span>Type the command in Terminal. Press Enter to run your version.</span></div>}
  </section>;
}

export default function Agent({ session, workspace, active, busy, blocked, pendingDeletion, onNew, onHistory, onSubmit, onContinue, onRetry, onReturn }) {
  const [prompt, setPrompt] = useState('');
  const isStarter = session?.source === 'starter';
  const finished = session?.action?.kind === 'done';
  const steps = !session ? [] : isStarter ? guides[session.key].steps : [
    ...session.history.map(h => h.action.title), ...(session.action && !finished ? [session.action.title] : [])];
  const index = finished ? steps.length : isStarter ? session.action?.index ?? session.history.length : session?.history.length || 0;
  const parentPath = session?.action?.path?.split('/').slice(0, -1).join('/');
  const needsFolder = parentPath && !workspace.files.some(f => f.directory && f.path === parentPath);
  async function send() {
    if (!prompt.trim() || busy) return;
    if (await onSubmit(prompt.trim())) setPrompt('');
  }
  return <aside className="agent-panel" aria-label="Agent panel">
    <div className="agent-heading"><div className="agent-emblem"><Sparkles size={15}/></div><strong>Agent</strong><div className="heading-tools">
      <IconButton label="Session activity" onClick={onHistory}><History size={16}/></IconButton>
      <IconButton label="New guide" onClick={onNew}><Plus size={17}/></IconButton></div></div>
    <div className="agent-scroll">
      {session ? <><div className="guide-eyebrow"><span className="eyebrow-rule"/>{isStarter ? 'Guided session' : 'Agent session'}</div>
      <h1>{session.goal}</h1>{session.description && <p className="session-description">{session.description}</p>}
      {steps.length > 0 && <section className="plan"><div className="plan-heading"><span>Session plan</span><span className="plan-count">{Math.min(index, steps.length)}<i>/</i>{steps.length}</span></div>
        <div className="progress-segments" aria-hidden="true">{steps.map((_, i) => <i className={i < index ? 'complete' : i === index ? 'current' : ''} key={i}/>)}</div>
        <ol className="step-list">{steps.map((step, i) => <li key={i} className={i < index ? 'complete' : i === index ? 'current' : ''}>
          <span className="step-num">{i < index ? <Check size={11}/> : i + 1}</span><span>{step}</span>{i === index && <span className="step-arrow"><ChevronRight size={13}/></span>}
        </li>)}</ol></section>}
      {session.error ? <div className="request-card"><strong>Guide paused</strong><p role="alert">{session.error}</p><button className="continue-button" onClick={onRetry}><RotateCcw size={14}/> Retry proposal</button></div>
        : session.action ? <RequestCard session={session} active={active} blocked={blocked} working={busy} pendingDeletion={pendingDeletion} needsFolder={needsFolder} onContinue={onContinue} onReturn={onReturn}/>
        : <div className="planning"><LoaderCircle className="spin" size={15}/>Preparing the next step…</div>}
      {finished && <button className="new-guide-button" onClick={onNew}>Start another guide <ArrowRight size={14}/></button>}
      </> : <div className="agent-empty"><Sparkles/><h1>Start a guided change</h1><p>Describe what you want to change in this workspace.</p>{workspace.starter && <button className="continue-button" onClick={onNew}><BookOpen size={15}/>Browse starter guides</button>}</div>}
    </div>
    <div className="composer-area"><form className="composer" onSubmit={e => { e.preventDefault(); send(); }}>
      <textarea aria-label="Ask the agent for a change" placeholder="Ask for a change…" value={prompt} rows="2" maxLength={4000}
        onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}/>
      <div className="composer-bottom"><span className="mode-label"><Workflow size={13}/>{workspace.model || 'Local guides'}</span>
        <button className="send" aria-label="Send request" disabled={!prompt.trim() || busy}><ArrowUp size={16}/></button></div>
    </form></div>
  </aside>;
}
