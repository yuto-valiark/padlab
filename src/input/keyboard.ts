import { engine } from '../audio/engine';
import { FULL_VEL, SOFT_VEL, tapTempo } from '../audio/timing';
import { useStudio } from '../state/store';
import { slotFromCode } from './keymap';
import { togglePractice } from '../practice/session';
import { useUi } from '../ui/uiStore';

let taps: number[] = [];

export function tap() {
  const s = useStudio.getState();
  const r = tapTempo(taps, performance.now() / 1000);
  taps = r.taps;
  if (r.bpm) s.setBpm(r.bpm);
}

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** Global keyboard → pads & transport. Returns an uninstall function. */
export function installKeyboard() {
  const down = (e: KeyboardEvent) => {
    if (isTyping(e.target)) return;
    const s = useStudio.getState();
    if (s.phase !== 'on') return;
    // ⌘Z / ⇧⌘Z undo-redo; every other ⌘/Ctrl shortcut (reload, devtools…) passes through.
    if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) s.redo();
      else s.undo();
      return;
    }
    if (e.metaKey || e.ctrlKey) return;

    const slot = slotFromCode(e.code);
    if (slot >= 0) {
      e.preventDefault();
      if (e.repeat || s.held[slot]) return;
      const pad = s.bank * 16 + slot;
      if (s.erasing) {
        // Hold Delete + pad = wipe that pad from the pattern (one undo step).
        s.clearPad(pad);
        s.select(pad);
        return;
      }
      const vel = e.shiftKey ? SOFT_VEL : FULL_VEL;
      s.press(slot, { pad, vel });
      s.select(pad);
      engine.padDown(pad, vel, e.altKey);
      return;
    }

    switch (e.code) {
      case 'Slash':
        // "?" (Shift + /) on both US and JIS layouts
        if (e.shiftKey || e.key === '?') {
          e.preventDefault();
          useUi.getState().setHelp(!useUi.getState().help);
        }
        break;
      case 'Space':
        e.preventDefault();
        if (!e.repeat) {
          if (s.tab === 'practice') togglePractice();
          else engine.togglePlay();
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (!e.repeat) engine.toggleRecord();
        break;
      case 'KeyM':
        e.preventDefault();
        if (!e.repeat) s.toggle('metronome');
        break;
      case 'Backspace':
      case 'Delete':
        e.preventDefault();
        s.setErasing(true);
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        e.preventDefault();
        s.setBank(s.bank + (e.code === 'ArrowLeft' ? -1 : 1));
        break;
      case 'BracketLeft':
      case 'BracketRight':
        e.preventDefault();
        s.stepRepeat(e.code === 'BracketLeft' ? -1 : 1);
        break;
      case 'Minus':
      case 'Equal':
        e.preventDefault();
        s.setBpm(s.bpm + (e.code === 'Minus' ? -1 : 1) * (e.shiftKey ? 0.1 : 1));
        break;
      case 'KeyT':
        e.preventDefault();
        if (!e.repeat) tap();
        break;
      case 'AltLeft':
      case 'AltRight':
        e.preventDefault();
        if (!e.repeat && !s.repeatOn) {
          s.setRepeatOn(true);
          engine.setRepeat(true, Object.values(s.held));
        }
        break;
    }
  };

  const up = (e: KeyboardEvent) => {
    const s = useStudio.getState();
    const slot = slotFromCode(e.code);
    if (slot >= 0) {
      const h = s.held[slot];
      if (h) {
        s.release(slot);
        engine.padUp(h.pad);
      }
      return;
    }
    if (e.code === 'Backspace' || e.code === 'Delete') {
      s.setErasing(false);
      return;
    }
    if (e.code === 'AltLeft' || e.code === 'AltRight') {
      s.setRepeatOn(false);
      engine.setRepeat(false, []);
    }
  };

  // Losing focus (⌘Tab etc.) swallows keyups — release everything so nothing sticks.
  const blur = () => {
    const s = useStudio.getState();
    s.releaseAll();
    s.setRepeatOn(false);
    s.setErasing(false);
    engine.stopAll();
  };

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
  };
}
