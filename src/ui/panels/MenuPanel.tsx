import { Theme } from '../theme';
import { InfoTip } from '../components/InfoTip';

interface MenuPanelProps {
  onExport: () => void;
  onImport: (file: File) => void;
  theme: Theme;
}

export function MenuPanel({ onExport, onImport, theme }: MenuPanelProps) {
  const buttonStyle: React.CSSProperties = {
    width: '100%',
    padding: `${theme.spacing.xs + 2}px ${theme.spacing.sm}px`,
    background: theme.colors.iconBg,
    border: theme.border,
    color: theme.colors.text,
    borderRadius: theme.radius / 2,
    fontFamily: theme.font,
    cursor: 'pointer',
    fontSize: 13,
    marginBottom: theme.spacing.xs,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
      <div style={{ color: theme.colors.muted, fontSize: 12, display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
        Import/Export
        <InfoTip helpKey="menu.import" theme={theme} />
      </div>
      <button onClick={onExport} style={buttonStyle}>
        Export JSON
      </button>
      <label style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        Import JSON
        <input
          type="file"
          accept=".json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImport(file);
          }}
          style={{ display: 'none' }}
        />
      </label>
    </div>
  );
}
