// Milky Mic by TheSPX (https://github.com/TheSPX) · MIT licensed
// End-to-end check of the receiver: starts the real server, plays a fake phone and a fake page against it.
// Silent: it only moves bytes over WebSockets and never plays any sound.
const { spawn } = require('child_process')
const assert = require('assert')
const dgram = require('dgram')
const os = require('os')
const WebSocket = require('ws')

const PORT = 48770
const ORIGIN = `http://localhost:${PORT}`
const CODE = '123456'
let last = ''
const step = n => { last = n }
setTimeout(() => { console.error('TIMED OUT after step:', last); process.exit(2) }, 30000).unref()
const wait = ms => new Promise(r => setTimeout(r, ms))
const open = ws => new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); ws.once('unexpected-response', () => rej(new Error('rejected'))) })

// a fake phone: resolves with what the server says and how it closes
async function phone(hello) {
  const ws = new WebSocket(`ws://localhost:${PORT}/stream`)
  const said = []
  const closed = new Promise(r => ws.on('close', code => r(code)))
  ws.on('message', d => said.push(d.toString()))
  await open(ws)
  if (hello) { try { ws.send(hello) } catch {} } // the server may already have closed on a locked address
  return { ws, said, closed }
}

async function main() {
  const server = spawn(process.execPath, ['server.js', '--no-open'], { cwd: __dirname, stdio: 'ignore', env: { ...process.env, MILKY_MIC_CODE: CODE } })
  try {
    await wait(800)

    // the page is served, and only to this machine
    step('the page is served, and only to this machine')
    const page = await fetch(`${ORIGIN}/`).then(r => r.text())
    assert(/milky mic/i.test(page), 'page served')
    const info = await fetch(`${ORIGIN}/info`).then(r => r.json())
    assert.strictEqual(info.code, CODE, 'the page can read the pairing code')

    // a page from another site must not get the control channel
    step('a page from another site must not get the control ')
    await assert.rejects(open(new WebSocket(`ws://localhost:${PORT}/ui`, { origin: 'http://evil.example' })), 'foreign origin refused')

    const ui = new WebSocket(`ws://localhost:${PORT}/ui`, { origin: ORIGIN })
    const seen = []
    ui.on('message', (d, bin) => seen.push(bin ? d : JSON.parse(d.toString())))
    await open(ui)
    await wait(100)
    assert.deepStrictEqual(seen[0], { type: 'phone', name: null }, 'starts with no phone')
    assert.deepStrictEqual(seen[1], { type: 'code', code: CODE }, 'page is told the code')

    // a wrong code is turned away, and no audio is accepted before pairing
    step('a wrong code is turned away, and no audio is accep')
    const bad = await phone('POCKETMIC 000000 Intruder')
    assert.strictEqual(await bad.closed, 4003, 'wrong code refused')
    const noHello = await phone(null)
    noHello.ws.send(Buffer.alloc(100, 1))
    assert.strictEqual(await noHello.closed, 4002, 'audio before hello refused')
    assert(!seen.some(Buffer.isBuffer), 'no audio leaked to the page')

    // the right code pairs, and audio with an odd chunk size arrives 16-bit aligned
    step('the right code pairs, and audio with an odd chunk ')
    const p1 = await phone(`POCKETMIC ${CODE} Test Phone`)
    await wait(150)
    assert(p1.said.includes('ready'), 'phone is told it is paired')
    assert.strictEqual(seen.filter(m => m.type === 'phone').pop().name, 'Test Phone', 'page learns the phone name')
    p1.ws.send(Buffer.alloc(1921, 1)) // odd: one byte must be held back
    p1.ws.send(Buffer.alloc(1, 1))
    await wait(150)
    const audio = seen.filter(Buffer.isBuffer)
    assert(audio.length >= 1 && audio.every(b => b.length % 2 === 0), 'audio reaches the page 16-bit aligned')
    assert.strictEqual(audio.reduce((n, b) => n + b.length, 0), 1922, 'no bytes lost')

    // the same phone coming back after a drop takes over without waiting for the old link to time out
    step('the same phone coming back after a drop takes over')
    const p2 = await phone(`POCKETMIC ${CODE} Test Phone again`)
    assert.strictEqual(await p1.closed, 1006, 'the stale link is dropped')
    await wait(100)
    assert(p2.said.includes('ready'), 'returning phone is paired')
    assert.strictEqual(seen.filter(m => m.type === 'phone').pop().name, 'Test Phone again', 'page follows the new link')

    // discovery answers
    step('discovery answers')
    const reply = await new Promise((res, rej) => {
      const u = dgram.createSocket('udp4')
      u.on('message', m => { u.close(); res(m.toString()) })
      u.send('POCKETMIC?', 48771, '127.0.0.1')
      setTimeout(() => rej(new Error('no discovery reply')), 1500)
    })
    assert.strictEqual(reply, `POCKETMIC!${os.hostname()}`, 'discovery reply')

    // the page can disconnect the phone
    step('the page can disconnect the phone')
    ui.send('disconnect')
    await p2.closed
    await wait(100)
    assert.deepStrictEqual(seen.filter(m => m.type === 'phone').pop(), { type: 'phone', name: null }, 'page learns the phone left')

    // the page can change the code
    step('the page can change the code')
    ui.send('newcode')
    await wait(150)
    const changed = seen.filter(m => m.type === 'code').pop().code
    assert(/^\d{6}$/.test(changed) && changed !== CODE, 'a new code is made and shown')
    const old = await phone(`POCKETMIC ${CODE} Old Code`)
    assert.strictEqual(await old.closed, 4003, 'the old code stops working')

    // five wrong guesses lock that address out for a while
    step('five wrong guesses lock that address out for a whi')
    for (let i = 0; i < 4; i++) await (await phone('POCKETMIC 111111 Guess')).closed // with the old-code try above that is five
    const locked = await phone(`POCKETMIC ${changed} Right code, too late`)
    assert.strictEqual(await locked.closed, 4004, 'a guessing address is locked out')

    ui.close()
    console.log('all receiver checks passed')
  } finally {
    server.kill()
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
