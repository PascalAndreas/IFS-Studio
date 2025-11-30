import { useEffect, useRef, useState } from 'react';
import { GLCapabilities, MainToWorkerMsg, Preset, WorkerToMainMsg } from '../engine/types';

interface CanvasProps {
  preset: Preset;
  isPaused: boolean;
  onReset: boolean;
  resetComplete: () => void;
}

export function Canvas({ preset, isPaused, onReset, resetComplete }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [capabilities, setCapabilities] = useState<GLCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);

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

    const offscreen = canvas.transferControlToOffscreen();

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
    };
  }, []);

  useEffect(() => {
    if (workerRef.current) {
      const msg: MainToWorkerMsg = {
        type: 'updatePreset',
        preset,
      };
      workerRef.current.postMessage(msg);
    }
  }, [preset]);

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
      resetComplete();
    }
  }, [onReset, resetComplete]);

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
