import { useEffect, useState } from 'react';
import { Theme } from '../theme';

interface CollapsibleIconPanelProps {
  icon: string;
  label: string;
  storageKey: string;
  theme: Theme;
  children: React.ReactNode;
  direction?: 'down' | 'up';
}

export function CollapsibleIconPanel({ icon, label, storageKey, theme, children, direction = 'down' }: CollapsibleIconPanelProps) {
  const [open, setOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved === null ? true : saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem(storageKey, String(open));
  }, [open, storageKey]);

  const size = 44;
  const isUp = direction === 'up';

  return (
    <div
      className="ui-card"
      style={{
        display: 'flex',
        flexDirection: isUp ? 'column-reverse' : 'column',
        background: open ? theme.colors.panelBg : theme.colors.iconBg,
        border: theme.border,
        borderRadius: theme.radius,
        color: theme.colors.text,
        fontFamily: theme.font,
        boxShadow: open ? theme.shadow : 'none',
        width: open ? 'fit-content' : size,
        minWidth: open ? 120 : size,
        maxWidth: open ? '90vw' : size,
        transition: 'all 180ms ease',
        overflow: open ? 'visible' : 'hidden',
        flex: '0 0 auto',
        alignSelf: 'flex-start',
        alignItems: 'flex-start',
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 0,
          cursor: 'pointer',
          height: size,
          padding: 0,
          userSelect: 'none',
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            width: size,
            height: size,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            lineHeight: 1,
            paddingLeft: 0,
          }}
        >
          {icon}
        </span>
        {open && (
          <span
            style={{
              flex: 1,
              paddingRight: theme.spacing.sm,
              color: theme.colors.muted,
              fontSize: 12,
              letterSpacing: 0.3,
              textAlign: 'left',
              paddingLeft: theme.spacing.xs,
            }}
          >
            {label}
          </span>
        )}
      </div>
      <div
        style={{
          maxHeight: open ? 2000 : 0,
          opacity: open ? 1 : 0,
          transition: 'max-height 200ms ease, opacity 180ms ease',
          padding: open ? `${theme.spacing.sm}px ${theme.spacing.md}px ${theme.spacing.md}px` : '0px',
        }}
      >
        {open && (
          <div style={{ marginTop: theme.spacing.xs }}>{children}</div>
        )}
      </div>
    </div>
  );
}
