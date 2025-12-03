import { SimParams, clampSim } from '../../engine/types';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { DEFAULT_MAX_POST_FPS, DEFAULT_SIM_STEPS_PER_TICK } from '../../engine/constants';
import { Theme } from '../theme';
import { InfoTip } from '../components/InfoTip';

interface SimPanelProps {
  sim: SimParams;
  onSimChange: (sim: SimParams) => void;
  theme: Theme;
}

export function SimPanel({ sim, onSimChange, theme }: SimPanelProps) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: `${theme.spacing.xs + 2}px ${theme.spacing.sm}px`,
    backgroundColor: 'rgba(0,0,0,0.12)',
    border: theme.border,
    color: theme.colors.text,
    borderRadius: theme.radius / 2,
    fontFamily: theme.font,
    fontSize: 13,
    marginTop: 4,
    background: theme.colors.iconBg,
  };

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    color: theme.colors.muted,
    fontSize: 12,
  };

  const rowStyle: React.CSSProperties = {
    marginBottom: theme.spacing.sm,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
      <div style={rowStyle}>
        <div style={labelStyle}>Seed <InfoTip helpKey="sim.seed" theme={theme} /></div>
        <input
          type="number"
          value={sim.seed}
          onChange={(e) => onSimChange(clampSim({ ...sim, seed: parseInt(e.target.value || '0', 10) }))}
          style={inputStyle}
        />
      </div>
      <div style={rowStyle}>
        <div style={labelStyle}>Num Points <InfoTip helpKey="sim.numPoints" theme={theme} /></div>
        <input
          type="number"
          value={sim.numPoints}
          onChange={(e) => onSimChange(clampSim({ ...sim, numPoints: parseInt(e.target.value || '0', 10) }))}
          style={inputStyle}
        />
      </div>
      <div style={rowStyle}>
        <div style={labelStyle}>Burn In <InfoTip helpKey="sim.burnIn" theme={theme} /></div>
        <input
          type="number"
          value={sim.burnIn}
          onChange={(e) => onSimChange(clampSim({ ...sim, burnIn: parseInt(e.target.value || '0', 10) }))}
          style={inputStyle}
        />
      </div>
      <div style={rowStyle}>
        <div style={labelStyle}>Iters / Step <InfoTip helpKey="sim.itersPerStep" theme={theme} /></div>
        <input
          type="number"
          value={sim.itersPerStep ?? 16}
          min={1}
          onChange={(e) => onSimChange(clampSim({ ...sim, itersPerStep: parseInt(e.target.value || '1', 10) }))}
          style={inputStyle}
        />
      </div>
      <div style={rowStyle}>
        <div style={labelStyle}>Sim Steps / Tick <InfoTip helpKey="sim.simStepsPerTick" theme={theme} /></div>
        <input
          type="number"
          value={sim.simStepsPerTick ?? DEFAULT_SIM_STEPS_PER_TICK}
          min={1}
          onChange={(e) => onSimChange(clampSim({ ...sim, simStepsPerTick: parseInt(e.target.value || '1', 10) }))}
          style={inputStyle}
        />
      </div>
      <div style={rowStyle}>
        <div style={labelStyle}>Post Max FPS <InfoTip helpKey="sim.maxPostFps" theme={theme} /></div>
        <input
          type="number"
          value={sim.maxPostFps ?? DEFAULT_MAX_POST_FPS}
          min={1}
          onChange={(e) => onSimChange(clampSim({ ...sim, maxPostFps: parseInt(e.target.value || '1', 10) }))}
          style={inputStyle}
        />
      </div>
      <div style={{ ...rowStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <ToggleSwitch
          checked={!!sim.useGuard}
          onChange={(v) => onSimChange(clampSim({ ...sim, useGuard: v }))}
          label="NaN Guard"
          theme={theme}
        />
        <InfoTip helpKey="sim.useGuard" theme={theme} />
      </div>
    </div>
  );
}
