// Milky Mic by TheSPX (https://github.com/TheSPX) · MIT licensed
// Milky Mic receiver: a tiny local server plus the website that plays what the phone sends.
//   phone  --WebSocket /stream (hello + raw 48 kHz mono 16-bit PCM)-->  this server  --WebSocket /ui-->  the page in your browser
// The page plays it to the output you pick (VB-Cable's "CABLE Input"), so other apps can use "CABLE Output" as a mic.
//
// Pairing: the phone's first message is "POCKETMIC <pairing code> <phone model>". The code is shown on the page,
// made once and kept in pairing.json, so you only type it into the phone one time.
const http = require('http')
const fs = require('fs')
const path = require('path')
const os = require('os')
const dgram = require('dgram')
const crypto = require('crypto')
const { exec } = require('child_process')
const { WebSocketServer } = require('ws')

// Must match android/src/stream.ts
const PORT = 48770
const DISCOVERY_PORT = 48771

const PUBLIC = path.join(__dirname, 'public')
const CODE_FILE = path.join(__dirname, 'pairing.json')
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
}

// The page and its control channel are for this PC only. Only the phone's /stream is open to the network.
const isLocal = a => a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1'
const originOk = o => o === `http://localhost:${PORT}` || o === `http://127.0.0.1:${PORT}`

function localIps() {
  return Object.values(os.networkInterfaces()).flat()
    .filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address)
}

/* ── pairing code ── */
const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0')
function loadCode() {
  if (/^\d{6}$/.test(process.env.MILKY_MIC_CODE || '')) return process.env.MILKY_MIC_CODE // tests and power users
  try {
    const c = JSON.parse(fs.readFileSync(CODE_FILE, 'utf8')).code
    if (/^\d{6}$/.test(c)) return c
  } catch {}
  const c = newCode()
  try { fs.writeFileSync(CODE_FILE, JSON.stringify({ code: c })) } catch {}
  return c
}
let code = loadCode()
function regenerate() {
  code = newCode()
  if (!process.env.MILKY_MIC_CODE) { try { fs.writeFileSync(CODE_FILE, JSON.stringify({ code })) } catch {} }
  toUis(JSON.stringify({ type: 'code', code }), false)
}
const sameCode = given => {
  const a = Buffer.from(String(given)), b = Buffer.from(code)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// Too many wrong guesses from one address locks it out for a minute; a flood anywhere changes the code.
const guesses = new Map() // ip -> { n, until }
let totalFailures = 0
const LOCK_AFTER = 5, LOCK_MS = 60000, CHANGE_AFTER = 50

const server = http.createServer((req, res) => {
  if (!isLocal(req.socket.remoteAddress)) { res.writeHead(403).end('Local only'); return }
  const url = new URL(req.url, 'http://localhost').pathname
  if (url === '/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ips: localIps(), hostname: os.hostname(), code }))
    return
  }
  const file = path.join(PUBLIC, url === '/' ? 'index.html' : decodeURIComponent(url))
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403).end('Forbidden'); return }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' })
    res.end(data)
  })
})

const phones = new WebSocketServer({ noServer: true, maxPayload: 1 << 16 })
const uis = new WebSocketServer({ noServer: true })
let phone = null // the one paired, connected phone
let pending = 0  // sockets that have not said hello yet

server.on('upgrade', (req, socket, head) => {
  const url = req.url.split('?')[0]
  if (url === '/stream') phones.handleUpgrade(req, socket, head, ws => phones.emit('connection', ws, req))
  else if (url === '/ui' && isLocal(req.socket.remoteAddress) && originOk(req.headers.origin)) {
    uis.handleUpgrade(req, socket, head, ws => uis.emit('connection', ws, req))
  } else socket.destroy()
})

const state = () => JSON.stringify({ type: 'phone', ...(phone && phone.info ? phone.info : { name: null }) })
function toUis(data, binary) {
  for (const c of uis.clients) if (c.readyState === 1 && c.bufferedAmount < 1e6) c.send(data, { binary })
}

phones.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress.replace('::ffff:', '')
  const lock = guesses.get(ip)
  if (lock && lock.until > Date.now()) { ws.close(4004, 'too many tries'); return }
  if (pending >= 5) { ws.close(1013, 'busy'); return }
  pending++
  let counted = true
  const settle = () => { if (counted) { counted = false; pending-- } }
  let spare = null // odd trailing byte, so samples stay 16-bit aligned
  let alive = true

  const hello = setTimeout(() => { if (!ws.info) ws.close(4002, 'no hello') }, 5000)
  const ping = setInterval(() => { // a phone that walked off the Wi-Fi never says goodbye
    if (!alive) return ws.terminate()
    alive = false
    ws.ping()
  }, 15000)
  ws.on('pong', () => { alive = true })

  ws.on('message', (data, isBinary) => {
    if (!ws.info) {
      const parts = isBinary ? [] : data.toString().trim().split(/\s+/)
      if (parts[0] !== 'POCKETMIC') return ws.close(4002, 'bad hello')
      settle()
      if (!sameCode(parts[1] || '')) {
        const g = guesses.get(ip) || { n: 0, until: 0 }
        if (++g.n >= LOCK_AFTER) { g.n = 0; g.until = Date.now() + LOCK_MS }
        guesses.set(ip, g)
        if (++totalFailures >= CHANGE_AFTER) { totalFailures = 0; regenerate() }
        return ws.close(4003, 'wrong code')
      }
      guesses.delete(ip)
      if (phone && phone !== ws) {
        if (phone.info.ip !== ip) return ws.close(4001, 'busy') // another phone has the PC
        const old = phone // same phone coming back after a drop: let it take over
        phone = ws
        old.terminate()
      }
      phone = ws
      ws.info = { name: (parts.slice(2).join(' ') || 'Phone').slice(0, 64), ip }
      ws.send('ready')
      toUis(state(), false)
      return
    }
    if (!isBinary) return
    let chunk = Buffer.from(data)
    if (spare) { chunk = Buffer.concat([spare, chunk]); spare = null }
    if (chunk.length & 1) { spare = chunk.subarray(chunk.length - 1); chunk = chunk.subarray(0, chunk.length - 1) }
    if (chunk.length) toUis(chunk, true)
  })

  const gone = () => {
    settle(); clearTimeout(hello); clearInterval(ping)
    if (phone === ws) { phone = null; toUis(state(), false) }
  }
  ws.on('close', gone)
  ws.on('error', () => ws.terminate())
})

uis.on('connection', ws => {
  ws.send(state())
  ws.send(JSON.stringify({ type: 'code', code }))
  ws.on('message', data => {
    const msg = data.toString()
    if (msg === 'disconnect' && phone) phone.close(1000, 'disconnected from PC')
    if (msg === 'newcode') regenerate()
  })
  ws.on('error', () => ws.terminate())
})

server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Is Milky Mic already running?` : e.message)
  process.exit(1)
})

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`
  console.log(`\n  Milky Mic is running.  (by TheSPX)\n\n  Open:         ${url}\n  On the phone: ${localIps().join('  or  ') || '(no network found)'}\n  Pairing code: ${code}\n`)
  if (!process.argv.includes('--no-open')) {
    const open = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`
    exec(open, () => {})
  }
})

// Lets the phone find this PC without typing an IP.
const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true })
udp.on('message', (msg, rinfo) => {
  if (msg.toString().startsWith('POCKETMIC?')) udp.send(`POCKETMIC!${os.hostname()}`, rinfo.port, rinfo.address)
})
udp.on('error', () => {})
udp.bind(DISCOVERY_PORT)
