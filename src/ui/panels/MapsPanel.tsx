import React, { useEffect, useRef, useState } from 'react';
import { Preset, MAX_MAPS, IFSMap, clampPreset, createDefaultPreset } from '../../engine/types';
import { Theme } from '../theme';
import { MAX_FRO_NORM } from '../../engine/constants';
import { MapCard } from '../components/MapCard';
import { ToggleSwitch } from '../components/ToggleSwitch';

interface MapsPanelProps {
  preset: Preset;
  onPresetChange: (preset: Preset) => void;
  theme: Theme;
}

type LibraryEntry = { id: string; name: string; preset: Preset };
type Gains = { g1: number; g2: number; b: number };

const LIB_KEY = 'ifs-maps-library';

const defaultLibrary: LibraryEntry[] = [
  { id: 'default-fern', name: 'Fern', preset: createDefaultPreset() },
];

function loadLibrary(): LibraryEntry[] {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    const parsed: LibraryEntry[] = raw ? JSON.parse(raw) : [];
    const existingIds = new Set(parsed.map((p) => p.id));
    const merged = [...parsed];
    for (const entry of defaultLibrary) {
      if (![...existingIds].some((id) => id === entry.id)) merged.push(entry);
    }
    return merged;
  } catch {
    return defaultLibrary;
  }
}

function saveLibrary(entries: LibraryEntry[]) {
  localStorage.setItem(LIB_KEY, JSON.stringify(entries));
}

export function MapsPanel({ preset, onPresetChange, theme }: MapsPanelProps) {
  const [showRaw, setShowRaw] = useState(false);
  const [library, setLibrary] = useState<LibraryEntry[]>(() => loadLibrary());
  const [presetName, setPresetName] = useState(preset.name || 'Preset');
  const [currentMap, setCurrentMap] = useState(0);
  const [gains, setGains] = useState<Gains[]>([]);
  const [rawProbs, setRawProbs] = useState<number[]>(() => preset.maps.map((m) => m.probability));
  const internalPresetChange = useRef(false);
  useEffect(() => {
    setCurrentMap((idx) => Math.min(Math.max(0, idx), Math.max(0, preset.maps.length - 1)));
  }, [preset.maps.length]);

  useEffect(() => {
    setGains((prev) => {
      const next = preset.maps.map((_, idx) => prev[idx] ?? { g1: 1, g2: 1, b: 1 });
      return next;
    });
  }, [preset.maps]);

  useEffect(() => {
    setRawProbs((prev) => {
      if (internalPresetChange.current) return prev;
      return preset.maps.map((m) => m.probability);
    });
    if (internalPresetChange.current) internalPresetChange.current = false;
  }, [preset.maps]);

  const applyPreset = (mutator: (p: Preset) => Preset, nextProbs?: number[]) => {
    const targetProbs = nextProbs ?? rawProbs;
    const next = mutator(JSON.parse(JSON.stringify(preset)));
    for (let i = 0; i < next.maps.length; i++) {
      next.maps[i].probability = targetProbs[i] ?? next.maps[i]?.probability ?? 0;
    }
    internalPresetChange.current = true;
    onPresetChange(clampPreset(next));
  };

  const defaultMap = (): IFSMap => ({
    probability: 1,
    affine: { a11: 0.5, a12: 0, a21: 0, a22: 0.5, b1: 0, b2: 0 },
    warp: { enabled: false, a1: 0, a2: 0, a3: 0, a4: 0, k1: 1, k2: 1, k3: 1, k4: 1 },
  });

  const updateProbability = (idx: number, value: number) => {
    const val = Number.isFinite(value) ? value : 0;
    const nextProbs = rawProbs.slice();
    nextProbs[idx] = val;
    setRawProbs(nextProbs);
    applyPreset((p) => p, nextProbs);
  };

  const normalizeProbabilities = () => {
    const sum = rawProbs.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
    const normalized =
      sum > 0
        ? rawProbs.map((v) => (Number.isFinite(v) ? v / sum : 0))
        : rawProbs.map(() => (rawProbs.length > 0 ? 1 / rawProbs.length : 0));
    setRawProbs(normalized);
  };

  const handleValueChange = (path: (string | number)[], value: any, probsOverride?: number[]) => {
    applyPreset((p) => {
      let obj: any = p;
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
      obj[path[path.length - 1]] = value;
      if (path[0] === 'maps' && typeof path[1] === 'number') {
        const idx = path[1] as number;
        const m = p.maps[idx];
        const fro = Math.sqrt(m.affine.a11 ** 2 + m.affine.a12 ** 2 + m.affine.a21 ** 2 + m.affine.a22 ** 2);
        if (fro > MAX_FRO_NORM) {
          const s = MAX_FRO_NORM / fro;
          m.affine.a11 *= s;
          m.affine.a12 *= s;
          m.affine.a21 *= s;
          m.affine.a22 *= s;
        }
      }
      return p;
    }, probsOverride);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: `${theme.spacing.xs + 2}px ${theme.spacing.sm}px`,
    background: theme.colors.iconBg,
    border: theme.border,
    color: theme.colors.text,
    borderRadius: theme.radius / 2,
    fontFamily: theme.font,
    fontSize: 13,
    marginTop: 4,
  };

  const smallButton: React.CSSProperties = {
    border: theme.border,
    background: theme.colors.iconBg,
    color: theme.colors.text,
    borderRadius: theme.radius / 2,
    padding: `${theme.spacing.xs + 2}px ${theme.spacing.sm}px`,
    fontFamily: theme.font,
    cursor: 'pointer',
  };

  const saveCurrentToLibrary = () => {
    const entry: LibraryEntry = { id: crypto.randomUUID(), name: presetName || 'Untitled', preset: clampPreset({ ...preset, name: presetName }) };
    const next = [...library, entry];
    setLibrary(next);
    saveLibrary(next);
  };

  const loadFromLibrary = (entry: LibraryEntry) => {
    onPresetChange(clampPreset({ ...entry.preset, name: entry.name }));
  };

  const deleteEntry = (id: string) => {
    const next = library.filter((e) => e.id !== id);
    setLibrary(next);
    saveLibrary(next);
  };

  const probSum = rawProbs.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start', position: 'relative' }}>
      <div style={{ minWidth: 200, display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
        <div style={{ color: theme.colors.text, fontSize: 13, fontWeight: 600 }}>Library</div>
        <button style={smallButton} onClick={saveCurrentToLibrary}>Save Current</button>
        {library.map((entry) => (
          <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
            <button style={{ ...smallButton, flex: 1 }} onClick={() => loadFromLibrary(entry)}>
              {entry.name}
            </button>
            <button style={smallButton} onClick={() => deleteEntry(entry.id)}>✕</button>
          </div>
        ))}
      </div>

      <div style={{ minWidth: 200, display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
        <div style={{ color: theme.colors.text, fontSize: 13, fontWeight: 600 }}>Name</div>
        <input
          type="text"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          onBlur={() => { internalPresetChange.current = true; onPresetChange(clampPreset({ ...preset, name: presetName })); }}
          style={inputStyle}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs, color: theme.colors.muted, fontSize: 12 }}>
          <span>Prob sum:</span>
          <span style={{ color: Math.abs(probSum - 1) < 1e-3 ? theme.colors.accent : theme.colors.text }}>
            {probSum.toFixed(2)}
          </span>
          <button style={{ ...smallButton, padding: `${theme.spacing.xs}px ${theme.spacing.sm}px`, marginLeft: 'auto' }} onClick={normalizeProbabilities} disabled={!Number.isFinite(probSum) || rawProbs.length === 0}>
            Normalize
          </button>
        </div>
          <ToggleSwitch checked={!showRaw} onChange={(v) => setShowRaw(!v)} label={showRaw ? 'Raw Mode' : 'Play Mode'} theme={theme} />
        <button
          onClick={() => {
            if (preset.maps.length < MAX_MAPS) {
              const nextProbs = [...rawProbs, 1];
              applyPreset((p) => { p.maps.push(defaultMap()); return p; }, nextProbs);
              setGains((g) => [...g, { g1: 1, g2: 1, b: 1 }]);
              setRawProbs(nextProbs);
            }
          }}
          style={smallButton}
          disabled={preset.maps.length >= MAX_MAPS}
        >
          ➕ Add
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: theme.spacing.md }}>
        <button
          style={{ ...smallButton, alignSelf: 'center' }}
          onClick={() => setCurrentMap((i) => Math.max(0, i - 1))}
          disabled={currentMap <= 0}
        >
          ◀
        </button>
        {preset.maps[currentMap] && (
          <MapCard
            key={currentMap}
            map={preset.maps[currentMap]}
            index={currentMap}
            theme={theme}
            showRaw={showRaw}
            onUpdate={handleValueChange}
            onDuplicate={() => {
              const copyProb = rawProbs[currentMap] ?? 1;
              const nextProbs = rawProbs.slice();
              nextProbs.splice(currentMap + 1, 0, copyProb);
              applyPreset((p) => { const copy = JSON.parse(JSON.stringify(p.maps[currentMap])) as IFSMap; p.maps.splice(currentMap + 1, 0, copy); return p; }, nextProbs);
              setRawProbs(nextProbs);
            }}
            onRemove={() => {
              const removeIdx = currentMap;
              const nextProbs = rawProbs.slice();
              nextProbs.splice(removeIdx, 1);
              applyPreset((p) => { p.maps.splice(removeIdx, 1); return p; }, nextProbs);
              setCurrentMap((i) => Math.max(0, Math.min(i, preset.maps.length - 2)));
              setRawProbs(nextProbs);
            }}
            maxMapsReached={preset.maps.length >= MAX_MAPS}
            smallButton={smallButton}
            inputStyle={inputStyle}
            totalMaps={preset.maps.length}
            gains={gains[currentMap] || { g1: 1, g2: 1, b: 1 }}
            onGainChange={(key, v) => {
              setGains((arr) => {
                const next = arr.slice();
                const existing = next[currentMap] || { g1: 1, g2: 1, b: 1 };
                next[currentMap] = { ...existing, [key]: v };
                return next;
              });
            }}
            probability={rawProbs[currentMap] ?? preset.maps[currentMap]?.probability ?? 0}
            onProbabilityChange={(v) => updateProbability(currentMap, v)}
          />
        )}
        <button
          style={{ ...smallButton, alignSelf: 'center' }}
          onClick={() => setCurrentMap((i) => Math.min(preset.maps.length - 1, i + 1))}
          disabled={currentMap >= preset.maps.length - 1}
        >
          ▶
        </button>
      </div>
    </div>
  );
}
