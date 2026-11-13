import { useEffect } from 'react';
import { engine } from './audio/engine';
import { loadFileToPad } from './audio/sampler';
import { installKeyboard } from './input/keyboard';
import { bootProjects } from './state/project';
import { useStudio } from './state/store';
import { Boot } from './ui/Boot';
import { emitHit } from './ui/hitBus';
import { Legend } from './ui/Legend';
import { PadGrid } from './ui/PadGrid';
import { Help } from './ui/Help';
import { Toast } from './ui/Toast';
import { Tour } from './ui/Tour';
import { tourSeen, useUi } from './ui/uiStore';
import { useProject } from './state/project';
import { TopBar } from './ui/TopBar';
import { Visualizer } from './ui/Visualizer';
import { Workspace } from './ui/Workspace';

export default function App() {
  const phase = useStudio((s) => s.phase);

  useEffect(() => {
    const s = useStudio.getState();
    engine
      .init((done, total) => s.setProgress(done / total))
      .then(() => bootProjects())
      .then(() => useStudio.getState().phase === 'loading' && s.setPhase('ready'));
    // Dropping a file anywhere (not on a specific pad) loads it onto the selected pad,
    // instead of the browser navigating away to play the file.
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer?.files[0];
      const st = useStudio.getState();
      if (f && st.phase === 'on') loadFileToPad(f, st.selected).catch((err) => st.setNotice((err as Error).message));
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    const uninstall = installKeyboard();
    return () => {
      uninstall();
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  // First time here: start the guided tour right after power-on.
  useEffect(() => {
    if (phase === 'on' && !tourSeen()) {
      const id = setTimeout(() => useUi.getState().startTour(), 700);
      return () => clearTimeout(id);
    }
  }, [phase]);

  const projectName = useProject((p) => p.name);
  useEffect(() => {
    document.title = `${projectName} — PADLAB`;
  }, [projectName]);

  // One rAF loop turns sounded hits into visuals (pads, LEDs, LCD).
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const due = engine.takeDueHits();
      for (const h of due) emitHit(h.pad, h.vel);
      if (due.length) {
        const last = due[due.length - 1];
        useStudio.getState().setLastHit(last.pad, last.vel);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={`app app--${phase}`}>
      <div className="grain" aria-hidden />
      <TopBar />
      <main className="deck">
        <section className="panel padpanel">
          <div className="screws" aria-hidden>
            <i /><i /><i /><i />
          </div>
          <PadGrid />
          <Legend />
        </section>
        <Workspace />
      </main>
      <Visualizer />
      <Toast />
      <Help />
      <Tour />
      <Boot />
    </div>
  );
}
