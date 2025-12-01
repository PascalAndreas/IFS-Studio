import { Theme } from '../theme';

export interface IconButtonProps {
  icon: string;
  label?: string;
  onClick?: () => void;
  active?: boolean;
  size?: number;
  title?: string;
}

export function ThemedIconButton(props: IconButtonProps & { theme: Theme }) {
  const { icon, label, onClick, active, size = 40, title, theme } = props;
  return (
    <button
      type="button"
      title={title || label || icon}
      aria-label={label || icon}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: theme.radius,
        border: theme.border,
        background: active ? theme.colors.iconActive : theme.colors.iconBg,
        color: theme.colors.text,
        fontSize: 18,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 120ms ease, transform 120ms ease',
        fontFamily: theme.font,
        boxShadow: theme.shadow,
      }}
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={(e) => {
        const target = e.currentTarget;
        target.style.background = theme.colors.iconHover;
      }}
      onMouseLeave={(e) => {
        const target = e.currentTarget;
        target.style.background = active ? theme.colors.iconActive : theme.colors.iconBg;
      }}
    >
      <span style={{ pointerEvents: 'none' }}>{icon}</span>
    </button>
  );
}
