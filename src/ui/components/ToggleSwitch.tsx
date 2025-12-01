import { Theme } from '../theme';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  theme: Theme;
}

export function ToggleSwitch({ checked, onChange, label, theme }: ToggleSwitchProps) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <div
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        style={{
          width: 42,
          height: 22,
          borderRadius: 22,
          background: checked ? theme.colors.accent : theme.colors.iconBg,
          border: theme.border,
          position: 'relative',
          transition: 'background 160ms ease',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: theme.colors.panelBg,
            boxShadow: theme.shadow,
            transform: `translate(${checked ? 22 : 2}px, -50%)`,
            transition: 'transform 160ms ease',
          }}
        />
      </div>
      {label && <span style={{ color: theme.colors.muted, fontSize: 12 }}>{label}</span>}
    </label>
  );
}
