// Milky Mic by TheSPX (https://github.com/TheSPX) · MIT licensed
// The real phone-to-PC path. Only loaded when demo mode is off, so Expo Go (no native modules) can run the design.
//   mic -> raw 48 kHz mono 16-bit PCM -> WebSocket ws://<pc>:48770/stream -> web/server.js
// Pairing: the first message is "POCKETMIC <pairing code> <phone model>"; the PC answers "ready".
// If the link drops (Wi-Fi blip, PC asleep for a moment) the microphone keeps running and the phone retries.
import { useRef } from 'react';
import * as Device from 'expo-device';
import dgram from 'react-native-udp';
import { toByteArray } from 'base64-js';
import { useAudioRecorder, ExpoAudioStreamModule } from '@siteed/audio-studio';

// Must match web/server.js
const PORT = 48770;
const DISCOVERY_PORT = 48771;
const RETRY_EVERY_MS = 2000;
const RETRIES = 30; // about a minute

export type Pc = { name: string; ip: string };
export type Link = 'live' | 'reconnecting';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// close codes sent by web/server.js
const FATAL: Record<number, string> = {
  4001: 'Another phone is already connected to that PC',
  4003: 'Wrong pairing code. Check the code on the PC page.',
  4004: 'Too many wrong tries. Wait a minute and try again.',
};

type Opened = { sock: WebSocket } | { error: string; fatal: boolean };

/* open a socket and wait for the PC to say "ready" (or to refuse) */
function open(ip: string, code: string): Promise<Opened> {
  return new Promise(resolve => {
    const sock = new WebSocket(`ws://${ip}:${PORT}/stream`);
    sock.binaryType = 'arraybuffer';
    const unreachable = `Could not reach ${ip}. Is Milky Mic running on the PC, on the same Wi-Fi?`;
    const timer = setTimeout(() => { try { sock.close(); } catch {} resolve({ error: unreachable, fatal: false }); }, 6000);
    sock.onopen = () => sock.send(`POCKETMIC ${code} ${Device.modelName ?? 'Phone'}`);
    sock.onmessage = e => { if (e.data === 'ready') { clearTimeout(timer); resolve({ sock }); } };
    sock.onerror = () => {}; // onclose always follows
    sock.onclose = e => {
      clearTimeout(timer);
      resolve({ error: FATAL[e.code] ?? unreachable, fatal: e.code in FATAL });
    };
  });
}

export function useStreamer() {
  const socketRef = useRef<WebSocket | null>(null);
  const stopped = useRef(true);
  const { startRecording, stopRecording } = useAudioRecorder();

  function discover(onPc: (pc: Pc) => void, onStatus: (s: string) => void) {
    // shortcut: react-native-udp typings omit on(), cast until they are fixed
    const udp: any = dgram.createSocket({ type: 'udp4' });
    udp.on('error', () => onStatus('Discovery failed, enter the PC IP below'));
    udp.bind(0, () => {
      try {
        udp.setBroadcast(true);
        udp.send('POCKETMIC?', 0, 10, DISCOVERY_PORT, '255.255.255.255');
      } catch {
        onStatus('Discovery failed, enter the PC IP below');
      }
    });
    udp.on('message', (msg: any, rinfo: any) => {
      const text = msg.toString();
      if (text.startsWith('POCKETMIC!')) onPc({ name: text.slice(10), ip: rinfo.address });
    });
    setTimeout(() => { try { udp.close(); } catch {} }, 3000);
  }

  async function stop(onStatus?: (s: string) => void) {
    stopped.current = true;
    const sock = socketRef.current;
    socketRef.current = null;
    if (sock) { sock.onclose = null; sock.onerror = null; try { sock.close(); } catch {} }
    await stopRecording().catch(() => {});
    onStatus?.('Stopped');
  }

  /* resolves true once streaming. onLink reports drops and recoveries; onClosed fires when it gives up. */
  async function start(
    ip: string, code: string,
    onStatus: (s: string) => void, onLink: (l: Link) => void, onClosed: () => void,
  ): Promise<boolean> {
    const perm = await ExpoAudioStreamModule.requestPermissionsAsync();
    if (!perm.granted) { onStatus('Microphone permission denied'); return false; }

    onStatus('Connecting…');
    const first = await open(ip, code);
    if ('error' in first) { onStatus(first.error); return false; }
    stopped.current = false;

    const giveUp = (msg: string) => { if (stopped.current) return; onStatus(msg); stop(); onClosed(); };

    const attach = (sock: WebSocket) => {
      socketRef.current = sock;
      sock.onerror = () => {};
      sock.onclose = e => {
        if (socketRef.current !== sock || stopped.current) return;
        socketRef.current = null;
        if (e.code in FATAL) giveUp(FATAL[e.code]); else reconnect();
      };
    };

    /* the microphone keeps running; its audio is simply dropped until the PC is back */
    const reconnect = async () => {
      onLink('reconnecting');
      for (let i = 0; i < RETRIES; i++) {
        await sleep(RETRY_EVERY_MS);
        if (stopped.current) return;
        const r = await open(ip, code);
        if (stopped.current) { if ('sock' in r) try { r.sock.close(); } catch {} return; }
        if ('sock' in r) { attach(r.sock); onLink('live'); return; }
        if (r.fatal) { giveUp(r.error); return; }
      }
      giveUp('Lost the connection to the PC');
    };

    attach(first.sock);

    await startRecording({
      sampleRate: 48000,
      channels: 1,
      encoding: 'pcm_16bit',
      interval: 20,
      keepAwake: true,
      showNotification: true,
      notification: { title: 'Milky Mic', text: 'Streaming to your PC' },
      // shortcut: plain MIC source, no VOICE_COMMUNICATION echo/noise handling, upgrade with a custom native module
      onAudioStream: async (e: any) => {
        const sock = socketRef.current;
        if (!sock || sock.readyState !== 1) return;
        if (sock.bufferedAmount > 64 * 1024) return; // the Wi-Fi is behind: drop audio, keep latency low
        sock.send(toByteArray(e.data));
      },
    });
    return true;
  }

  return { discover, start, stop };
}
