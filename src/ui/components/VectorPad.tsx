import { useRef } from 'react';
import { Theme } from '../theme';

interface VectorPadProps {
  value: { x: number; y: number };
  onChange: (v: { x: number; y: number }) => void;
  size?: number;
  theme: Theme;
}

export function VectorPad({ value, onChange, size = 140, theme }: VectorPadProps) {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const current = useRef<{ x: number; y: number }>({ ...value });
  const dragged = useRef(false);
  current.current = value;
  return (
    <div
      style={{
        width: size,
        height: size,
        position: 'relative',
        background: theme.colors.iconBg,
        border: theme.border,
        borderRadius: 0,
        overflow: 'hidden',
        boxShadow: theme.shadow,
        touchAction: 'none',
        userSelect: 'none',
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        let last = { x: e.clientX, y: e.clientY };
        dragged.current = false;
        const onMove = (ev: PointerEvent) => {
          const factor = ev.shiftKey ? 0.1 : 1;
          const dx = ((ev.clientX - last.x) / rect.width) * 2 * factor;
          const dy = (-(ev.clientY - last.y) / rect.height) * 2 * factor;
          last = { x: ev.clientX, y: ev.clientY };
          dragged.current = true;
          const next = {
            x: clamp(current.current.x + dx),
            y: clamp(current.current.y + dy),
          };
          current.current = next;
          onChange(next);
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
      }}
      onClick={(e) => {
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ty = 1 - ((e.clientY - rect.top) / rect.height) * 2;
        onChange({ x: clamp(tx), y: clamp(ty) });
      }}
      onWheel={(e) => {
        e.preventDefault();
        const delta = (-e.deltaY / 400) * (e.shiftKey ? 1 : 1);
        const next = e.shiftKey
          ? { x: clamp(current.current.x + delta), y: current.current.y }
          : { x: current.current.x, y: clamp(current.current.y + delta) };
        current.current = next;
        onChange(next);
      }}
    >
      <div style={{ position: 'absolute', top: 4, left: 6, color: theme.colors.muted, fontSize: 10 }}>
        ({value.x.toFixed(2)}, {value.y.toFixed(2)})
      </div>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          height: 1,
          background: theme.colors.muted,
          opacity: 0.4,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: 1,
          background: theme.colors.muted,
          opacity: 0.4,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: theme.colors.accent,
          boxShadow: `0 0 12px ${theme.colors.accent}`,
          transform: `translate(${((value.x + 1) * 0.5 * size) - 5}px, ${((1 - value.y) * 0.5 * size) - 5}px)`,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
