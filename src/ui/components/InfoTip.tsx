import { useMemo, useState } from 'react';
import { helpText, HelpKey } from '../helpText';
import { Theme } from '../theme';

interface InfoTipProps {
  helpKey: HelpKey;
  theme: Theme;
}

export function InfoTip({ helpKey, theme }: InfoTipProps) {
  const [show, setShow] = useState(false);
  const text = useMemo(() => helpText[helpKey], [helpKey]);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        position: 'relative',
        marginLeft: 6,
        cursor: 'help',
        color: theme.colors.muted,
        fontSize: 11,
      }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      tabIndex={0}
      aria-label={text}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: `1px solid ${theme.colors.muted}`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: '14px',
        }}
      >
        i
      </span>
      {show && (
        <div
          style={{
            position: 'absolute',
            bottom: '110%',
            left: '100%',
            minWidth: 180,
            maxWidth: 260,
            padding: `${theme.spacing.xs + 2}px ${theme.spacing.sm}px`,
            borderRadius: theme.radius,
            background: theme.colors.panelBg,
            border: theme.border,
            boxShadow: theme.shadow,
            color: theme.colors.text,
            fontFamily: theme.font,
            fontSize: 12,
            zIndex: 20,
            transform: 'translateX(8px)',
            whiteSpace: 'normal',
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}
