import React, { useState } from 'react';
import { BookOpen, Check, ChevronRight, Search, Sparkles } from 'lucide-react';
import { actionIcons, base, FileIcon, Modal } from './ui.jsx';
import { guides } from './lib/guides.js';

function SearchDialog({ workspace, close, open }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const results = workspace.files.filter(f => !f.directory && f.path.toLowerCase().includes(query.toLowerCase())).slice(0, 80);
  const choose = path => { close(); if (path) open(path, false); };
  return <Modal title="Search workspace files" onClose={close} className="search-dialog"><div className="search-field"><Search size={17}/><input autoFocus placeholder="Search by name or path…" aria-label="Search files by name" value={query}
    onChange={e => { setQuery(e.target.value); setIndex(0); }} onKeyDown={e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setIndex(Math.max(0, Math.min(results.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))); }
      if (e.key === 'Enter' && results[index]) choose(results[index].path);
    }}/></div><div className="search-results">{results.length ? results.map((f, i) => <button key={f.path} className={i === index ? 'selected' : ''} onClick={() => choose(f.path)}><FileIcon path={f.path}/><strong>{base(f.path)}</strong><span>{f.path}</span></button>)
      : <p>No matching files.</p>}</div></Modal>;
}

export default function Dialogs({ type, close, workspace, session, open, prefs, setPrefs, startGuide, focusPrompt }) {
  if (!type) return null;
  if (type === 'search') return <SearchDialog workspace={workspace} close={close} open={open}/>;
  if (type === 'new') return <Modal title="New guided session" onClose={close}>
    {workspace.starter && <><p className="dialog-copy">Choose a starter guide for the taskboard workspace.</p>
      <div className="guide-options">{Object.entries(guides).map(([key, g]) => <button key={key} onClick={() => { close(); startGuide(key); }}><BookOpen size={18}/><span><strong>{g.title}</strong><small>{g.description}</small></span><ChevronRight size={16}/></button>)}</div></>}
    {workspace.model ? <button className="new-guide-button" onClick={() => { close(); focusPrompt(); }}><Sparkles size={15}/>Describe a custom change</button>
      : <p className="settings-note">For open-ended requests, set <code>OPENAI_API_KEY</code> on the local server and restart Keyline.</p>}
  </Modal>;
  if (type === 'settings') return <Modal title="Workspace settings" onClose={close}>
    <label className="setting-row">Editor text size <select value={prefs.size} onChange={e => setPrefs({ ...prefs, size: Number(e.target.value) })}>{[12, 13, 14, 15, 16, 18, 20].map(n => <option key={n} value={n}>{n} px</option>)}</select></label>
    <label className="setting-row">Wrap long lines <input type="checkbox" checked={prefs.wrap} onChange={e => setPrefs({ ...prefs, wrap: e.target.checked })}/></label>
    <div className="setting-row">Agent connection <strong>{workspace.model || 'Local guides'}</strong></div>
    {!workspace.model && <p className="settings-note">Connect a model with <code>OPENAI_API_KEY</code> in the server environment or <code>.env.local</code>. Restart the server after changing settings.</p>}
  </Modal>;
  if (type === 'history') return <Modal title="Session activity" onClose={close}>
    {session?.history.length ? <div className="activity-items">{session.history.map(({ action, result }, i) => {
      const Icon = actionIcons[action.kind];
      return <details key={i}><summary><Icon size={15}/><strong>{action.title}</strong><Check size={13}/></summary>
        <p>{action.reason}</p>{action.path && <code>{action.path}</code>}
        <pre>{action.kind === 'command' ? '$ ' + result.command + '\n' + result.output + '\nExit ' + result.exitCode : result.text || '(empty)'}</pre>
      </details>;
    })}</div> : <p className="dialog-copy">Completed reads, your edits, and terminal results will appear here as you work through the guide.</p>}
  </Modal>;
  return <Modal title="Working with Keyline" onClose={close}>
    <div className="help-items">
      <p><b>Read a file</b>Click the green file in Explorer. Review the highlighted lines and continue to share that range with the agent.</p>
      <p><b>Make a change</b>Replace the red selection. Follow the next character or type your own version. A red underline marks a difference.</p>
      <p><b>Finish an edit</b>Type <code>//DONE</code> on its own line. Keyline consumes the marker and saves your version.</p>
      <p><b>Run a command</b>Type in Terminal and press Enter. The agent receives the command and its actual output.</p>
    </div>
    <div className="shortcut-row"><span>Find a file</span><kbd>Ctrl / ⌘ K</kbd></div><div className="shortcut-row"><span>Save a regular edit</span><kbd>Ctrl / ⌘ S</kbd></div>
  </Modal>;
}
