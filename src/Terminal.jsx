import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Eraser, Minus, Square, SquareTerminal } from 'lucide-react';
import { terminal } from './lib/api.js';
import { alignTyped, visibleChar } from './lib/guidance.js';
import { IconButton } from './ui.jsx';

function CommandHint({ value, target, cursor }) {
  const { next, errors } = target == null ? { next: '', errors: [] } : alignTyped(value, target);
  const parts = [];
  let pos = 0;
  for (const [from, to] of errors) {
    parts.push(value.slice(pos, from), <span key={from} className="typed-difference">{value.slice(from, to)}</span>);
    pos = to;
  }
  parts.push(value.slice(pos));
  return <span className="terminal-overlay" aria-hidden="true">{parts}{next && cursor === value.length && <span className="char-hint" data-char={next}>{visibleChar(next)}</span>}</span>;
}

export default function Terminal({ workspace, guide, shown, tab, setTab, onHide, onResult, onRefresh, events }) {
  const [entries, setEntries] = useState([]);
  const [cwd, setCwd] = useState('');
  const [value, setValue] = useState('');
  const [cursor, setCursor] = useState(0);
  const [running, setRunning] = useState(false);
  const history = useRef([]);
  const index = useRef(0);
  const prior = useRef('');
  const abort = useRef(null);
  const input = useRef(null);
  const body = useRef(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const guideToken = guide?.token;
  useEffect(() => {
    if (guideToken) {
      setValue(''); setCursor(0);
      if (guide.fromRoot) setCwd('');
    }
  }, [guideToken]);
  useEffect(() => {
    if (guideToken && shown && tab === 'terminal') input.current?.focus();
  }, [guideToken, shown, tab]);
  useEffect(() => {
    if (shown && tab === 'terminal') body.current?.scrollTo(0, body.current.scrollHeight);
  }, [entries, running, shown, tab]);
  useEffect(() => () => abort.current?.abort(), []);
  function recall(direction) {
    if (index.current === history.current.length) prior.current = value;
    index.current = Math.max(0, Math.min(history.current.length, index.current + direction));
    const next = history.current[index.current] ?? prior.current;
    setValue(next); setCursor(next.length);
    requestAnimationFrame(() => input.current?.setSelectionRange(next.length, next.length));
  }
  async function run(e) {
    e.preventDefault();
    if (!value.trim() || abort.current) return;
    const command = value;
    const id = crypto.randomUUID();
    const controller = new AbortController();
    abort.current = controller;
    history.current.push(command); index.current = history.current.length;
    setRunning(true); setValue(''); setCursor(0); setScrollLeft(0);
    setEntries(prev => [...prev.slice(-99), { id, cwd, command, output: '' }]);
    let output = '';
    let exitCode = 1;
    const append = text => {
      output += text;
      setEntries(prev => prev.map(entry => entry.id === id ? { ...entry, output } : entry));
    };
    try {
      await terminal(command, cwd, controller.signal, event => {
        if (event.text) append(event.text);
        if (event.exitCode != null) { exitCode = event.exitCode; setCwd(event.cwd); }
      });
    } catch (err) { append(controller.signal.aborted ? '^C\n' : err.message + '\n'); }
    finally { abort.current = null; setRunning(false); }
    setEntries(prev => prev.map(entry => entry.id === id ? { ...entry, exitCode } : entry));
    if (guideToken) await onResult(guideToken, { command, cwd, output: output.slice(-16000), exitCode });
    await onRefresh();
    requestAnimationFrame(() => { if (!guideToken) input.current?.focus(); });
  }
  function prompt(dir) { return <span className="shell-dir">~/{workspace.name}{dir && '/' + dir}</span>; }
  return <section className="terminal-pane" hidden={!shown} aria-label="Terminal panel">
    <div className="terminal-toolbar"><div className="bottom-tabs" role="tablist" aria-label="Bottom panel">
      <button role="tab" aria-selected={tab === 'terminal'} className={tab === 'terminal' ? 'active' : ''} onClick={() => setTab('terminal')}><SquareTerminal size={14}/>Terminal</button>
      <button role="tab" aria-selected={tab === 'output'} className={tab === 'output' ? 'active' : ''} onClick={() => setTab('output')}>Output</button>
    </div><div className="terminal-tools"><span className="shell-name"><i className="green-dot"/>bash</span>
      {running ? <IconButton label="Stop command" onClick={() => abort.current?.abort()}><Square size={13}/></IconButton>
        : <IconButton label="Clear terminal" onClick={() => setEntries([])}><Eraser size={14}/></IconButton>}
      <IconButton label="Hide terminal" onClick={onHide}><Minus size={15}/></IconButton></div></div>
    {tab === 'output' ? <div className="output-log">{events.length ? events.map((entry, i) => <div key={i}><time>{entry.time}</time> {entry.message}</div>) : <span>Workspace events appear here.</span>}</div>
    : <div className="terminal-body" ref={body} onClick={e => { if (!window.getSelection()?.toString() && !e.target.closest('button')) input.current?.focus(); }}>
      <div className="shell-ready"><i className="green-dot"/>Bash ready <span>·</span> {workspace.name}</div>
      {entries.map(entry => <div key={entry.id} className="terminal-entry"><div>{prompt(entry.cwd)} <b className="shell-chevron">❯</b> {entry.command}</div>
        {entry.output && <pre>{entry.output}</pre>}{entry.exitCode > 0 && <small className="exit-code">Exit {entry.exitCode}</small>}</div>)}
      {running ? <span className="terminal-running">Running…</span> : <form className="shell-prompt" onSubmit={run}>{prompt(cwd)}<ChevronRight size={14} className="shell-chevron"/>
        <div className="command-control"><span className="command-clip"><span style={{ transform: 'translateX(-' + scrollLeft + 'px)' }}><CommandHint value={value} target={guide?.command} cursor={cursor}/></span></span>
          <input aria-label="Terminal command" ref={input} value={value} spellCheck="false" autoComplete="off" autoCapitalize="off"
            onSelect={e => setCursor(e.target.selectionStart)} onScroll={e => setScrollLeft(e.target.scrollLeft)}
            onChange={e => { setValue(e.target.value); setCursor(e.target.selectionStart); }}
            onKeyDown={e => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); recall(e.key === 'ArrowUp' ? -1 : 1); }
              if (e.ctrlKey && e.key === 'l') { e.preventDefault(); setEntries([]); }
            }}/></div>
      </form>}
    </div>}
  </section>;
}
