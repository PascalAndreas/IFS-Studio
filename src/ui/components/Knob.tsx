import { Theme } from '../theme';

export interface KnobProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label?: string;
  size?: number;
  theme: Theme;
  defaultValue?: number;
}

export function Knob({ value, min, max, step = 0.01, onChange, label, size = 56, theme, defaultValue }: KnobProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const angle = ((value - min) / (max - min)) * 270 - 135;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: size }}>
      <div style={{ color: theme.colors.text, fontSize: 11, textAlign: 'center' }}>
        {value.toFixed(2)}
      </div>
      <div
        onPointerDown={(e) => e.preventDefault()}
        onDoubleClick={() => {
          if (defaultValue !== undefined) {
            onChange(defaultValue);
          }
        }}
        onWheel={(e) => {
          e.preventDefault();
          const factor = e.shiftKey ? 0.2 : 1;
          const delta = (-e.deltaY / 400) * (max - min) * factor;
          const next = clamp(value + delta);
          const snapped = Math.round(next / step) * step;
          onChange(Number(snapped.toFixed(4)));
        }}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: theme.colors.iconBg,
          boxShadow: 'none',
          position: 'relative',
          cursor: 'grab',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 10,
            borderRadius: '50%',
            background: `linear-gradient(145deg, rgba(255,255,255,0.07), rgba(0,0,0,0.25))`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 2,
            height: size * 0.28,
            background: theme.colors.accent,
            top: size * 0.18,
            left: '50%',
            transform: `translateX(-50%) rotate(${angle}deg)`,
            transformOrigin: '50% 100%',
            borderRadius: 2,
          }}
        />
      </div>
      {label && (
        <div style={{ color: theme.colors.muted, fontSize: 11, textAlign: 'center', marginTop: 2 }}>
          {label}
        </div>
      )}
    </div>
  );
}
