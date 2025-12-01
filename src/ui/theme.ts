import { RenderParams } from '../engine/types';

export type Theme = {
  font: string;
  spacing: { xs: number; sm: number; md: number; lg: number };
  radius: number;
  blur: string;
  border: string;
  shadow: string;
  colors: {
    panelBg: string;
    panelBorder: string;
    text: string;
    muted: string;
    accent: string;
    iconBg: string;
    iconHover: string;
    iconActive: string;
    badgeBg: string;
  };
};

type PaletteName = RenderParams['palette'];

type PaletteColors = {
  accent: string;
  panelBg: string;
  panelBorder: string;
  text: string;
  muted: string;
  badgeBg: string;
};

const paletteMap: Record<PaletteName, PaletteColors> = {
  grayscale: {
    accent: '#8cf7ff',
    panelBg: 'rgba(20, 24, 28, 0.78)',
    panelBorder: 'rgba(140, 247, 255, 0.35)',
    text: '#e7f2f5',
    muted: 'rgba(231, 242, 245, 0.7)',
    badgeBg: 'rgba(140, 247, 255, 0.12)',
  },
  magma: {
    accent: '#f6d746',
    panelBg: 'rgba(26, 18, 10, 0.82)',
    panelBorder: 'rgba(246, 215, 70, 0.35)',
    text: '#fff5d6',
    muted: 'rgba(255, 245, 214, 0.7)',
    badgeBg: 'rgba(246, 215, 70, 0.12)',
  },
  viridis: {
    accent: '#a0e75a',
    panelBg: 'rgba(10, 18, 12, 0.82)',
    panelBorder: 'rgba(160, 231, 90, 0.35)',
    text: '#e6f7d9',
    muted: 'rgba(230, 247, 217, 0.72)',
    badgeBg: 'rgba(160, 231, 90, 0.12)',
  },
  turbo: {
    accent: '#ff9400',
    panelBg: 'rgba(24, 14, 2, 0.82)',
    panelBorder: 'rgba(255, 148, 0, 0.35)',
    text: '#ffe8c7',
    muted: 'rgba(255, 232, 199, 0.7)',
    badgeBg: 'rgba(255, 148, 0, 0.12)',
  },
};

export function buildTheme(palette: PaletteName, invert: boolean): Theme {
  const base = paletteMap[palette] ?? paletteMap.grayscale;
  const text = invert ? '#0e0e0e' : base.text;
  const muted = invert ? 'rgba(14, 14, 14, 0.65)' : base.muted;
  const panelBg = invert ? 'rgba(240, 240, 240, 0.8)' : base.panelBg;
  const panelBorder = invert ? 'rgba(14, 14, 14, 0.12)' : base.panelBorder;
  const accent = base.accent;
  return {
    font: "'IBM Plex Mono', 'Space Grotesk', 'SFMono-Regular', 'JetBrains Mono', monospace",
    spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
    radius: 12,
    blur: '12px',
    border: `1px solid ${panelBorder}`,
    shadow: '0 8px 24px rgba(0,0,0,0.4)',
    colors: {
      panelBg,
      panelBorder,
      text,
      muted,
      accent,
      iconBg: invert ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)',
      iconHover: invert ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)',
      iconActive: invert ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.2)',
      badgeBg: base.badgeBg,
    },
  };
}
