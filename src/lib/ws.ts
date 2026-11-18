// WebSocket-клиент с автопереподключением и подпиской на комнаты (encounter:<id>, cashier).
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

export function startRealtime() {
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
