// WebSocket-клиент с автопереподключением и подпиской на комнаты (encounter:<id>, cashier).
// В облачной версии (Vercel) WebSocket нет — те же события приходят опросом /api/v1/events.
import { server } from './api';

type Listener = (payload: any, room: string) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

let socket: WebSocket | null = null;
let retry = 0;
const rooms = new Set<string>();
const listeners = new Map<string, Set<Listener>>();

function connect() {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  socket = new WebSocket(url);
  socket.onopen = () => {
    retry = 0;
    rooms.forEach((room) => socket?.send(JSON.stringify({ type: 'subscribe', room })));
  };
  socket.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data)) as { type: string; room: string; payload: unknown };
      listeners.get(msg.type)?.forEach((l) => l(msg.payload, msg.room));
    } catch { /* ignore */ }
  };
  socket.onclose = () => {
    socket = null;
    setTimeout(connect, Math.min(10000, 500 * 2 ** retry++));
  };
}

const deliver = (msg: { type: string; room: string; payload: unknown }) => {
  if (!rooms.has(msg.room)) return;
  listeners.get(msg.type)?.forEach((l) => l(msg.payload, msg.room));
};

let polling = false;
async function poll() {
  polling = true;
  let since = 0;
  for (;;) {
    try {
      // опрашиваем только когда открыт экран, которому нужны события (касса, карта приёма)
      if (rooms.size && (!document.hidden || since === 0)) {
        const r = await fetch(`/api/v1/events?since=${since}`, { cache: 'no-store' });
        if (r.ok) {
          const data = (await r.json()) as { seq: number; events: { room: string; type: string; payload: unknown }[] };
          if (since !== 0) data.events.forEach(deliver);
          since = data.seq || -1; // -1: событий ещё не было — дальше получаем все новые
        }
      }
    } catch { /* сеть пропала — попробуем позже */ }
    await new Promise((r) => setTimeout(r, document.hidden ? 30000 : 4000));
  }
}

export function startRealtime() {
  if (server.config?.realtime === 'poll') {
    if (!polling) void poll();
    return;
  }
  if (!socket) connect();
}

export function joinRoom(room: string) {
  rooms.add(room);
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'subscribe', room }));
}

export function leaveRoom(room: string) {
  rooms.delete(room);
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'unsubscribe', room }));
}

export function onEvent(type: string, listener: Listener) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type)!.add(listener);
  return () => listeners.get(type)?.delete(listener);
}
