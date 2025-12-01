interface AxisOverlaysProps {
  view: { scale: number; offset: { x: number; y: number } };
  invert: boolean;
  paletteId: number;
}

export function AxisOverlays({ view, invert, paletteId }: AxisOverlaysProps) {
  const paletteMax = (id: number) => {
    switch (id) {
      case 1: // magma top
        return '#f6d746';
      case 2: // viridis top
        return '#fde725';
      case 3: // turbo top
        return '#ff9400';
      default:
        return '#ffffff';
    }
  };
  const tickColor = invert ? '#111' : paletteMax(paletteId);
  const minorColor = invert ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.35)';

  const computeTicks = (min: number, max: number) => {
    const range = Math.max(1e-6, max - min);
    const rawStep = range / 4;
    const pow10 = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const steps = [1, 2, 5, 10];
    let majorStep = pow10;
    for (const s of steps) {
      if (rawStep <= s * pow10) {
        majorStep = s * pow10;
        break;
      }
    }
    const minorStep = majorStep / 5;
    const majors: number[] = [];
    const minors: number[] = [];
    const start = Math.floor(min / minorStep) * minorStep;
    for (let v = start; v <= max + minorStep; v += minorStep) {
      const isMajor = Math.abs(v / majorStep - Math.round(v / majorStep)) < 1e-6;
      if (isMajor) majors.push(v);
      else minors.push(v);
    }
    return { majors, minors, majorStep };
  };

  const worldBounds = {
    minX: (-1 - view.offset.x) / view.scale,
    maxX: (1 - view.offset.x) / view.scale,
    minY: (-1 - view.offset.y) / view.scale,
    maxY: (1 - view.offset.y) / view.scale,
  };

  const xTicks = computeTicks(worldBounds.minX, worldBounds.maxX);
  const yTicks = computeTicks(worldBounds.minY, worldBounds.maxY);

  const format = (v: number) => {
    const abs = Math.abs(v);
    if (Math.abs(v) < 1e-6) return '0.00';
    if (abs >= 1000 || abs < 0.001) return v.toExponential(2);
    return v.toFixed(abs < 1 ? 3 : 2);
  };

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 24,
          pointerEvents: 'none',
        }}
      >
        {xTicks.minors.map((v) => {
          const t = (v - worldBounds.minX) / (worldBounds.maxX - worldBounds.minX);
          const x = `${t * 100}%`;
          return (
            <div
              key={`xmin-${v}`}
              style={{
                position: 'absolute',
                left: x,
                width: 1,
                height: 10,
                background: minorColor,
                transform: 'translateX(-0.5px)',
              }}
            />
          );
        })}
        {xTicks.majors.map((v) => {
          const t = (v - worldBounds.minX) / (worldBounds.maxX - worldBounds.minX);
          const x = `${t * 100}%`;
          return (
            <div key={`xmaj-${v}`} style={{ position: 'absolute', left: x, transform: 'translateX(-50%)' }}>
              <div style={{ width: 1, height: 16, background: tickColor, margin: '0 auto' }} />
              <div style={{ color: tickColor, fontSize: 10, textAlign: 'center', marginTop: 2, fontFamily: 'monospace' }}>
                {format(v)}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: 48,
          pointerEvents: 'none',
        }}
      >
        {yTicks.minors.map((v) => {
          const t = (v - worldBounds.minY) / (worldBounds.maxY - worldBounds.minY);
          const y = `${(1 - t) * 100}%`;
          return (
            <div
              key={`ymin-${v}`}
              style={{
                position: 'absolute',
                top: y,
                right: 0,
                height: 1,
                width: 16,
                background: minorColor,
                transform: 'translateY(-0.5px)',
              }}
            />
          );
        })}
        {yTicks.majors.map((v) => {
          const t = (v - worldBounds.minY) / (worldBounds.maxY - worldBounds.minY);
          const y = `${(1 - t) * 100}%`;
          return (
            <div key={`ymaj-${v}`} style={{ position: 'absolute', top: y, right: 0, transform: 'translateY(-50%)', width: 48, height: 12 }}>
              <div style={{ position: 'absolute', top: '50%', right: 0, transform: 'translateY(-50%)', height: 1, width: 16, background: tickColor }} />
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  right: 18,
                  transform: 'translateY(-50%)',
                  color: tickColor,
                  fontSize: 10,
                  textAlign: 'right',
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                }}
              >
                {format(v)}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

