import { useMemo } from 'react';
import type { WorkerDiagnostics } from '../../engine/types';
import { Theme } from '../theme';

interface DiagnosticPanelProps {
  diagnostics: WorkerDiagnostics | null;
  theme: Theme;
}

export function DiagnosticPanel({ diagnostics, theme }: DiagnosticPanelProps) {
  const text = useMemo(() => JSON.stringify(diagnostics ?? {}, null, 2), [diagnostics]);

  const rows: Array<[string, string | number]> = diagnostics
    ? [
        ['frame', diagnostics.frame],
        ['fps', diagnostics.fps.toFixed(1)],
        ['view.scale', diagnostics.viewScale.toExponential(3)],
        ['view.offset.x', diagnostics.viewOffset.x.toExponential(3)],
        ['view.offset.y', diagnostics.viewOffset.y.toExponential(3)],
        ['points.global', diagnostics.numPointsGlobal],
        ['points.local', diagnostics.numPointsLocal],
        ['drawnPoints', diagnostics.drawnPoints],
        ['localSample', diagnostics.localSampleCount],
        ['localInView', diagnostics.localInViewCount],
        ['localInViewFrac', (diagnostics.localSampleCount > 0 ? diagnostics.localInViewCount / diagnostics.localSampleCount : 0).toFixed(3)],
        ['localAge>=burn', diagnostics.localAgeGeBurn],
        ['localAge>=burn inView', diagnostics.localAgeGeBurnInView],
        ['globalAge>=burn', diagnostics.globalAgeGeBurn],
        ['globalAge>=burn inView', diagnostics.globalAgeGeBurnInView],
        ['respawnSeeds', diagnostics.respawnSeeds],
        ['respawnSeedsSource', diagnostics.respawnSeedsSource],
        ['respawnProb', diagnostics.respawnProb.toFixed(4)],
        ['respawnBoostFrames', diagnostics.respawnBoostFrames],
        ['decay', diagnostics.decay],
        ['exposure', diagnostics.exposure],
        ['gamma', diagnostics.gamma],
        ['burnIn', diagnostics.burnIn],
      ]
    : [];

  const copy = () => {
    void navigator.clipboard?.writeText(text);
  };

  return (
    <div
      style={{
        background: theme.colors.panelBg,
        border: theme.border,
        borderRadius: theme.radius,
        padding: theme.spacing.sm,
        color: theme.colors.text,
        fontFamily: 'monospace',
        fontSize: 12,
        boxShadow: '0 6px 24px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.xs }}>
        <div style={{ fontWeight: 600 }}>Diagnostics</div>
        <button
          onClick={copy}
          style={{
            background: theme.colors.accent,
            color: '#000',
            border: 'none',
            borderRadius: 4,
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          Copy
        </button>
      </div>
      {rows.length === 0 ? (
        <div style={{ opacity: 0.7 }}>Awaiting data…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ opacity: 0.7 }}>{k}</span>
              <span style={{ textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
