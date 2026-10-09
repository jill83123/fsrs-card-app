import { State } from '@/lib/fsrs'

// charts with several categories use fixed colors, so they don't shift with the theme color;
// single-hue charts follow the theme
export const CHART_BLUE = '#5f93c4'

export const STATE_COLORS: Record<State, string> = {
  [State.New]: `color-mix(in oklab, ${CHART_BLUE} 40%, var(--surface-2))`,
  [State.Learning]: 'var(--warn)',
  [State.Review]: 'var(--success)',
  [State.Relearning]: 'var(--danger)',
}
