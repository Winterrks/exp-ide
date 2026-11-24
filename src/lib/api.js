export async function api(path, data, method) {
  const response = await fetch('/api/' + path, {
    method: method || (data === undefined ? 'GET' : 'POST'),
    headers: { 'X-Keyline-Client': 'workspace', ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Workspace request failed.');
  return result;
}

export async function terminal(command, cwd, signal, onEvent) {
  const response = await fetch('/api/terminal', { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'X-Keyline-Client': 'workspace' }, body: JSON.stringify({ command, cwd }) });
  if (!response.ok) throw new Error((await response.json()).error);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) if (line) onEvent(JSON.parse(line));
  }
}

export function stored(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

export function retain(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* The open buffers remain available when browser storage is full. */ }
}

export function asDocument(file, draft) {
  const text = file.text.replace(/\r\n/g, '\n');
  return { ...file, eol: file.text.includes('\r\n') ? '\r\n' : '\n', text, draft: draft ?? text };
}
