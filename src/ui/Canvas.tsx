import { useEffect, useRef, useState } from 'react';
import { MainToWorkerMsg, Preset, WorkerToMainMsg, SimParams, RenderParams, WorkerDiagnostics } from '../engine/types';
import { CONFIG_UPDATE_DEBOUNCE_MS } from '../engine/constants';
import { AxisOverlays } from './AxisOverlays';
import { Theme } from './theme';

interface CanvasProps {
  preset: Preset;
  sim: SimParams;
  render: RenderParams;
  theme: Theme;
  onReset: boolean;
  resetComplete: () => void;
  onViewChange: (view: { scale: number; offset: { x: number; y: number } }) => void;
  fitRequest: { version: number; warmup: number };
  onDiagnostics?: (diag: WorkerDiagnostics) => void;
}

export function Canvas({ preset, sim, render, theme, onReset, resetComplete, onViewChange, fitRequest, onDiagnostics }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const offscreenRef = useRef<OffscreenCanvas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const updateTimer = useRef<number | null>(null);
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
          setError(null);
          break;
        case 'error':
          console.error('[Main] Worker error:', msg.message, msg.stack);
          setError(msg.message);
          break;
        case 'fitResult':
          onViewChange(msg.view);
          break;
        case 'diag':
          onDiagnostics?.(msg.data);
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
      sim,
      render,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only initialize worker once on mount
  }, []);

  useEffect(() => {
    if (workerRef.current) {
      if (updateTimer.current) {
        clearTimeout(updateTimer.current);
      }
      updateTimer.current = window.setTimeout(() => {
        const msg: MainToWorkerMsg = {
          type: 'updateConfig',
          preset,
          sim,
          render,
        };
        workerRef.current?.postMessage(msg);
        updateTimer.current = null;
      }, CONFIG_UPDATE_DEBOUNCE_MS);
    }
  }, [preset, sim, render]);

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
      <AxisOverlays view={viewRef.current} theme={theme} />
    </div>
  );
}
