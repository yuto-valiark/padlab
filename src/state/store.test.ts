import { beforeEach, describe, expect, it } from 'vitest';
import { BAR_TICKS, STEP_TICKS } from '../audio/sequence';
import { useStudio } from './store';

const st = () => useStudio.getState();

beforeEach(() => useStudio.setState({ pattern: { bars: 1, notes: [] }, past: [], future: [], tcIndex: 2, tcStrength: 1 }));

describe('step editing', () => {
  it('toggles a step on and off', () => {
    expect(st().toggleStep(0, 4, 1)).toBe('add');
    expect(st().pattern.notes).toMatchObject([{ pad: 0, tick: 4 * STEP_TICKS }]);
    expect(st().toggleStep(0, 4, 1)).toBe('remove');
    expect(st().pattern.notes).toHaveLength(0);
  });
  it('drag-paint mode does not flip existing steps', () => {
    st().toggleStep(0, 1, 1);
    st().toggleStep(0, 1, 1, 'add');
    expect(st().pattern.notes).toHaveLength(1);
  });
});

describe('recording', () => {
  it('merges a repeated hit on the same spot instead of stacking', () => {
    st().recordNote(3, 48, 0.5);
    st().recordNote(3, 48.5, 1);
    expect(st().pattern.notes).toHaveLength(1);
    expect(st().pattern.notes[0].vel).toBe(1);
  });
});

describe('undo / redo', () => {
  it('undoes a whole take back to its checkpoint', () => {
    st().checkpoint();
    st().recordNote(0, 0, 1);
    st().recordNote(2, 96, 1);
    st().undo();
    expect(st().pattern.notes).toHaveLength(0);
    st().redo();
    expect(st().pattern.notes).toHaveLength(2);
  });
});

describe('pattern length', () => {
  it('doubling copies notes into the new bar', () => {
    st().toggleStep(0, 0, 1);
    st().setBars(2);
    expect(st().pattern.notes.map((n) => n.tick).sort((a, b) => a - b)).toEqual([0, BAR_TICKS]);
  });
  it('shrinking drops notes past the end', () => {
    useStudio.setState({ pattern: { bars: 2, notes: [{ id: 1, pad: 0, tick: BAR_TICKS + 5, vel: 1 }] } });
    st().setBars(1);
    expect(st().pattern.notes).toHaveLength(0);
  });
});

describe('quantizeAll', () => {
  it('snaps and merges', () => {
    useStudio.setState({
      pattern: { bars: 1, notes: [{ id: 1, pad: 0, tick: 23, vel: 1 }, { id: 2, pad: 0, tick: 25, vel: 1 }] },
    });
    st().quantizeAll();
    expect(st().pattern.notes).toMatchObject([{ tick: 24 }]);
  });
});

describe('patterns & song', () => {
  beforeEach(() =>
    useStudio.setState({ pattern: { bars: 1, notes: [] }, patterns: [{ bars: 1, notes: [] }], current: 0, song: [{ pattern: 0, repeats: 1 }] }),
  );
  it('edits stay in sync with the pattern list', () => {
    st().toggleStep(0, 0, 1);
    expect(st().patterns[0].notes).toHaveLength(1);
  });
  it('adds, switches and copies patterns', () => {
    st().toggleStep(0, 0, 1);
    st().addPattern(true);
    expect(st().current).toBe(1);
    expect(st().pattern.notes).toHaveLength(1);
    st().toggleStep(1, 2, 1);
    st().selectPattern(0);
    expect(st().pattern.notes).toHaveLength(1);
    expect(st().patterns[1].notes).toHaveLength(2);
  });
  it('deleting a pattern fixes up the song', () => {
    st().addPattern(false);
    st().addSongStep(1);
    st().addSongStep(0);
    st().deletePattern(0);
    expect(st().patterns).toHaveLength(1);
    expect(st().song).toEqual([{ pattern: 0, repeats: 1 }]);
  });
  it('clamps repeats', () => {
    st().setSongStep(0, { repeats: 99 });
    expect(st().song[0].repeats).toBe(16);
  });
});
