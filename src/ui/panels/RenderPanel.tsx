import { RenderParams, clampRender } from '../../engine/types';
import { DEFAULT_DECAY, DEFAULT_EXPOSURE, DEFAULT_GAMMA } from '../../engine/constants';
import { Theme } from '../theme';
import { InfoTip } from '../components/InfoTip';
import { Knob } from '../components/Knob';
import { ToggleSwitch } from '../components/ToggleSwitch';

interface RenderPanelProps {
  render: RenderParams;
  onRenderChange: (render: RenderParams) => void;
  theme: Theme;
}

export function RenderPanel({ render, onRenderChange, theme }: RenderPanelProps) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: `${theme.spacing.xs + 2}px ${theme.spacing.sm}px`,
    background: theme.colors.iconBg,
    border: theme.border,
    color: theme.colors.text,
    borderRadius: theme.radius / 2,
    fontFamily: theme.font,
    fontSize: 13,
    marginTop: 4,
  };

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    color: theme.colors.muted,
    fontSize: 12,
  };

  const knobRow: React.CSSProperties = {
    display: 'flex',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
      <div style={labelStyle}>Palette <InfoTip helpKey="render.palette" theme={theme} /></div>
      <select
        value={render.palette}
        onChange={(e) => onRenderChange(clampRender({ ...render, palette: e.target.value as RenderParams['palette'] }))}
        style={inputStyle}
      >
        <option value="grayscale">Grayscale</option>
        <option value="magma">Magma</option>
        <option value="viridis">Viridis</option>
        <option value="turbo">Turbo</option>
      </select>

      <div style={knobRow}>
        <Knob
          label="Exposure"
          value={render.exposure}
          min={0.05}
          max={5}
          step={0.05}
          defaultValue={DEFAULT_EXPOSURE}
          onChange={(v) => onRenderChange(clampRender({ ...render, exposure: v }))}
          theme={theme}
        />
        <Knob
          label="Gamma"
          value={render.gamma}
          min={0.05}
          max={3}
          step={0.05}
          defaultValue={DEFAULT_GAMMA}
          onChange={(v) => onRenderChange(clampRender({ ...render, gamma: v }))}
          theme={theme}
        />
        <Knob
          label="Decay"
          value={render.decay}
          min={0}
          max={1}
          step={0.005}
          defaultValue={DEFAULT_DECAY}
          onChange={(v) => onRenderChange(clampRender({ ...render, decay: v }))}
          theme={theme}
        />
      </div>

      <label style={{ color: theme.colors.muted, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <ToggleSwitch
          checked={!!render.invert}
          onChange={(v) => onRenderChange(clampRender({ ...render, invert: v }))}
          label="Invert"
          theme={theme}
        />
        <InfoTip helpKey="render.invert" theme={theme} />
      </label>
    </div>
  );
}
