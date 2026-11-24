// Find the closest prefix of the proposed edit. Insertions and omissions can
// resynchronize at a later match without coloring the rest of the line red.
export function alignTyped(typed, target) {
  let common = 0;
  while (common < typed.length && common < target.length && typed[common] === target[common]) common++;
  if (common === typed.length) return { next: Array.from(target.slice(common))[0] || '', errors: [] };
  const input = typed.slice(common);
  const remaining = target.slice(common, common + input.length * 2);
  const width = remaining.length + 1;
  const errors = [];
  function mark(index) {
    const last = errors.at(-1);
    if (last && last[1] === index) last[1]++;
    else errors.push([index, index + 1]);
  }
  // Keep very large pasted alternatives responsive.
  if ((input.length + 1) * width > 1500000) {
    for (let i = 0; i < input.length; i++) if (input[i] !== remaining[i]) mark(i + common);
    return { next: Array.from(target.slice(typed.length))[0] || '', errors };
  }
  const directions = new Uint8Array((input.length + 1) * width);
  let prev = Uint32Array.from({ length: width }, (_, i) => i);
  let row = new Uint32Array(width);
  for (let i = 1; i <= input.length; i++) {
    row[0] = i;
    for (let j = 1; j < width; j++) {
      const equal = input[i - 1] === remaining[j - 1];
      const replace = prev[j - 1] + Number(!equal);
      const extra = prev[j] + 1;
      const missing = row[j - 1] + 1;
      const cost = Math.min(replace, extra, missing);
      row[j] = cost;
      directions[i * width + j] = cost === replace ? (equal ? 1 : 2) : cost === extra ? 3 : 4;
    }
    [prev, row] = [row, prev];
  }
  let best = 0;
  for (let j = 1; j < width; j++) {
    if (prev[j] < prev[best] || (prev[j] === prev[best] && Math.abs(j - input.length) < Math.abs(best - input.length))) best = j;
  }
  const wrong = [];
  let i = input.length;
  let j = best;
  while (i > 0) {
    const direction = directions[i * width + j];
    if (direction === 4) { j--; continue; }
    if (direction !== 1) wrong.push(common + i - 1);
    if (direction === 1 || direction === 2) j--;
    i--;
  }
  wrong.reverse().forEach(mark);
  return { next: Array.from(target.slice(common + best))[0] || '', errors };
}

export function visibleChar(char) {
  return ({ ' ': '␣', '\n': '↵', '\t': '⇥' })[char] || char;
}

export function completedEdit(text) {
  const marker = /(?:^|\n)[\t ]*\/\/DONE$/.exec(text);
  return marker ? { text: text.slice(0, marker.index) } : null;
}

export function lineRegion(text, start, end) {
  const lines = text.split('\n');
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || start > lines.length || end < start - 1) return null;
  const from = start === 1 ? 0 : lines.slice(0, start - 1).join('\n').length + 1;
  if (end < start) return { from, to: from, text: '' };
  const value = lines.slice(start - 1, end).join('\n');
  return { from, to: from + value.length, text: value };
}
