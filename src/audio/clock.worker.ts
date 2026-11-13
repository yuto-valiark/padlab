// A timer that keeps ticking even when the tab is in the background
// (main-thread timers get throttled; worker timers far less so).
let id: ReturnType<typeof setInterval> | undefined;

self.onmessage = (e: MessageEvent<{ cmd: 'start' | 'stop'; ms?: number }>) => {
  if (id !== undefined) clearInterval(id);
  id = undefined;
  if (e.data.cmd === 'start') id = setInterval(() => self.postMessage('tick'), e.data.ms ?? 15);
};
