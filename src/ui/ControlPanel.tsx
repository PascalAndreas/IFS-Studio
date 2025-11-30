/**
 * Control panel component - left sidebar with all controls
 */

import { Preset } from '../engine/types';

interface ControlPanelProps {
  preset: Preset;
  onPresetChange: (preset: Preset) => void;
  onRandomize: () => void;
  onReset: () => void;
  onPause: () => void;
  onPlay: () => void;
  isPaused: boolean;
  onExport: () => void;
  onImport: (file: File) => void;
}

export function ControlPanel({
  preset,
  onPresetChange,
  onRandomize,
  onReset,
  onPause,
  onPlay,
  isPaused,
  onExport,
  onImport,
}: ControlPanelProps) {
  const handleNumberChange = (path: string[], value: number) => {
    const newPreset = JSON.parse(JSON.stringify(preset));
    let obj: any = newPreset;
    for (let i = 0; i < path.length - 1; i++) {
      obj = obj[path[i]];
    }
    obj[path[path.length - 1]] = value;
    onPresetChange(newPreset);
  };

  return (
    <div style={{
      width: '320px',
      height: '100vh',
      overflow: 'auto',
      backgroundColor: '#1a1a1a',
      color: '#fff',
      padding: '20px',
      fontFamily: 'monospace',
      fontSize: '13px',
    }}>
      <h1 style={{ margin: '0 0 20px 0', fontSize: '18px' }}>IFS Studio</h1>

      {/* Simulation Controls */}
      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#aaa' }}>Simulation</h2>
        
        <div style={{ marginBottom: '8px' }}>
          <label>Seed</label>
          <input
            type="number"
            value={preset.sim.seed}
            onChange={(e) => handleNumberChange(['sim', 'seed'], parseInt(e.target.value))}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label>Num Points</label>
          <input
            type="number"
            value={preset.sim.numPoints}
            onChange={(e) => handleNumberChange(['sim', 'numPoints'], parseInt(e.target.value))}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label>Burn In</label>
          <input
            type="number"
            value={preset.sim.burnIn}
            onChange={(e) => handleNumberChange(['sim', 'burnIn'], parseInt(e.target.value))}
            style={inputStyle}
          />
        </div>
      </section>

      {/* Render Controls */}
      <section style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#aaa' }}>Render</h2>
        
        <div style={{ marginBottom: '8px' }}>
          <label>Decay</label>
          <input
            type="number"
            step="0.001"
            value={preset.render.decay}
            onChange={(e) => handleNumberChange(['render', 'decay'], parseFloat(e.target.value))}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label>Exposure</label>
          <input
            type="number"
            step="0.1"
            value={preset.render.exposure}
            onChange={(e) => handleNumberChange(['render', 'exposure'], parseFloat(e.target.value))}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label>Gamma</label>
          <input
            type="number"
            step="0.1"
            value={preset.render.gamma}
            onChange={(e) => handleNumberChange(['render', 'gamma'], parseFloat(e.target.value))}
            style={inputStyle}
          />
        </div>
      </section>

      {/* Action Buttons */}
      <section style={{ marginBottom: '24px' }}>
        <button onClick={isPaused ? onPlay : onPause} style={buttonStyle}>
          {isPaused ? '▶ Play' : '⏸ Pause'}
        </button>
        <button onClick={onReset} style={buttonStyle}>
          🔄 Reset
        </button>
        <button onClick={onRandomize} style={buttonStyle}>
          🎲 Randomize
        </button>
      </section>

      {/* Import/Export */}
      <section>
        <button onClick={onExport} style={buttonStyle}>
          📥 Export JSON
        </button>
        <label style={{ ...buttonStyle, display: 'inline-block', cursor: 'pointer' }}>
          📤 Import JSON
          <input
            type="file"
            accept=".json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImport(file);
            }}
            style={{ display: 'none' }}
          />
        </label>
      </section>

      {/* TODO: Map Editor List */}
      <section style={{ marginTop: '24px' }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#aaa' }}>
          Maps ({preset.maps.length})
        </h2>
        <div style={{ color: '#666' }}>
          [Map editor TODO]
        </div>
      </section>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px',
  backgroundColor: '#2a2a2a',
  border: '1px solid #444',
  color: '#fff',
  borderRadius: '4px',
  fontFamily: 'monospace',
  fontSize: '13px',
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px',
  marginBottom: '8px',
  backgroundColor: '#2a2a2a',
  border: '1px solid #444',
  color: '#fff',
  borderRadius: '4px',
  cursor: 'pointer',
  fontFamily: 'monospace',
  fontSize: '13px',
  textAlign: 'left',
};

