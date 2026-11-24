import React, { useLayoutEffect, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentLess } from '@codemirror/commands';
import { bracketMatching, HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { tags as t } from '@lezer/highlight';
import { alignTyped, completedEdit, visibleChar } from './lib/guidance.js';
import { language } from './ui.jsx';

// VS Code Dark 2026, including the more specific scopes it inherits from Dark+.
// These Lezer tags correspond to the resolved TextMate colors in VS Code 1.147.
const literals = [
  { tag: [t.string, t.regexp], color: '#a5d6ff' },
  { tag: t.number, color: '#b5cea8' },
  { tag: [t.bool, t.null], color: '#569cd6' },
];
const codeColors = HighlightStyle.define([
  ...literals,
  { tag: t.comment, color: '#8b949e' },
  { tag: [t.keyword, t.definitionKeyword, t.function(t.punctuation)], color: '#ff7b72' },
  { tag: [t.controlKeyword, t.moduleKeyword], color: '#c586c0' },
  { tag: [t.modifier, t.operatorKeyword], color: '#569cd6' },
  { tag: t.operator, color: '#d4d4d4' },
  { tag: [t.variableName, t.propertyName, t.derefOperator], color: '#c9d1d9' },
  { tag: t.definition(t.variableName), color: '#ffa657' },
  { tag: t.definition(t.propertyName), color: '#9cdcfe' },
  { tag: [t.self, t.atom, t.standard(t.variableName)], color: '#79c0ff' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))], color: '#d2a8ff' },
  { tag: [t.typeName, t.className], color: '#4ec9b0' },
  { tag: [t.tagName, t.quote], color: '#7ee787' },
  { tag: t.heading, color: '#79c0ff', fontWeight: 'bold' },
  { tag: t.strong, color: '#c9d1d9', fontWeight: 'bold' },
  { tag: t.emphasis, color: '#c9d1d9', fontStyle: 'italic' },
  { tag: t.monospace, color: '#79c0ff' },
  { tag: [t.link, t.url], color: '#a5d6ff', textDecoration: 'underline' },
  { tag: t.invalid, color: '#ffa198', fontStyle: 'italic' },
]);
const jsonColors = HighlightStyle.define([...literals, { tag: t.propertyName, color: '#7ee787' }]);

class Hint extends WidgetType {
  constructor(char) { super(); this.char = char; }
  eq(other) { return other.char === this.char; }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'char-hint';
    el.dataset.char = this.char;
    el.setAttribute('aria-hidden', 'true');
    el.textContent = visibleChar(this.char);
    return el;
  }
}
function rangeEnd(view, guide) { return view.state.doc.length - guide.tail; }

function decorations(view, guide) {
  const marks = [];
  const doc = view.state.doc;
  if (guide.mode === 'read') {
    for (let i = guide.startLine; i <= Math.min(guide.endLine, doc.lines); i++) marks.push(Decoration.line({ class: 'guide-read-line' }).range(doc.line(i).from));
  } else {
    const end = rangeEnd(view, guide);
    const value = doc.sliceString(guide.from, end);
    const original = guide.oldText && value === guide.oldText;
    const head = view.state.selection.main.head;
    if (original) {
      for (let i = doc.lineAt(guide.from).number; i <= doc.lineAt(end - 1).number; i++) marks.push(Decoration.line({ class: 'guide-delete-line' }).range(doc.line(i).from));
      marks.push(Decoration.mark({ class: 'delete-text' }).range(guide.from, end));
    } else {
      const aligned = alignTyped(value, guide.text);
      for (const [start, stop] of aligned.errors) marks.push(Decoration.mark({ class: 'typed-difference' }).range(guide.from + start, guide.from + stop));
      if (head >= guide.from && head <= end) {
        const next = head === end ? aligned.next : alignTyped(value.slice(0, head - guide.from), guide.text).next;
        if (next) marks.push(Decoration.widget({ widget: new Hint(next), side: 1 }).range(head));
      }
    }
  }
  return Decoration.set(marks, true);
}

export default function CodeEditor({ file, guide, fontSize, wrap, onChange, onFinish, onSave, onCursor }) {
  const host = useRef(null);
  const callbacks = useRef({});
  callbacks.current = { onChange, onFinish, onSave, onCursor };
  const positions = useRef(new Map());
  const previousGuide = useRef(null);
  const guideToken = guide?.token;
  useLayoutEffect(() => {
    if (!file) return;
    const lang = language(file.path);
    const extensions = [lineNumbers(), highlightActiveLineGutter(), history(), drawSelection(), bracketMatching(), highlightActiveLine(),
      EditorView.contentAttributes.of({ 'aria-label': 'Code editor for ' + file.path, spellcheck: 'false', autocapitalize: 'off' }),
      EditorState.tabSize.of(2), indentUnit.of('  '), syntaxHighlighting(lang === 'JSON' ? jsonColors : codeColors),
      keymap.of([{ key: 'Mod-s', run: () => { callbacks.current.onSave(); return true; } },
        ...(guide?.mode === 'edit' ? [{ key: 'Enter', run: view => { view.dispatch(view.state.replaceSelection('\n')); return true; } }] : []),
        { key: 'Tab', run: view => { view.dispatch(view.state.replaceSelection(guide?.mode === 'edit' ? '\t' : '  ')); return true; } },
        { key: 'Shift-Tab', run: indentLess }, ...historyKeymap, ...defaultKeymap]),
      EditorView.darkTheme.of(true)];
    if (lang === 'JavaScript' || lang === 'TypeScript') extensions.push(javascript({ jsx: /x$/.test(file.path), typescript: lang === 'TypeScript' }));
    if (lang === 'JSON') extensions.push(json());
    const markdownSupport = new Compartment();
    if (lang === 'Markdown') extensions.push(markdownSupport.of([]));
    if (wrap) extensions.push(EditorView.lineWrapping);
    if (guide) {
      extensions.push(ViewPlugin.fromClass(class {
        constructor(view) { this.decorations = decorations(view, guide); }
        update(update) { if (update.docChanged || update.selectionSet) this.decorations = decorations(update.view, guide); }
      }, { decorations: plugin => plugin.decorations }));
    }
    if (guide?.mode === 'edit') {
      extensions.push(EditorState.transactionFilter.of(tr => {
        if (!tr.docChanged) return tr;
        let allowed = true;
        const end = tr.startState.doc.length - guide.tail;
        tr.changes.iterChanges((from, to) => { if (from < guide.from || to > end) allowed = false; });
        return allowed ? tr : [];
      }));
    }
    let alive = true;
    extensions.push(EditorView.updateListener.of(update => {
      const { doc, selection } = update.state;
      const head = selection.main.head;
      const line = doc.lineAt(head);
      callbacks.current.onCursor({ line: line.number, column: head - line.from + 1 });
      if (!update.docChanged) return;
      if (guide?.mode === 'edit') {
        const end = doc.length - guide.tail;
        const completed = completedEdit(doc.sliceString(guide.from, end));
        if (completed) {
          const cleanEnd = guide.from + completed.text.length;
          const full = doc.sliceString(0, cleanEnd) + doc.sliceString(end);
          queueMicrotask(() => {
            if (!alive) return;
            update.view.dispatch({ changes: { from: cleanEnd, to: end } });
            callbacks.current.onFinish(full, completed.text);
          });
          return;
        }
      }
      callbacks.current.onChange(doc.toString());
    }));
    let selection = { anchor: Math.min(file.draft.length, positions.current.get(file.path) || 0) };
    if (guide?.mode === 'edit') {
      const end = file.draft.length - guide.tail;
      selection = file.draft.slice(guide.from, end) === guide.oldText
        ? { anchor: guide.from, head: end } : { anchor: end };
    } else if (guide?.mode === 'read') {
      selection = { anchor: file.draft.split('\n').slice(0, guide.startLine - 1).reduce((n, l) => n + l.length + 1, 0) };
    }
    const view = new EditorView({ state: EditorState.create({ doc: file.draft, selection, extensions }), parent: host.current });
    if (lang === 'Markdown') import('@codemirror/lang-markdown').then(({ markdown }) => {
      if (alive) view.dispatch({ effects: markdownSupport.reconfigure(markdown()) });
    }).catch(() => { /* The text stays editable while the language module is unavailable. */ });
    const line = view.state.doc.lineAt(selection.head ?? selection.anchor);
    callbacks.current.onCursor({ line: line.number, column: (selection.head ?? selection.anchor) - line.from + 1 });
    if (guide) {
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main, { y: 'center' }) });
      if (guide.mode === 'edit' && previousGuide.current !== guideToken) view.focus();
    }
    previousGuide.current = guideToken;
    return () => {
      alive = false;
      positions.current.set(file.path, view.state.selection.main.head);
      view.destroy();
    };
  }, [file?.path, file?.revision, guideToken, wrap]);
  return <div className="editor-host" style={{ '--code-size': fontSize + 'px' }} ref={host}/>;
}
