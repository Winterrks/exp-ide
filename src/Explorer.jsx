import React, { useEffect, useRef, useState } from 'react';
import { Box, ChevronDown, ChevronRight, ChevronsDownUp, FilePlus2, Folder, FolderOpen, FolderPlus, FolderTree } from 'lucide-react';
import { base, FileIcon, IconButton, parent } from './ui.jsx';

export default function Explorer({ workspace, active, action, phase, dirty, onOpen, onCreate, onCloseMobile }) {
  const [closed, setClosed] = useState(new Set());
  const [rootOpen, setRootOpen] = useState(true);
  const [selectedDir, setSelectedDir] = useState('');
  const [form, setForm] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const folders = workspace.files.filter(f => f.directory);
  let createParent = phase === 'await-create' ? parent(action.path) : '';
  while (createParent && !folders.some(f => f.path === createParent)) createParent = parent(createParent);
  const target = phase === 'await-read' ? action.path : phase === 'await-create' ? createParent : null;
  useEffect(() => {
    if (!target) return;
    setRootOpen(true);
    setClosed(prev => new Set([...prev].filter(dir => target !== dir && !target.startsWith(dir + '/'))));
  }, [target]);
  useEffect(() => { if (form) input.current?.focus(); }, [form]);
  function makeForm(directory) {
    setRootOpen(true); setName(''); setError(''); setForm({ directory, dir: selectedDir });
  }
  async function submit(e) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    const path = [form.dir, name.trim()].filter(Boolean).join('/');
    setBusy(true);
    try {
      await onCreate(path, form.directory);
      setClosed(prev => new Set([...prev].filter(dir => !path.startsWith(dir + '/') && dir !== path)));
      if (form.directory) setSelectedDir(path);
      setForm(null);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <aside className="explorer">
    <div className="pane-heading"><span>Explorer</span><div className="heading-tools">
      <IconButton label="New file" onClick={() => makeForm(false)}><FilePlus2/></IconButton>
      <IconButton label="New folder" onClick={() => makeForm(true)}><FolderPlus/></IconButton>
      <IconButton label="Collapse folders" onClick={() => { setClosed(new Set(folders.map(f => f.path))); setSelectedDir(''); }}><ChevronsDownUp/></IconButton>
    </div></div>
    <div className="tree-scroll"><button className={'tree-root' + (target === '' ? ' target-root' : '')} onClick={() => { setRootOpen(!rootOpen); setSelectedDir(''); }} aria-expanded={rootOpen}>
      {rootOpen ? <ChevronDown/> : <ChevronRight/>}<Box size={15}/><strong>{workspace.name}</strong>
    </button>
    {rootOpen && <div className="tree" aria-label="Workspace files">{workspace.files.map(f => {
      if ([...closed].some(dir => f.path.startsWith(dir + '/'))) return null;
      const isTarget = f.path === target;
      const isSelected = f.directory ? selectedDir === f.path : active === f.path;
      return <button key={f.path} className={['tree-row', isTarget && 'target', isSelected && 'selected', f.directory && 'directory'].filter(Boolean).join(' ')}
        style={{ '--depth': f.path.split('/').length - 1 }} title={f.path} aria-label={(f.directory ? 'Folder ' : 'Open ') + f.path}
        aria-expanded={f.directory ? !closed.has(f.path) : undefined}
        onClick={() => {
          if (f.directory) {
            setSelectedDir(f.path); setClosed(prev => { const n = new Set(prev); if (n.has(f.path)) n.delete(f.path); else n.add(f.path); return n; });
          } else { setSelectedDir(parent(f.path)); onOpen(f.path, true); onCloseMobile(); }
        }}>
        {f.directory ? <>{closed.has(f.path) ? <ChevronRight className="disclose"/> : <ChevronDown className="disclose"/>}
          {closed.has(f.path) ? <Folder className="folder-icon"/> : <FolderOpen className="folder-icon"/>}</>
          : <><i className="disclose"/><FileIcon path={f.path}/></>}
        <span>{base(f.path)}</span>{isTarget ? <i className="target-dot"/> : dirty.has(f.path) ? <i className="dirty-dot"/> : null}
      </button>;
    })}</div>}
    {form && <form className="create-form" onSubmit={submit}>
      <label htmlFor="entry-name">{form.directory ? 'New folder' : 'New file'} in {form.dir || workspace.name}</label>
      <input ref={input} id="entry-name" value={name} placeholder={form.directory ? 'Folder name' : 'File name'} onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') setForm(null); }}/>
      {error && <div className="form-error">{error}</div>}
      <div className="form-buttons"><button type="button" onClick={() => setForm(null)}>Cancel</button><button disabled={busy}>Create</button></div>
    </form>}
    </div>
    <div className="explorer-foot"><FolderTree size={14}/><span>Local filesystem</span></div>
  </aside>;
}
