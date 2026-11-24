import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BookOpen, Box, ChevronRight, CircleHelp, Code2, FileCode2, Files, FolderOpen, HardDrive, Keyboard, Maximize2, Minimize2, PanelBottom, PanelRight, Save, Search, Settings, SquareTerminal, X } from 'lucide-react';
import Explorer from './Explorer.jsx';
import Agent from './Agent.jsx';
import Terminal from './Terminal.jsx';
import Dialogs from './Dialogs.jsx';
import { api, asDocument, stored, retain } from './lib/api.js';
import { guides, matchGuide, nextStarter, starterSession } from './lib/guides.js';
import { lineRegion } from './lib/guidance.js';
import { base, FileIcon, IconButton, language, Modal } from './ui.jsx';

const CodeEditor = lazy(() => import('./Editor.jsx'));

function restoredSession(key, ws) {
  const s = stored(key, undefined);
  if (s?.id && Array.isArray(s.history) && (s.source === 'model' || guides[s.key])) {
    if (!s.action && !s.error) return { ...s, error: 'Resume to request the next step.' };
    return s;
  }
  return ws.starter ? starterSession('counter') : null;
}

function initialTabs(ws) {
  if (ws.starter) return ['src/tasks.js', 'README.md'].filter(p => ws.files.some(f => f.path === p));
  const first = ws.files.find(f => !f.directory && /^readme\.md$/i.test(f.path)) || ws.files.find(f => !f.directory);
  return first ? [first.path] : [];
}
const isNarrow = () => window.matchMedia('(max-width: 900px)').matches;
function actionToken(s) { return s?.action ? [s.id, s.history.length, s.action.kind, s.action.stage || ''].join(':') : ''; }

function Workbench({ initial }) {
  const storage = 'keyline.v1.' + initial.id;
  const [ws, setWs] = useState(initial);
  const [session, setSession] = useState(() => restoredSession(storage + '.session', initial));
  const currentSession = useRef(session);
  const [docs, setDocs] = useState({});
  const documents = useRef({});
  const retainedDrafts = useRef(stored(storage + '.drafts', {}));
  const [tabs, setTabs] = useState(() => initialTabs(initial));
  const [active, setActive] = useState(() => initialTabs(initial)[0] || '');
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [prefs, setPrefs] = useState(() => stored('keyline.preferences', { size: 14, wrap: false }));
  const [explorer, setExplorer] = useState(true);
  const [agent, setAgent] = useState(true);
  const [drawer, setDrawer] = useState('');
  const [focus, setFocus] = useState(false);
  const [term, setTerm] = useState(true);
  const [termTab, setTermTab] = useState('terminal');
  const [dialog, setDialog] = useState('');
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef(0);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(new Set());
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState(() => [{ time: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), message: 'Opened ' + initial.name + '.' }]);
  const file = docs[active];
  const a = session?.action;
  const token = actionToken(session);
  const phase = a?.kind === 'read' && !session.opened ? 'await-read' : a?.kind === 'create' && !session.created ? 'await-create' : '';
  const dirty = new Set(Object.keys(docs).filter(path => docs[path].draft !== docs[path].text));

  function toast(message) {
    setNotice(message); clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 6500);
  }
  function log(message) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setEvents(prev => [...prev.slice(-99), { time, message }]);
  }
  function updateSession(s) {
    currentSession.current = s; setSession(s); retain(storage + '.session', s);
  }
  function put(doc) {
    documents.current = { ...documents.current, [doc.path]: doc };
    setDocs(documents.current);
    if (doc.draft !== doc.text) retainedDrafts.current[doc.path] = { revision: doc.revision, text: doc.draft, conflict: Boolean(doc.conflict) };
    else delete retainedDrafts.current[doc.path];
    retain(storage + '.drafts', retainedDrafts.current);
  }
  function updateDraft(path, text) {
    const doc = documents.current[path];
    if (doc?.draft !== text) put({ ...doc, draft: text });
  }
  async function loadFile(path, check = false) {
    const cached = documents.current[path];
    if (cached && (!check || cached.text !== cached.draft)) return cached;
    const data = await api('file?path=' + encodeURIComponent(path));
    const latest = documents.current[path];
    if (latest && (latest.text !== latest.draft || latest.revision === data.revision)) return latest;
    const retained = retainedDrafts.current[path];
    const doc = asDocument(data, retained?.revision === data.revision ? retained.text : undefined);
    if (retained && (retained.conflict || retained.revision !== data.revision)) {
      // Preserve the learner's text and require an explicit conflict resolution.
      doc.draft = retained.text; doc.conflict = true;
    }
    put(doc);
    return doc;
  }
  async function open(path, fromTree = false) {
    if (!path) return;
    setTabs(prev => prev.includes(path) ? prev : [...prev, path]);
    setActive(path);
    try {
      const doc = await loadFile(path, fromTree);
      const s = currentSession.current;
      if (fromTree && s?.action?.kind === 'read' && s.action.path === path) {
        const endLine = Math.min(s.action.endLine, doc.draft.split('\n').length);
        if (s.action.startLine > endLine) { toast('The requested range is outside this file. Start a fresh guide.'); return; }
        updateSession({ ...s, opened: true });
        log('Opened ' + path + ' at lines ' + s.action.startLine + '–' + endLine + '.');
      }
    } catch (err) { toast(err.message); }
  }
  async function refresh() {
    try {
      const next = await api('workspace'); setWs(next);
      if (active && next.files.some(f => f.path === active)) await loadFile(active, true);
      return next;
    } catch (err) { toast(err.message); return null; }
  }
  useEffect(() => { if (active) open(active); }, []);
  useEffect(() => { retain('keyline.preferences', prefs); }, [prefs]);
  useEffect(() => { if (session) retain(storage + '.session', session); }, []);
  useEffect(() => {
    if (a?.kind === 'edit' || (a?.kind === 'create' && session.created)) {
      open(a.path); setDrawer('');
    }
    if (a?.kind === 'command') { setTerm(true); setTermTab('terminal'); setFocus(false); setDrawer(''); }
    if (phase) { setExplorer(true); setFocus(false); }
  }, [token, session?.created]);

  let editorGuide = null;
  let blocked = '';
  let pendingDeletion = false;
  if (file && a?.path === active) {
    if (a.kind === 'read' && session.opened && a.startLine <= file.draft.split('\n').length) {
      editorGuide = { mode: 'read', token: token + ':read', startLine: a.startLine, endLine: a.endLine };
    } else if (a.kind === 'edit' || (a.kind === 'create' && session.created)) {
      const region = a.kind === 'create' ? { from: 0, to: file.text.length, text: file.text } : lineRegion(file.text, a.startLine, a.endLine);
      if (!region || (a.kind === 'edit' && region.text !== a.oldText) || (a.kind === 'create' && file.text !== '')) blocked = 'The target changed on disk. Start a new guide from the current version.';
      else {
        const wholeLineDeletion = a.kind === 'edit' && a.text === '' && a.endLine >= a.startLine && file.text[region.to] === '\n';
        const to = region.to + Number(wholeLineDeletion);
        const oldText = file.text.slice(region.from, to);
        const tail = file.text.length - to;
        if (!file.draft.startsWith(file.text.slice(0, region.from)) || !file.draft.endsWith(file.text.slice(to)) || file.draft.length < region.from + tail) {
          blocked = 'Save your changes outside the target range before starting this step.';
        } else {
          editorGuide = { mode: 'edit', token: token + ':edit', from: region.from, tail, oldText, text: a.text };
          pendingDeletion = Boolean(oldText) && file.draft.slice(region.from, file.draft.length - tail) === oldText;
        }
      }
    }
  }
  async function plan(s) {
    const waiting = { ...s, action: null, error: '', created: false, opened: false };
    updateSession(waiting); setBusy(true);
    try {
      const fresh = await api('workspace'); setWs(fresh);
      const action = s.source === 'starter' ? nextStarter(s.key, s.history, fresh.files)
        : await api('agent', { goal: s.goal, history: s.history });
      if (currentSession.current !== waiting) return;
      updateSession({ ...waiting, action });
      if (action.kind === 'done') log('Guided session complete.');
    } catch (err) {
      if (currentSession.current === waiting) updateSession({ ...waiting, error: err.message });
    } finally { if (currentSession.current?.id === s.id) setBusy(false); }
  }
  async function finish(expectedToken, result) {
    const s = currentSession.current;
    if (!s?.action || actionToken(s) !== expectedToken) return;
    log('Completed “' + s.action.title + '”.');
    await plan({ ...s, history: [...s.history, { action: s.action, result }] });
  }
  async function continueRead() {
    const s = currentSession.current;
    if (s?.action?.kind !== 'read' || !s.opened) return;
    const currentToken = actionToken(s);
    try {
      const doc = await loadFile(s.action.path, true);
      const endLine = Math.min(s.action.endLine, doc.draft.split('\n').length);
      const range = lineRegion(doc.draft, s.action.startLine, endLine);
      if (!range) throw new Error('The selected range has moved.');
      await finish(currentToken, { path: doc.path, startLine: s.action.startLine, endLine, text: range.text });
    } catch (err) { toast(err.message); }
  }
  async function persist(path, text) {
    if (saveLock.current.has(path)) throw new Error('A save is already in progress.');
    const doc = documents.current[path];
    if (doc.conflict) throw new Error('The file changed on disk. Copy your draft, then reopen the disk version from the tab close dialog.');
    saveLock.current.add(path); setSaving(true);
    try {
      const saved = await api('file', { path, text: doc.eol === '\r\n' ? text.replaceAll('\n', '\r\n') : text, revision: doc.revision }, 'PUT');
      const now = documents.current[path];
      put(asDocument(saved, now.draft !== doc.draft ? now.draft : undefined));
      log('Saved ' + path + '.');
    } catch (err) {
      if (err.message.includes('changed on disk')) put({ ...documents.current[path], conflict: true });
      throw err;
    } finally { saveLock.current.delete(path); setSaving(saveLock.current.size > 0); }
  }
  async function saveActive() {
    if (!file) return;
    if (editorGuide?.mode === 'edit') { toast('Finish the guided edit with //DONE on its own line.'); return; }
    if (file.text === file.draft) return;
    try { await persist(active, file.draft); toast('Saved ' + base(active) + '.'); } catch (err) { toast(err.message); }
  }
  async function finishEdit(full, actual) {
    const s = currentSession.current;
    if (!s?.action || actionToken(s) !== token || !editorGuide || saveLock.current.has(active)) return;
    try {
      updateDraft(active, full);
      await persist(active, full);
      await finish(token, { path: active, text: actual, previousText: editorGuide.oldText, matchedSuggestion: actual === a.text });
    } catch (err) { toast(err.message); }
  }
  async function create(path, directory) {
    const result = await api(directory ? 'folder' : 'file', { path });
    log('Created ' + path + '.'); const updated = await api('workspace'); setWs(updated);
    if (!directory) {
      put(asDocument(result));
      const s = currentSession.current;
      if (s?.action?.kind === 'create' && path === s.action.path) updateSession({ ...s, created: true });
      await open(path); setDrawer('');
    }
  }
  function startGuide(key) {
    const s = starterSession(key);
    updateSession(s); setBusy(false); setAgent(true); setExplorer(true); setFocus(false);
    if (isNarrow()) setDrawer('agent');
    log('Started “' + s.goal + '”.');
  }
  async function submit(goal) {
    if (ws.model) {
      await plan({ id: crypto.randomUUID(), source: 'model', goal, history: [] }); return true;
    }
    const key = ws.starter && matchGuide(goal);
    if (key) { startGuide(key); return true; }
    toast('Custom requests need a connected model. Choose a local guide or connect one in Settings.'); setDialog('new'); return false;
  }
  function closeTab(path) {
    if (dirty.has(path)) { setDialog('close:' + path); return; }
    dropTab(path);
  }
  function dropTab(path) {
    const rest = tabs.filter(p => p !== path);
    setTabs(rest);
    if (path === active) { setActive(rest.at(-1) || ''); if (rest.length) open(rest.at(-1)); }
  }
  function toggleExplorer() { setFocus(false); if (isNarrow()) { setExplorer(true); setDrawer(drawer === 'explorer' ? '' : 'explorer'); } else setExplorer(!explorer); }
  function toggleAgent() { setFocus(false); if (isNarrow()) { setAgent(true); setDrawer(drawer === 'agent' ? '' : 'agent'); } else setAgent(!agent); }
  function toggleTerminal() { setFocus(false); setTerm(!term); setTermTab('terminal'); setDrawer(''); }
  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setDialog('search'); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && !e.defaultPrevented) { e.preventDefault(); saveActive(); }
      if (e.key === 'Escape' && !dialog) { setDrawer(''); setFocus(false); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  });
  const explorerVisible = explorer && !focus;
  const agentVisible = agent && !focus;
  const terminalVisible = term && !focus;
  return <div className={'workbench drawer-' + drawer}>
    <header className="topbar"><div className="identity"><img src="/keyline.svg" alt=""/><strong>Keyline</strong></div><span className="top-divider"/>
      <span className="workspace-name"><Box size={15}/>{ws.name}</span>
      <button className="top-search" onClick={() => setDialog('search')}><Search size={14}/><span>Search workspace</span><kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} K</kbd></button>
      <div className="top-actions"><span className="local-indicator"><i className="green-dot"/>Local session</span>
        <button className={'agent-toggle ' + (agentVisible ? 'enabled' : '')} title="Toggle agent panel" onClick={toggleAgent}><PanelRight size={14}/>Agent</button></div>
    </header>
    <main className="workspace-body">
      <nav className="activity-rail" aria-label="Workspace tools"><div>
        <IconButton label="Toggle Explorer" className={explorerVisible ? 'rail-active' : ''} onClick={toggleExplorer}><Files/></IconButton>
        <IconButton label="Find a file" onClick={() => setDialog('search')}><Search/></IconButton>
        <IconButton label="Toggle Terminal" onClick={toggleTerminal}><SquareTerminal/></IconButton>
        <span className="rail-divider"/><IconButton label="Browse guides" onClick={() => setDialog('new')}><BookOpen/></IconButton>
      </div><div><IconButton label="Guide help" onClick={() => setDialog('help')}><CircleHelp/></IconButton>
        <IconButton label="Settings" onClick={() => setDialog('settings')}><Settings/></IconButton></div></nav>
      {drawer && <button className="drawer-scrim" aria-label="Close side panel" onClick={() => setDrawer('')}/>}
      {explorerVisible && <Explorer workspace={ws} active={active} action={a} phase={phase} dirty={dirty} onOpen={open} onCreate={create} onCloseMobile={() => setDrawer('')}/>}
      <div className="center-pane">
        {a && a.kind !== 'done' && !drawer && !focus && <section className="mobile-guidance" aria-label="Current guide instruction">
          <div><BookOpen size={14}/><span>{a.reason}</span></div>
          {phase ? <button onClick={() => { setExplorer(true); setDrawer('explorer'); }}>Show in Explorer <ChevronRight size={12}/></button>
            : a.kind === 'read' ? <button onClick={continueRead}>Continue <ChevronRight size={12}/></button>
            : <small>{a.kind === 'command' ? 'Press Enter to run your command.' : 'Finish your edit with //DONE on its own line.'}</small>}
        </section>}
        <section className="editor-pane">
        <div className="editor-top"><div className="file-tabs" role="tablist" aria-label="Open files">{tabs.map(path => <div className={'file-tab ' + (active === path ? 'active' : '')} key={path}>
          <button role="tab" aria-selected={active === path} onClick={() => open(path)}><FileIcon path={path}/>{base(path)}</button>
          <IconButton label={'Close ' + base(path)} className={dirty.has(path) ? 'close-tab dirty' : 'close-tab'} onClick={() => closeTab(path)}><X size={12}/></IconButton>
        </div>)}</div><div className="editor-tools">
          {file && dirty.has(active) && <IconButton label="Save active file" onClick={saveActive}><Save size={14}/></IconButton>}
          <IconButton label={terminalVisible ? 'Collapse terminal panel' : 'Show terminal panel'} onClick={toggleTerminal}><PanelBottom size={15}/></IconButton>
          <IconButton label={focus ? 'Exit focus mode' : 'Focus editor'} onClick={() => { setFocus(!focus); setDrawer(''); }}>{focus ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}</IconButton>
        </div></div>
        {active ? <><div className="breadcrumbs"><FolderOpen size={13}/><span>{ws.name}</span>{active.split('/').map((p, i, arr) => <React.Fragment key={i}><ChevronRight size={11}/>{i === arr.length - 1 && <FileIcon path={active}/>}<span>{p}</span></React.Fragment>)}</div>
          {file ? <Suspense fallback={<div className="empty-editor">Opening editor…</div>}><CodeEditor file={file} guide={editorGuide} fontSize={prefs.size} wrap={prefs.wrap} onCursor={setCursor} onChange={text => updateDraft(active, text)} onFinish={finishEdit} onSave={saveActive}/></Suspense>
            : <div className="empty-editor"><FileCode2/><p>Opening {base(active)}…</p><button onClick={() => open(active)}>Retry</button></div>}</>
          : <div className="empty-editor"><Code2 size={28}/><p>Open a file from Explorer.</p><button onClick={() => setDialog('search')}>Find a file</button></div>}
      </section>
      <Terminal workspace={ws} shown={terminalVisible} tab={termTab} setTab={setTermTab} onHide={() => setTerm(false)}
        guide={a?.kind === 'command' ? { command: a.command, token, fromRoot: session.source === 'starter' } : null} onResult={finish} onRefresh={refresh} events={events}/>
      </div>
      {agentVisible && <Agent session={session} active={active} workspace={ws} busy={busy || saving} blocked={blocked} pendingDeletion={pendingDeletion} onNew={() => setDialog('new')} onHistory={() => setDialog('history')}
        onSubmit={submit} onContinue={continueRead} onRetry={() => plan(currentSession.current)} onReturn={() => { open(a.path); setDrawer(''); }}/>}
    </main>
    <footer className="statusbar"><span className="status-brand"><Code2 size={14}/></span><span><HardDrive size={12}/>{ws.name}</span>
      {session && <button onClick={toggleAgent}><Keyboard size={13}/>Guided mode</button>}
      <div className="status-right">{file && <><span>Ln {cursor.line}, Col {cursor.column}</span><span>Spaces: 2</span><span>UTF-8</span><span><Code2 size={12}/>{language(active)}</span></>}
        <span className="save-status"><i className={dirty.size || saving ? 'dirty-dot' : 'green-dot'}/>{saving ? 'Saving' : dirty.size ? 'Unsaved' : 'Saved'}</span></div>
    </footer>
    {notice && <div className="toast" role="status"><span>{notice}</span><IconButton label="Dismiss message" onClick={() => setNotice('')}><X size={14}/></IconButton></div>}
    {dialog.startsWith('close:') ? <DiscardDialog path={dialog.slice(6)} cancel={() => setDialog('')} discard={path => {
      const next = { ...documents.current }; delete next[path]; documents.current = next; setDocs(next);
      delete retainedDrafts.current[path]; retain(storage + '.drafts', retainedDrafts.current); dropTab(path); setDialog('');
    }}/> : <Dialogs type={dialog} close={() => setDialog('')} workspace={ws} session={session} open={open} prefs={prefs} setPrefs={setPrefs} startGuide={startGuide}
      focusPrompt={() => { setAgent(true); if (isNarrow()) setDrawer('agent'); requestAnimationFrame(() => document.querySelector('.composer textarea')?.focus()); }}/>}
  </div>;
}
function DiscardDialog({ path, cancel, discard }) {
  return <Modal title="Close unsaved file?" onClose={cancel}><p className="dialog-copy">Closing {base(path)} will discard its unsaved changes.</p><div className="dialog-actions"><button onClick={cancel}>Keep editing</button><button onClick={() => discard(path)}>Discard and close</button></div></Modal>;
}

export default function App() {
  const [ws, setWs] = useState(null);
  const [error, setError] = useState('');
  function connect() { setError(''); api('workspace').then(setWs).catch(err => setError(err.message)); }
  useEffect(connect, []);
  if (!ws) return <main className="connect"><img src="/keyline.svg" alt=""/><h1>Keyline</h1><p>{error || 'Opening workspace…'}</p>{error && <button onClick={connect}>Reconnect</button>}</main>;
  return <Workbench initial={ws}/>;
}
