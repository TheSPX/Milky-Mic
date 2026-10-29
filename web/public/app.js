// Milky Mic by TheSPX (https://github.com/TheSPX) · MIT licensed
// Milky Mic receiver page: shows the phone's state and plays its audio to the chosen output.
const $ = s => document.querySelector(s)
const RATE = 48000 // must match what the phone sends (48 kHz mono 16-bit PCM)

let ws, ctx, gain
let next = 0 // when the next chunk should start, in AudioContext time
let sinkId = ''
let serverUp = false, connected = false, muted = false
let phone = { name: null, ip: '' }

/* ── theme: the toggle (wake-slider.js) fires milky-theme-change ── */
let theme = 'white'
try { theme = localStorage.getItem('milkyMinimalTheme') === 'chocolate' ? 'chocolate' : 'white' } catch {}
function setTheme(t) {
  document.body.classList.toggle('chocolate', t === 'chocolate')
  $('#cartonicon').src = t === 'chocolate' ? 'chocolate-icon.png' : 'carton.png'
  $('#cartonopen').src = t === 'chocolate' ? 'chocolate-open.png' : 'carton-open.png'
  $('#flavor').textContent = t === 'chocolate' ? 'Chocolate Milk' : 'White Milky'
  document.querySelector('meta[name=theme-color]').content = t === 'chocolate' ? '#241913' : '#fffdf7'
  try { localStorage.setItem('milkyMinimalTheme', t) } catch {}
}
setTheme(theme)
window.addEventListener('milky-theme-change', e => setTheme(e.detail))

/* ── waveform: the loudest sample since the last tick, scrolling left ── */
const bars = []
for (let i = 0; i < 45; i++) { const b = document.createElement('i'); $('#wave').appendChild(b); bars.push(b) }
const history = new Array(45).fill(0)
let peakSince = 0
setInterval(() => {
  history.shift(); history.push(peakSince); peakSince = 0
  bars.forEach((b, i) => { b.style.height = 5 + Math.min(43, history[i] * 55) + 'px' })
}, 90)

/* ── state → words ── */
function render() {
  const live = connected
  document.body.classList.toggle('live', live)
  document.body.classList.toggle('idle', !live)
  document.body.classList.toggle('muted', live && muted)
  $('#status').textContent = !serverUp ? 'Receiver offline, is it still running?'
    : live ? `Phone connected · ${phone.name}` : 'Waiting for your phone…'
  $('#label').textContent = live ? (muted ? 'Muted on this PC' : 'Fresh sound. You’re on.') : 'Waiting for your phone'
  $('#hint').textContent = live
    ? (muted ? 'Tap the carton to unmute.' : `${phone.name} is sending its mic to this PC. Tap the carton to mute.`)
    : 'Open Milky Mic on your phone, on the same Wi-Fi as this PC.'
  $('#phoneLine').textContent = live ? `${phone.name} · ${phone.ip}` : 'Nothing connected yet.'
  $('#drop').disabled = !live
  $('#toggle').setAttribute('aria-pressed', String(live && muted))
  $('#toggle').setAttribute('aria-label', muted ? 'Unmute sound on this PC' : 'Mute sound on this PC')
  $('#cartonopen').setAttribute('aria-hidden', String(!live))
  $('#wave').setAttribute('aria-label', live && !muted ? 'Live sound from your phone' : 'No sound coming in')
}

function note(msg, bad) { const e = $('#err'); e.textContent = msg || ''; e.className = 'small center' + (bad ? ' warn' : '') }

/* ── playback ── */
const volume = () => Number($('#sensitivity').value) / 100

function ensureCtx() {
  if (!ctx) {
    ctx = new AudioContext({ sampleRate: RATE, latencyHint: 'interactive' })
    gain = ctx.createGain()
    gain.connect(ctx.destination)
    if (sinkId && ctx.setSinkId) ctx.setSinkId(sinkId).catch(e => note('Could not use that output: ' + e.message, true))
  }
  if (ctx.state === 'suspended') ctx.resume()
}
// browsers keep sound off until the page has been clicked once
document.addEventListener('pointerdown', ensureCtx)

function play(bytes) {
  if (muted) { next = 0; return }
  ensureCtx()
  if (ctx.state !== 'running') { note('Click anywhere on this page to turn the sound on.'); return }
  note('')
  gain.gain.value = volume()
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1)
  const buf = ctx.createBuffer(1, pcm.length, RATE)
  const ch = buf.getChannelData(0)
  let peak = 0
  for (let i = 0; i < pcm.length; i++) { const v = pcm[i] / 32768; ch[i] = v; if (Math.abs(v) > peak) peak = Math.abs(v) }
  peakSince = Math.max(peakSince, peak * volume())

  const now = ctx.currentTime
  if (next < now + 0.01) next = now + 0.06 // underrun: rebuild a 60 ms cushion
  if (next > now + 0.3) return               // too far behind: drop audio to keep latency low
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(gain)
  src.start(next)
  next += buf.duration
}

/* ── output devices ── */
const canPickOutput = typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype

async function loadOutputs() {
  const sel = $('#out'), hint = $('#cableHint')
  if (!canPickOutput || !navigator.mediaDevices?.enumerateDevices) {
    sel.replaceChildren(new Option('Default output', ''))
    sel.disabled = true
    hint.className = 'small warn'
    hint.textContent = 'This browser can’t choose an output device. Use Chrome or Edge to send sound to VB-Cable.'
    return
  }
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput')
  const named = devs.some(d => d.label)
  $('#names').hidden = named
  sel.replaceChildren(...(devs.length ? devs.map((d, i) => new Option(d.label || `Output ${i + 1}`, d.deviceId)) : [new Option('Default output', '')]))
  const cable = devs.find(d => /cable input/i.test(d.label))
  let saved = null
  try { saved = localStorage.getItem('milkyMicSink') } catch {}
  const pick = devs.find(d => d.deviceId === saved) || cable
  if (pick) sel.value = pick.deviceId
  sinkId = sel.value
  if (ctx && sinkId) ctx.setSinkId(sinkId).catch(() => {})
  if (!named) {
    hint.className = 'small'
    hint.textContent = 'Allow device names so Milky Mic can find VB-Cable. The browser will ask for the microphone once, only to list your devices.'
  } else if (cable) {
    hint.className = 'small'
    hint.textContent = 'VB-Cable found. In Discord or your game, pick “CABLE Output” as your microphone.'
  } else {
    hint.className = 'small warn'
    hint.textContent = 'VB-Cable not found. Install it free from vb-audio.com/Cable so other apps can use this as a microphone, then reload.'
  }
}

$('#out').onchange = () => {
  sinkId = $('#out').value
  try { localStorage.setItem('milkyMicSink', sinkId) } catch {}
  if (ctx) ctx.setSinkId(sinkId).catch(e => note(e.message, true))
}
$('#names').onclick = async () => {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true })
    s.getTracks().forEach(t => t.stop())
  } catch { note('Without that permission the device list stays unnamed.', true) }
  loadOutputs()
}

/* ── pairing code ── */
const showCode = c => { $('#code').textContent = c.replace(/^(\d{3})(\d{3})$/, '$1 $2') }

/* ── controls ── */
$('#toggle').onclick = () => {
  ensureCtx()
  if (!connected) return
  muted = !muted
  next = 0
  render()
}
$('#newcode').onclick = () => ws && ws.readyState === 1 && ws.send('newcode')
$('#drop').onclick = () => ws && ws.readyState === 1 && ws.send('disconnect')

/* ── the link to the local server ── */
function connect() {
  ws = new WebSocket(`ws://${location.host}/ui`)
  ws.binaryType = 'arraybuffer'
  ws.onopen = () => { serverUp = true; render() }
  ws.onclose = () => { serverUp = false; connected = false; render(); setTimeout(connect, 1000) }
  ws.onmessage = e => {
    if (typeof e.data !== 'string') { play(new Uint8Array(e.data)); return }
    const m = JSON.parse(e.data)
    if (m.type === 'code') { showCode(m.code); return }
    if (m.type !== 'phone') return
    connected = !!m.name
    phone = { name: m.name, ip: m.ip || '' }
    if (!connected) muted = false
    next = 0
    render()
  }
}

fetch('/info').then(r => r.json()).then(i => { $('#ips').textContent = i.ips.join('  ·  ') || 'no network found'; showCode(i.code) }).catch(() => {})
loadOutputs()
render()
connect()
