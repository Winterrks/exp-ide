import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

const template = fileURLToPath(new URL('../starter/taskboard/', import.meta.url));
const defaultData = fileURLToPath(new URL('../.keyline', import.meta.url));
const hidden = new Set(['.git', '.keyline', 'node_modules', 'dist', '.DS_Store']);
const maxFileBytes = 512 * 1024;

export function failure(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function revision(text) {
  return createHash('sha256').update(text).digest('hex');
}

export async function workspace(configuredRoot, dataDir = defaultData) {
  const defaultRoot = path.resolve(dataDir, 'taskboard');
  if (!configuredRoot) {
    await fs.mkdir(path.dirname(defaultRoot), { recursive: true });
    try {
      await fs.access(defaultRoot);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // Build the starter in a sibling directory so an interrupted first launch can be retried.
      const staging = await fs.mkdtemp(path.join(path.dirname(defaultRoot), 'starter-'));
      try {
        await fs.cp(template, staging, { recursive: true });
        await fs.rename(staging, defaultRoot);
      } catch (copyError) {
        if (!['ENOTEMPTY', 'EEXIST'].includes(copyError.code)) throw copyError;
      } finally {
        await fs.rm(staging, { recursive: true, force: true });
      }
    }
  }
  const root = await fs.realpath(configuredRoot || defaultRoot);
  if (!(await fs.stat(root)).isDirectory()) throw failure('Choose a workspace directory.');
  const pending = new Map();

  async function locate(relative, allowRoot = false) {
    if (allowRoot && (!relative || relative === '.')) return root;
    if (typeof relative !== 'string' || relative.length > 1000 || /[\\\x00-\x1f]/.test(relative)) {
      throw failure('Invalid workspace path.');
    }
    const parts = relative.split('/');
    if (parts.some(part => !part || part === '.' || part === '..' || hidden.has(part))) {
      throw failure('Choose a path inside the workspace.');
    }
    let current = root;
    for (const part of parts) {
      current = path.join(current, part);
      try {
        if ((await fs.lstat(current)).isSymbolicLink()) throw failure('Symbolic links cannot be opened here.');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    return current;
  }

  async function tree() {
    const entries = [];
    async function walk(directory, prefix) {
      const children = await fs.readdir(directory, { withFileTypes: true });
      children.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
      for (const child of children) {
        if (hidden.has(child.name) || child.isSymbolicLink()) continue;
        const relative = prefix ? prefix + '/' + child.name : child.name;
        if (child.isDirectory() || child.isFile()) entries.push({ path: relative, directory: child.isDirectory() });
        if (entries.length > 8000) throw failure('Choose a smaller workspace directory.');
        if (child.isDirectory()) await walk(path.join(directory, child.name), relative);
      }
    }
    await walk(root, '');
    return entries;
  }

  async function read(relative) {
    const filename = await locate(relative);
    const stat = await fs.stat(filename);
    if (!stat.isFile() || stat.size > maxFileBytes) throw failure('Open a text file under 512 KiB.');
    const contents = await fs.readFile(filename);
    if (contents.includes(0)) throw failure('This editor opens text files.');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(contents);
    return { path: relative, text, revision: revision(text) };
  }

  function save(relative, text, expectedRevision) {
    if (typeof text !== 'string' || Buffer.byteLength(text) > maxFileBytes) throw failure('File is too large.');
    const previous = pending.get(relative) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      const filename = await locate(relative);
      const original = await read(relative);
      if (original.revision !== expectedRevision) throw failure('This file changed on disk. Reopen it before saving.', 409);
      const tmp = path.join(path.dirname(filename), '.keyline-' + randomUUID());
      try {
        const { mode } = await fs.stat(filename);
        await fs.writeFile(tmp, text, { flag: 'wx', mode });
        await fs.rename(tmp, filename);
      } finally {
        await fs.rm(tmp, { force: true });
      }
      return { path: relative, text, revision: revision(text) };
    });
    pending.set(relative, task);
    task.finally(() => { if (pending.get(relative) === task) pending.delete(relative); }).catch(() => {});
    return task;
  }

  async function create(relative, directory = false) {
    const filename = await locate(relative);
    if (directory) {
      await fs.mkdir(filename);
      return { path: relative, directory: true };
    }
    await fs.writeFile(filename, '', { flag: 'wx' });
    return read(relative);
  }

  return { root, name: path.basename(root), id: revision(root).slice(0, 18), starter: !configuredRoot, tree, locate, read, save, create };
}
