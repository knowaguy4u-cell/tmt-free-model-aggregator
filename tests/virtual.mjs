// Socket-free test adapter. Production source and sealed kit programs are evaluated unchanged.
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const servers = new Map();
let nextPort = 19000;
export function createServer(handler) {
  const server = new EventEmitter();
  server.listen = (arg, host, callback) => {
    const port = (typeof arg === 'object' ? arg.port : arg) || ++nextPort;
    server.port = port; servers.set(port, handler);
    queueMicrotask(() => (typeof host === 'function' ? host : callback)?.());
    return server;
  };
  server.address = () => ({ port: server.port, address: '127.0.0.1' });
  server.close = cb => { servers.delete(server.port); cb?.(); };
  server.closeAllConnections = () => {};
  return server;
}
async function virtualFetch(url, options = {}) {
  const u = new URL(url);
  const handler = servers.get(Number(u.port));
  if (!handler) throw new Error('No virtual listener ' + url);
  const req = new EventEmitter();
  req.url = u.pathname; req.method = options.method || 'GET';
  req.headers = Object.fromEntries(new Headers(options.headers));
  req.socket = { remoteAddress: '127.0.0.1' };
  const body = Buffer.from(options.body || '');
  req[Symbol.asyncIterator] = async function* () { if (body.length) yield body; };
  let controller;
  const stream = new ReadableStream({ start(c) { controller = c; } });
  return new Promise((resolve, reject) => {
    const res = {
      headersSent: false, status: 200, headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      writeHead(status, headers = {}) {
        this.status = status; this.headers = { ...this.headers, ...headers }; this.headersSent = true;
        resolve(new Response(stream, { status, headers: this.headers })); return this;
      },
      write(data) { if (!this.headersSent) this.writeHead(200); controller.enqueue(Buffer.from(data)); return true; },
      end(data) { if (!this.headersSent) this.writeHead(200); if (data) this.write(data); controller.close(); },
    };
    Promise.resolve(handler(req, res)).catch(reject);
    queueMicrotask(() => { if (body.length) req.emit('data', body); req.emit('end'); });
  });
}
export async function launch(path, variables, args = []) {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  const timers = new Set();
  const proc = new EventEmitter();
  proc.env = variables; proc.argv = [process.execPath, path, ...args];
  proc.stdout = { write(s, cb) { child.stdout.emit('data', s); cb?.(); return true; } };
  proc.stderr = { write(s) { child.stderr.emit('data', s); return true; } };
  let exited = false;
  proc.exit = code => { if (exited) return; exited = true; for (const t of timers) clearInterval(t); queueMicrotask(() => child.emit('exit', code)); };
  child.kill = (signal = 'SIGTERM') => { proc.emit(signal); if (!exited) proc.exit(0); };
  const context = vm.createContext({ console, Buffer, process: proc, fetch: virtualFetch, URL, TextDecoder, TextEncoder, AbortController, AbortSignal, ReadableStream,
    setTimeout, clearTimeout, setInterval(fn, ms) { const t = setInterval(fn, ms); timers.add(t); return t; }, clearInterval });
  const cache = new Map();
  async function moduleOf(url) {
    if (cache.has(url)) return cache.get(url);
    if (url.startsWith('node:')) {
      const exports = url === 'node:http' ? { createServer } : await import(url);
      const mod = new vm.SyntheticModule(Object.keys(exports), function () { for (const [k, v] of Object.entries(exports)) this.setExport(k, v); }, { context, identifier: url });
      cache.set(url, mod); return mod;
    }
    let source = readFileSync(fileURLToPath(url), 'utf8');
    if (url.endsWith('.ts')) source = stripTypeScriptTypes(source);
    const mod = new vm.SourceTextModule(source, { context, identifier: url, initializeImportMeta(meta) { meta.url = url; } });
    cache.set(url, mod);
    return mod;
  }
  const mod = await moduleOf(pathToFileURL(path).href);
  await mod.link((specifier, parent) => moduleOf(specifier.startsWith('node:') ? specifier : new URL(specifier, parent.identifier).href));
  // Delay evaluation so callers can install exit/log listeners.
  child.ready = new Promise((resolve, reject) => setTimeout(() => mod.evaluate().then(resolve, reject), 0));
  return child;
}
