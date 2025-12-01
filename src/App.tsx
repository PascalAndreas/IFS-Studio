/**
 * Main App component
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Preset,
  SimParams,
  RenderParams,
  createDefaultPreset,
  createDefaultSimParams,
  createDefaultRenderParams,
  clampPreset,
  clampSim,
  clampRender,
} from './engine/types';
import { FIT_VIEW_WARMUP_ITERATIONS } from './engine/constants';
import { Canvas } from './ui/Canvas';
import { mutatePreset, randomizePreset } from './ui/presetUtils';
import { OverlayRoot } from './ui/overlay/OverlayRoot';
import { buildTheme } from './ui/theme';

function App() {
  const [preset, setPreset] = useState<Preset>(createDefaultPreset());
  const [sim, setSim] = useState<SimParams>(createDefaultSimParams());
  const [render, setRender] = useState<RenderParams>(createDefaultRenderParams());
  const [resetTrigger, setResetTrigger] = useState(false);
  const [fitRequest, setFitRequest] = useState<{ version: number; warmup: number }>({ version: 0, warmup: 0 });

  const handlePresetChange = useCallback((newPreset: Preset) => {
    setPreset(clampPreset(newPreset));
  }, []);

  const handleSimChange = useCallback((s: SimParams) => {
    setSim(clampSim(s));
  }, []);

  const handleRenderChange = useCallback((r: RenderParams) => {
    setRender(clampRender(r));
  }, []);

  const handleRandomize = useCallback(() => {
    const randomized = randomizePreset({ sim, render });
    randomized.preset.view = preset.view;
    setPreset(clampPreset(randomized.preset));
    setFitRequest((f) => ({ version: f.version + 1, warmup: FIT_VIEW_WARMUP_ITERATIONS }));
  }, [preset.view, sim, render]);

  const handleMutate = useCallback(() => {
    setPreset((prev) => clampPreset(mutatePreset({ preset: prev, sim, render }).preset));
  }, [render, sim]);

  const handleReset = useCallback(() => {
    setResetTrigger(true);
  }, []);

  const handleResetComplete = useCallback(() => {
    setResetTrigger(false);
  }, []);

  const handleExport = useCallback(() => {
    const json = JSON.stringify({ preset, sim, render }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${preset.name || 'preset'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [preset, sim, render]);

  const handleImport = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const parsed = JSON.parse(json) as { preset: Preset; sim?: SimParams; render?: RenderParams } | Preset;
        if ('maps' in parsed && !('preset' in parsed)) {
          setPreset(clampPreset(parsed as Preset));
        } else {
          const obj = parsed as any;
          if (obj.preset) setPreset(clampPreset(obj.preset));
          if (obj.sim) setSim(clampSim(obj.sim));
          if (obj.render) setRender(clampRender(obj.render));
        }
        console.log('Imported preset');
      } catch (error) {
        console.error('Failed to import preset:', error);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleViewChange = useCallback((view: { scale: number; offset: { x: number; y: number } }) => {
    setPreset((prev) => clampPreset({ ...prev, view }));
  }, []);

  const handleFitView = useCallback(() => {
    setFitRequest((f) => ({ version: f.version + 1, warmup: 0 }));
  }, []);

  const theme = useMemo(() => buildTheme(render.palette, !!render.invert), [render.palette, render.invert]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#000',
      }}
    >
      <Canvas
        preset={preset}
        sim={sim}
        render={render}
        theme={theme}
        onReset={resetTrigger}
        resetComplete={handleResetComplete}
        onViewChange={handleViewChange}
        fitRequest={fitRequest}
      />
      <OverlayRoot
        preset={preset}
        sim={sim}
        render={render}
        onPresetChange={handlePresetChange}
        onSimChange={handleSimChange}
        onRenderChange={handleRenderChange}
        onRandomize={handleRandomize}
        onMutate={handleMutate}
        onReset={handleReset}
        onFitView={handleFitView}
        onExport={handleExport}
        onImport={handleImport}
        theme={theme}
      />
    </div>
  );
}

export default App;
