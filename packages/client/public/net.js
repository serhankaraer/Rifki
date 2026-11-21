// WebSocket bağlantısı: otomatik yeniden bağlanma (üstel bekleme), oturum token'ı ile koltuğa dönüş, periyodik ping.
export function createNet({ url, onMessage, onStatus, getToken, WebSocketImpl = globalThis.WebSocket, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let ws = null;
  let attempt = 0;
  let stopped = false;
  let retryTimer = null;
  let pingTimer = null;

  function stopPing() { if (pingTimer) { clearInterval(pingTimer); pingTimer = null; } }

  function connect() {
    if (stopped) return;
    onStatus(attempt === 0 ? 'connecting' : 'reconnecting');
    const sock = new WebSocketImpl(url);
    ws = sock;
    sock.onopen = () => {
      attempt = 0;
      onStatus('open');
      const token = getToken();
      if (token) send({ t: 'RESUME', token });
      stopPing();
      pingTimer = setInterval(() => send({ t: 'PING' }), 20000);
    };
    sock.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg && typeof msg.t === 'string') onMessage(msg);
    };
    sock.onclose = () => {
      stopPing();
      if (ws === sock) ws = null;
      if (stopped) return;
      attempt += 1;
      onStatus('reconnecting');
      const delay = Math.min(5000, 500 * 2 ** Math.min(attempt - 1, 4)) + Math.floor(Math.random() * 300);
      retryTimer = setTimer(connect, delay);
    };
    sock.onerror = () => { /* onclose zaten tetiklenir */ };
  }

  function send(msg) {
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(msg)); return true; }
    return false;
  }

  return {
    start: connect,
    send,
    stop() { stopped = true; stopPing(); if (retryTimer) clearTimer(retryTimer); ws?.close(); },
  };
}
