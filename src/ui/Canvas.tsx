import { useEffect, useRef, useState } from 'react';
import { GLCapabilities, MainToWorkerMsg, Preset, WorkerToMainMsg } from '../engine/types';

interface CanvasProps {
  preset: Preset;
  isPaused: boolean;
  onReset: boolean;
  resetComplete: () => void;
  onViewChange: (view: { scale: number; offset: { x: number; y: number } }) => void;
  fitRequest: { version: number; warmup: number };
}

export function Canvas({ preset, isPaused, onReset, resetComplete, onViewChange, fitRequest }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const offscreenRef = useRef<OffscreenCanvas | null>(null);
  const [capabilities, setCapabilities] = useState<GLCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const presetSendTimer = useRef<number | null>(null);
  const viewRef = useRef<{ scale: number; offset: { x: number; y: number } }>({
    scale: preset.view?.scale ?? 1,
    offset: preset.view?.offset ?? { x: 0, y: 0 },
  });
  const lastFitVersion = useRef(0);

  const postResize = (worker: Worker) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const resizeMsg: MainToWorkerMsg = {
      type: 'resize',
      width: rect.width,
      height: rect.height,
      dpr,
    };
    worker.postMessage(resizeMsg);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    if (!offscreenRef.current) {
      offscreenRef.current = canvas.transferControlToOffscreen();
    }
    const offscreen = offscreenRef.current;

    const worker = new Worker(
      new URL('../worker/renderWorker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerToMainMsg>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'ready':
          setCapabilities(msg.capabilities);
          setError(null);
          break;
        case 'error':
          console.error('[Main] Worker error:', msg.message, msg.stack);
          setError(msg.message);
          break;
        case 'fitResult':
          onViewChange(msg.view);
          break;
      }
    };

    const rect = container.getBoundingClientRect();
    const initMsg: MainToWorkerMsg = {
      type: 'init',
      canvas: offscreen,
      width: rect.width,
      height: rect.height,
      dpr: window.devicePixelRatio || 1,
      preset,
    };
    worker.postMessage(initMsg, [offscreen as any]);

    postResize(worker);

    resizeObserverRef.current = new ResizeObserver(() => postResize(worker));
    resizeObserverRef.current.observe(container);

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      worker.postMessage({ type: 'dispose' } satisfies MainToWorkerMsg);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (workerRef.current) {
      if (presetSendTimer.current) {
        clearTimeout(presetSendTimer.current);
      }
      presetSendTimer.current = window.setTimeout(() => {
        const msg: MainToWorkerMsg = {
          type: 'updatePreset',
          preset,
        };
        workerRef.current?.postMessage(msg);
        presetSendTimer.current = null;
      }, 60);
    }
  }, [preset]);

  useEffect(() => {
    viewRef.current = {
      scale: preset.view?.scale ?? viewRef.current.scale,
      offset: preset.view?.offset ?? viewRef.current.offset,
    };
  }, [preset.view?.scale, preset.view?.offset?.x, preset.view?.offset?.y]);

  useEffect(() => {
    if (!workerRef.current) return;
    if (fitRequest.version === lastFitVersion.current) return;
    lastFitVersion.current = fitRequest.version;
    workerRef.current.postMessage({ type: 'fitView', warmup: fitRequest.warmup } satisfies MainToWorkerMsg);
  }, [fitRequest]);

  useEffect(() => {
    if (workerRef.current) {
      const msg: MainToWorkerMsg = {
        type: 'setPaused',
        paused: isPaused,
      };
      workerRef.current.postMessage(msg);
    }
  }, [isPaused]);

  useEffect(() => {
    if (onReset) {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'resetAccum' } satisfies MainToWorkerMsg);
      }
      resetComplete();
    }
  }, [onReset, resetComplete]);

  // Pan/zoom interactions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateView = (scale: number, offset: { x: number; y: number }) => {
      viewRef.current = { scale, offset };
      onViewChange(viewRef.current);
    };

    const toClip = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = 1 - ((clientY - rect.top) / rect.height) * 2;
      return { x, y };
    };

    let dragging = false;
    let last = { x: 0, y: 0 };

    const onDown = (e: PointerEvent) => {
      dragging = true;
      last = { x: e.clientX, y: e.clientY };
      container.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const rect = container.getBoundingClientRect();
      const dx = ((e.clientX - last.x) / rect.width) * 2;
      const dy = (-(e.clientY - last.y) / rect.height) * 2;
      last = { x: e.clientX, y: e.clientY };
      updateView(viewRef.current.scale, {
        x: viewRef.current.offset.x + dx,
        y: viewRef.current.offset.y + dy,
      });
    };

    const onUp = (e: PointerEvent) => {
      dragging = false;
      container.releasePointerCapture(e.pointerId);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoom = Math.exp(-e.deltaY * 0.001);
      const oldScale = viewRef.current.scale;
      const newScale = Math.max(0.0001, oldScale * zoom);
      const clip = toClip(e.clientX, e.clientY);
      const worldX = (clip.x - viewRef.current.offset.x) / oldScale;
      const worldY = (clip.y - viewRef.current.offset.y) / oldScale;
      const newOffset = {
        x: clip.x - worldX * newScale,
        y: clip.y - worldY * newScale,
      };
      updateView(newScale, newOffset);
    };

    container.addEventListener('pointerdown', onDown);
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerup', onUp);
    container.addEventListener('pointerleave', onUp);
    container.addEventListener('wheel', onWheel, { passive: false });
    const handleDblClick = () => {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'fitView', warmup: 0 } satisfies MainToWorkerMsg);
      }
    };
    container.addEventListener('dblclick', handleDblClick);

    return () => {
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointerleave', onUp);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('dblclick', handleDblClick);
    };
  }, [onViewChange]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', backgroundColor: '#000' }}
    >
      {error && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            right: 12,
            padding: '8px 12px',
            backgroundColor: '#3a0f0f',
            color: '#ffb3b3',
            border: '1px solid #5a1a1a',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '12px',
            zIndex: 2,
          }}
        >
          GPU Error: {error}
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
      <AxisOverlays view={viewRef.current} invert={!!preset.render.invert} paletteId={preset.render.palette === 'magma' ? 1 : preset.render.palette === 'viridis' ? 2 : preset.render.palette === 'turbo' ? 3 : 0} />
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          padding: '4px 8px',
          backgroundColor: 'rgba(0,0,0,0.4)',
          color: '#d0d0d0',
          fontFamily: 'monospace',
          fontSize: '12px',
          borderRadius: '4px',
          pointerEvents: 'none',
        }}
      >
        {capabilities
          ? `GPU: OK (${capabilities.supportedExtensions.slice(0, 3).join(', ') || 'no extensions'})`
          : 'GPU: initializing...'}
      </div>
    </div>
  );
}

function AxisOverlays({ view, invert, paletteId }: { view: { scale: number; offset: { x: number; y: number } }; invert: boolean; paletteId: number }) {
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
