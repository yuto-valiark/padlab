import { create } from 'zustand';

const TOUR_KEY = 'padlab.tour.v1';

interface UiState {
  help: boolean;
  tour: number | null; // current tour step, null = not running
  setHelp: (on: boolean) => void;
  startTour: () => void;
  setTour: (step: number | null) => void;
}

export const useUi = create<UiState>()((set) => ({
  help: false,
  tour: null,
  setHelp: (help) => set({ help }),
  startTour: () => set({ tour: 0, help: false }),
  setTour: (tour) => {
    if (tour === null) {
      try {
        localStorage.setItem(TOUR_KEY, '1');
      } catch {
        /* ignore */
      }
    }
    set({ tour });
  },
}));

export function tourSeen() {
  try {
    return !!localStorage.getItem(TOUR_KEY);
  } catch {
    return true;
  }
}
