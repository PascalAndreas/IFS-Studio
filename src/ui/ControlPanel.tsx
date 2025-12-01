/**
 * Control panel component - left sidebar with all controls
 */

import { Preset, MAX_MAPS, clampPreset, IFSMap, SimParams, RenderParams, clampSim, clampRender } from '../engine/types';

interface ControlPanelProps {
  preset: Preset;
  sim: SimParams;
  render: RenderParams;
  onPresetChange: (preset: Preset) => void;
  onSimChange: (sim: SimParams) => void;
  onRenderChange: (render: RenderParams) => void;
  onRandomize: () => void;
  onMutate: () => void;
  onFitView: () => void;
  onReset: () => void;
  onPause: () => void;
  onPlay: () => void;
  isPaused: boolean;
  onExport: () => void;
  onImport: (file: File) => void;
}

export function ControlPanel({
  preset,
  sim,
  render,
  onPresetChange,
  onSimChange,
  onRenderChange,
  onRandomize,
  onReset,
  onMutate,
  onFitView,
  onPause,
  onPlay,
  isPaused,
  onExport,
  onImport,
}: ControlPanelProps) {
  const applyPreset = (mutator: (p: Preset) => Preset) => {
    const next = mutator(JSON.parse(JSON.stringify(preset)));
    onPresetChange(clampPreset(next));
  };

  const handleValueChange = (path: (string | number)[], value: any) => {
    applyPreset((p) => {
      let obj: any = p;
      for (let i = 0; i < path.length - 1; i++) {
        obj = obj[path[i] as any];
      }
      obj[path[path.length - 1] as any] = value;
      return p;
    });
  };

  const defaultMap = (): IFSMap => ({
    probability: 1,
    affine: { a11: 0.5, a12: 0, a21: 0, a22: 0.5, b1: 0, b2: 0 },
    warp: { enabled: false, a1: 0, a2: 0, a3: 0, a4: 0, k1: 1, k2: 1, k3: 1, k4: 1 },
  });

  const handleAddMap = () => {
    if (preset.maps.length >= MAX_MAPS) return;
    applyPreset((p) => {
      p.maps.push(defaultMap());
      return p;
    });
  };

  const handleRemoveMap = (idx: number) => {
    applyPreset((p) => {
      p.maps.splice(idx, 1);
      return p;
    });
  };

  const handleDuplicateMap = (idx: number) => {
    if (preset.maps.length >= MAX_MAPS) return;
    applyPreset((p) => {
      const copy = JSON.parse(JSON.stringify(p.maps[idx])) as IFSMap;
      p.maps.splice(idx + 1, 0, copy);
      return p;
    });
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
            value={sim.seed}
            onChange={(e) => onSimChange(clampSim({ ...sim, seed: parseInt(e.target.value) }))}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label>Num Points</label>
          <input
            type="number"
            value={sim.numPoints}
            onChange={(e) => onSimChange(clampSim({ ...sim, numPoints: parseInt(e.target.value) }))}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label>Burn In</label>
          <input
            type="number"
            value={sim.burnIn}
            onChange={(e) => onSimChange(clampSim({ ...sim, burnIn: parseInt(e.target.value) }))}
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
            value={render.decay}
            onChange={(e) => onRenderChange(clampRender({ ...render, decay: parseFloat(e.target.value) }))}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label>Exposure</label>
          <input
            type="number"
            step="0.1"
            value={render.exposure}
            onChange={(e) => onRenderChange(clampRender({ ...render, exposure: parseFloat(e.target.value) }))}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label>Gamma</label>
          <input
            type="number"
            step="0.1"
            value={render.gamma}
            onChange={(e) => onRenderChange(clampRender({ ...render, gamma: parseFloat(e.target.value) }))}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label>Palette</label>
          <select
            value={render.palette}
            onChange={(e) => onRenderChange(clampRender({ ...render, palette: e.target.value as RenderParams['palette'] }))}
            style={inputStyle}
          >
            <option value="grayscale">Grayscale</option>
            <option value="magma">Magma</option>
            <option value="viridis">Viridis</option>
            <option value="turbo">Turbo</option>
          </select>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label>
            <input
              type="checkbox"
              checked={!!render.invert}
              onChange={(e) => onRenderChange(clampRender({ ...render, invert: e.target.checked }))}
              style={{ marginRight: '6px' }}
            />
            Invert
          </label>
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
        <button onClick={onMutate} style={buttonStyle}>
          ✨ Mutate
        </button>
        <button onClick={onFitView} style={buttonStyle}>
          📐 Fit View
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

      {/* Map Editor */}
      <section style={{ marginTop: '24px' }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#aaa' }}>
          Maps ({preset.maps.length}) | Prob sum: {preset.maps.reduce((s, m) => s + m.probability, 0).toFixed(2)}
        </h2>
        <button
          onClick={() => handleAddMap()}
          disabled={preset.maps.length >= 8}
          style={{ ...buttonStyle, marginBottom: '12px' }}
        >
          ➕ Add Map
        </button>
        {preset.maps.map((map, idx) => (
          <details key={idx} open style={{ marginBottom: '12px', border: '1px solid #333', borderRadius: '6px', padding: '8px' }}>
            <summary style={{ cursor: 'pointer', outline: 'none' }}>
              Map {idx + 1}: p={map.probability.toFixed(3)} warp={map.warp.enabled ? 'on' : 'off'}
            </summary>
            <div style={{ marginTop: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button onClick={() => handleDuplicateMap(idx)} style={{ ...buttonStyle, marginBottom: 0, flex: 1 }}>
                  Duplicate
                </button>
                <button onClick={() => handleRemoveMap(idx)} style={{ ...buttonStyle, marginBottom: 0, flex: 1 }}>
                  Remove
                </button>
              </div>
              <label>Probability</label>
              <input
                type="number"
                step="0.01"
                value={map.probability}
                onChange={(e) => handleValueChange(['maps', idx, 'probability'], parseFloat(e.target.value))}
                style={inputStyle}
              />
              <div style={{ marginTop: '8px', marginBottom: '4px' }}>Affine A</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginBottom: '8px' }}>
                {(['a11', 'a12', 'a21', 'a22'] as const).map((key) => (
                  <input
                    key={key}
                    type="number"
                    step="0.01"
                    value={(map.affine as any)[key]}
                    onChange={(e) => handleValueChange(['maps', idx, 'affine', key], parseFloat(e.target.value))}
                    style={inputStyle}
                    placeholder={key}
                  />
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginBottom: '8px' }}>
                {(['b1', 'b2'] as const).map((key) => (
                  <input
                    key={key}
                    type="number"
                    step="0.01"
                    value={(map.affine as any)[key]}
                    onChange={(e) => handleValueChange(['maps', idx, 'affine', key], parseFloat(e.target.value))}
                    style={inputStyle}
                    placeholder={key}
                  />
                ))}
              </div>

              <label>
                <input
                  type="checkbox"
                  checked={map.warp.enabled}
                  onChange={(e) => handleValueChange(['maps', idx, 'warp', 'enabled'], e.target.checked)}
                  style={{ marginRight: '6px' }}
                />
                Warp enabled
              </label>
              {map.warp.enabled && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ marginBottom: '4px' }}>Warp A (a1..a4)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '8px' }}>
                    {(['a1', 'a2', 'a3', 'a4'] as const).map((key) => (
                      <input
                        key={key}
                        type="number"
                        step="0.01"
                        value={(map.warp as any)[key]}
                        onChange={(e) => handleValueChange(['maps', idx, 'warp', key], parseFloat(e.target.value))}
                        style={inputStyle}
                        placeholder={key}
                      />
                    ))}
                  </div>
                  <div style={{ marginBottom: '4px' }}>Warp K (k1..k4)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                    {(['k1', 'k2', 'k3', 'k4'] as const).map((key) => (
                      <input
                        key={key}
                        type="number"
                        step="0.1"
                        value={(map.warp as any)[key]}
                        onChange={(e) => handleValueChange(['maps', idx, 'warp', key], parseFloat(e.target.value))}
                        style={inputStyle}
                        placeholder={key}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        ))}
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
