import React, { useEffect, useRef } from 'react';
import { BookOpen, Check, File, FilePlus2, GitBranch, PencilLine, SquareTerminal, X } from 'lucide-react';

export const base = path => path?.split('/').at(-1) || '';
export const parent = path => path?.split('/').slice(0, -1).join('/') || '';
export function language(path = '') {
  if (/\.([cm]?js|jsx)$/.test(path)) return 'JavaScript';
  if (/\.tsx?$/.test(path)) return 'TypeScript';
  if (path.endsWith('.json')) return 'JSON';
  if (path.endsWith('.md')) return 'Markdown';
  return 'Plain text';
}

export function FileIcon({ path }) {
  if (/\.([cm]?js|jsx)$/.test(path)) return <b aria-hidden="true" className="file-icon js">JS</b>;
  if (/\.tsx?$/.test(path)) return <b aria-hidden="true" className="file-icon ts">TS</b>;
  if (path.endsWith('.json')) return <b aria-hidden="true" className="file-icon json">{'{}'}</b>;
  if (path.endsWith('.md')) return <b aria-hidden="true" className="file-icon md">M↓</b>;
  if (base(path).startsWith('.git')) return <GitBranch size={14} className="git-file"/>;
  return <File size={14} className="muted"/>;
}

export const actionIcons = { read: BookOpen, edit: PencilLine, create: FilePlus2, command: SquareTerminal, done: Check };
export function IconButton({ label, children, className = '', ...props }) {
  return <button type="button" title={label} aria-label={label} className={'icon-button ' + className} {...props}>{children}</button>;
}

export function Modal({ title, onClose, children, className = '' }) {
  const dialog = useRef(null);
  useEffect(() => {
    const el = dialog.current;
    const before = document.activeElement;
    el.showModal();
    return () => { el.close(); if (before?.isConnected) before.focus(); };
  }, []);
  return <dialog ref={dialog} className={'dialog ' + className} aria-label={title}
    onCancel={e => { e.preventDefault(); onClose(); }}
    onClick={e => { if (e.target === dialog.current) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <div className="dialog-head"><h2>{title}</h2><IconButton label="Close dialog" onClick={onClose}><X size={17}/></IconButton></div>
    {children}
  </dialog>;
}
