/**
 * Main App component
 */

import { useState, useCallback } from 'react';
import { Preset, createDefaultPreset } from './engine/types';
import { ControlPanel } from './ui/ControlPanel';
import { Canvas } from './ui/Canvas';

function App() {
  const [preset, setPreset] = useState<Preset>(createDefaultPreset());
  const [isPaused, setIsPaused] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(false);

  const handlePresetChange = useCallback((newPreset: Preset) => {
    setPreset(newPreset);
  }, []);

  const handleRandomize = useCallback(() => {
    // TODO: Generate random preset
    console.log('Randomize not yet implemented');
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
        setPreset(imported);
        console.log('Imported preset:', imported.name);
      } catch (error) {
        console.error('Failed to import preset:', error);
      }
    };
    reader.readAsText(file);
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
      />
      <div style={{ flex: 1, position: 'relative' }}>
        <Canvas
          preset={preset}
          isPaused={isPaused}
          onReset={resetTrigger}
          resetComplete={handleResetComplete}
        />
      </div>
    </div>
  );
}

export default App;

