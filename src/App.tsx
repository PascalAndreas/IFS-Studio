/**
 * Main App component
 */

import { useState, useCallback } from 'react';
import { Preset, createDefaultPreset, clampPreset } from './engine/types';
import { ControlPanel } from './ui/ControlPanel';
import { Canvas } from './ui/Canvas';
import { mutatePreset, randomizePreset } from './ui/presetUtils';

function App() {
  const [preset, setPreset] = useState<Preset>(createDefaultPreset());
  const [isPaused, setIsPaused] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(false);
  const [fitRequest, setFitRequest] = useState<{ version: number; warmup: number }>({ version: 0, warmup: 0 });

  const handlePresetChange = useCallback((newPreset: Preset) => {
    setPreset(clampPreset(newPreset));
  }, []);

  const handleRandomize = useCallback(() => {
    const randomized = randomizePreset();
    randomized.sim.burnIn = preset.sim.burnIn;
    randomized.sim.numPoints = preset.sim.numPoints;
    randomized.sim.seed = preset.sim.seed;
    randomized.render = preset.render;
    setPreset(clampPreset(randomized));
    setFitRequest((f) => ({ version: f.version + 1, warmup: 5 }));
  }, [preset.render, preset.sim.burnIn, preset.sim.numPoints, preset.sim.seed]);

  const handleMutate = useCallback(() => {
    setPreset((prev) => clampPreset(mutatePreset(prev)));
  }, []);

  const handleReset = useCallback(() => {
    setResetTrigger(true);
  }, []);

  const handleResetComplete = useCallback(() => {
    setResetTrigger(false);
  }, []);

  const handlePause = useCallback(() => {
    setIsPaused(true);
  }, []);

  const handlePlay = useCallback(() => {
    setIsPaused(false);
  }, []);

  const handleExport = useCallback(() => {
    const json = JSON.stringify(preset, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${preset.name || 'preset'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [preset]);

  const handleImport = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const imported = JSON.parse(json) as Preset;
        setPreset(clampPreset(imported));
        console.log('Imported preset:', imported.name);
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

  return (
    <div style={{ 
      display: 'flex', 
      width: '100vw', 
      height: '100vh', 
      overflow: 'hidden',
      backgroundColor: '#000',
    }}>
      <ControlPanel
        preset={preset}
        onPresetChange={handlePresetChange}
        onRandomize={handleRandomize}
        onReset={handleReset}
        onPause={handlePause}
        onPlay={handlePlay}
        isPaused={isPaused}
        onExport={handleExport}
        onImport={handleImport}
        onMutate={handleMutate}
        onFitView={handleFitView}
      />
      <div style={{ flex: 1, position: 'relative' }}>
        <Canvas
          preset={preset}
          isPaused={isPaused}
          onReset={resetTrigger}
          resetComplete={handleResetComplete}
          onViewChange={handleViewChange}
          fitRequest={fitRequest}
        />
      </div>
    </div>
  );
}

export default App;
