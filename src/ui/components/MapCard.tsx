import { IFSMap } from '../../engine/types';
import { useEffect, useState } from 'react';
import { Theme } from '../theme';
import { InfoTip } from './InfoTip';
import { VectorPad } from './VectorPad';
import { Knob } from './Knob';
import { ToggleSwitch } from './ToggleSwitch';

type UpdateFn = (path: (string | number)[], value: any) => void;

interface MapCardProps {
  map: IFSMap;
  index: number;
  theme: Theme;
  showRaw: boolean;
  onUpdate: UpdateFn;
  onDuplicate: () => void;
  onRemove: () => void;
  maxMapsReached: boolean;
  smallButton: React.CSSProperties;
  inputStyle: React.CSSProperties;
  totalMaps: number;
  gains: { g1: number; g2: number; b: number };
  onGainChange: (key: 'g1' | 'g2' | 'b', value: number) => void;
  probability: number;
  onProbabilityChange: (value: number) => void;
}

export function MapCard({
  map,
  index,
  theme,
  showRaw,
  onUpdate,
  onDuplicate,
  onRemove,
  maxMapsReached,
  smallButton,
  inputStyle,
  totalMaps,
  gains,
  onGainChange,
  probability,
  onProbabilityChange,
}: MapCardProps) {
  const vectorRows = [
    { label: 'g1', keys: ['a11', 'a21'] as const, vec: { x: map.affine.a11, y: map.affine.a21 }, gain: gains.g1 ?? 1, gainKey: 'g1' as const },
    { label: 'g2', keys: ['a12', 'a22'] as const, vec: { x: map.affine.a12, y: map.affine.a22 }, gain: gains.g2 ?? 1, gainKey: 'g2' as const },
    { label: 'b', keys: ['b1', 'b2'] as const, vec: { x: map.affine.b1, y: map.affine.b2 }, gain: gains.b ?? 1, gainKey: 'b' as const },
  ];

  const warpAParams = ['a1', 'a2', 'a3', 'a4'] as const;
  const warpKParams = ['k1', 'k2', 'k3', 'k4'] as const;
  const cardHeight = 432;
  const initialVectors = () => ({
    g1: gains.g1 && gains.g1 !== 0 ? { x: map.affine.a11 / gains.g1, y: map.affine.a21 / gains.g1 } : { x: map.affine.a11, y: map.affine.a21 },
    g2: gains.g2 && gains.g2 !== 0 ? { x: map.affine.a12 / gains.g2, y: map.affine.a22 / gains.g2 } : { x: map.affine.a12, y: map.affine.a22 },
    b: gains.b && gains.b !== 0 ? { x: map.affine.b1 / gains.b, y: map.affine.b2 / gains.b } : { x: map.affine.b1, y: map.affine.b2 },
  });
  const [vectors, setVectors] = useState(initialVectors);

  useEffect(() => {
    setVectors(initialVectors());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.affine.a11, map.affine.a12, map.affine.a21, map.affine.a22, map.affine.b1, map.affine.b2]);

  const updateAffineWithGain = (keys: readonly (keyof IFSMap['affine'])[], vec: { x: number; y: number }, gain: number) => {
    const nextAffine = {
      ...map.affine,
      [keys[0]]: vec.x * gain,
      [keys[1]]: vec.y * gain,
    };
    onUpdate(['maps', index, 'affine'], nextAffine);
  };

  return (
    <div
      style={{
        border: theme.border,
        borderRadius: theme.radius,
        padding: theme.spacing.sm,
        background: theme.colors.iconBg,
        color: theme.colors.text,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: 'auto 1fr',
        gap: theme.spacing.sm,
        minWidth: 500,
        maxWidth: 620,
        boxSizing: 'border-box',
        height: cardHeight,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gridColumn: '1 / span 2' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs, color: theme.colors.muted }}>
          <span>Map {index + 1}</span>
        </div>
        <div style={{ display: 'flex', gap: theme.spacing.xs }}>
          <button style={smallButton} onClick={onDuplicate} disabled={maxMapsReached}>
            Duplicate
          </button>
          <button style={smallButton} onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
        {!showRaw ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
            {vectorRows.map((row, i) => {
              const gain = row.gain;
              const displayVec = (vectors as any)[row.label] as { x: number; y: number };
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
                  <VectorPad
                    value={displayVec}
                    onChange={(v) => {
                      setVectors((prev) => ({ ...prev, [row.label]: v }));
                      updateAffineWithGain(row.keys, v, gain);
                    }}
                    size={120}
                    theme={theme}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: theme.spacing.xs }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
                      <Knob
                        label={row.label === 'b' ? 'b gain' : row.label}
                        value={gain}
                        min={0}
                        max={2}
                        step={0.01}
                        defaultValue={1}
                        onChange={(v) => {
                          updateAffineWithGain(row.keys, displayVec, v);
                          onGainChange(row.gainKey, v);
                        }}
                        theme={theme}
                      />
                      <InfoTip helpKey="maps.gain" theme={theme} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ color: theme.colors.muted, fontSize: 12 }}>Probability</label>
              <input
                type="number"
                step="0.01"
                value={probability}
                onChange={(e) => onProbabilityChange(parseFloat(e.target.value || '0'))}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
              <div style={{ color: theme.colors.muted, fontSize: 12 }}>A</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: theme.spacing.xs }}>
                {(['a11', 'a12', 'a21', 'a22'] as const).map((key) => (
                  <input
                    key={key}
                    type="number"
                    step="0.01"
                    value={(map.affine as any)[key]}
                    onChange={(e) => onUpdate(['maps', index, 'affine', key], parseFloat(e.target.value || '0'))}
                    style={inputStyle}
                    placeholder={key}
                  />
                ))}
              </div>
              <div style={{ color: theme.colors.muted, fontSize: 12 }}>b</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: theme.spacing.xs }}>
                {(['b1', 'b2'] as const).map((key) => (
                  <input
                    key={key}
                    type="number"
                    step="0.01"
                    value={(map.affine as any)[key]}
                    onChange={(e) => onUpdate(['maps', index, 'affine', key], parseFloat(e.target.value || '0'))}
                    style={inputStyle}
                    placeholder={key}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm, height: '100%', justifyContent: 'flex-start', alignItems: 'center', paddingTop: theme.spacing.sm }}>
        {!showRaw && (
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs, justifyContent: 'center' }}>
            <Knob
              label="Prob"
              value={probability}
              min={0}
              max={1}
              step={0.01}
              defaultValue={1 / Math.max(1, totalMaps)}
              onChange={(v) => onProbabilityChange(v)}
              theme={theme}
            />
            <InfoTip helpKey="maps.probability" theme={theme} />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs, justifyContent: 'center' }}>
          <ToggleSwitch
            checked={map.warp.enabled}
            onChange={(v) => onUpdate(['maps', index, 'warp', 'enabled'], v)}
            label="Warp"
            theme={theme}
          />
          <InfoTip helpKey="maps.warp" theme={theme} />
        </div>
        {map.warp.enabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs, width: '100%' }}>
            <div style={{ color: theme.colors.muted, fontSize: 12 }}>A</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: theme.spacing.xs }}>
              {warpAParams.map((key) => (
                <input
                  key={key}
                  type="number"
                  step={0.01}
                  value={(map.warp as any)[key]}
                  onChange={(e) => onUpdate(['maps', index, 'warp', key], parseFloat(e.target.value || '0'))}
                  style={{ ...inputStyle, marginTop: 0 }}
                  placeholder={key}
                />
              ))}
            </div>
            <div style={{ color: theme.colors.muted, fontSize: 12, marginTop: theme.spacing.xs }}>K</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: theme.spacing.xs }}>
              {warpKParams.map((key) => (
                <input
                  key={key}
                  type="number"
                  step={0.1}
                  value={(map.warp as any)[key]}
                  onChange={(e) => onUpdate(['maps', index, 'warp', key], parseFloat(e.target.value || '0'))}
                  style={{ ...inputStyle, marginTop: 0 }}
                  placeholder={key}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
