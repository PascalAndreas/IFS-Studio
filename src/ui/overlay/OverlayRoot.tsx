import { Preset, RenderParams, SimParams } from '../../engine/types';
import { Theme } from '../theme';
import { CollapsibleIconPanel } from '../components/CollapsibleIconPanel';
import { ThemedIconButton } from '../components/IconButton';
import { SimPanel } from '../panels/SimPanel';
import { RenderPanel } from '../panels/RenderPanel';
import { MapsPanel } from '../panels/MapsPanel';
import { MenuPanel } from '../panels/MenuPanel';

interface OverlayRootProps {
  preset: Preset;
  sim: SimParams;
  render: RenderParams;
  onPresetChange: (preset: Preset) => void;
  onSimChange: (sim: SimParams) => void;
  onRenderChange: (render: RenderParams) => void;
  onRandomize: () => void;
  onMutate: () => void;
  onReset: () => void;
  onFitView: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  theme: Theme;
}

export function OverlayRoot(props: OverlayRootProps) {
  const {
    preset,
    sim,
    render,
    onPresetChange,
    onSimChange,
    onRenderChange,
    onRandomize,
    onMutate,
    onReset,
    onFitView,
    onExport,
    onImport,
    theme,
  } = props;

  const toolbarButtonProps = {
    theme,
    size: 42,
  } as const;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        padding: theme.spacing.lg,
      }}
    >
      <div style={{ position: 'absolute', top: theme.spacing.lg, left: theme.spacing.lg, display: 'flex', flexDirection: 'column', gap: theme.spacing.sm, pointerEvents: 'auto', alignItems: 'flex-start' }}>
        <CollapsibleIconPanel icon="🧪" label="Simulation" storageKey="panel-sim" theme={theme}>
          <SimPanel sim={sim} onSimChange={onSimChange} theme={theme} />
        </CollapsibleIconPanel>
        <CollapsibleIconPanel icon="🎛️" label="Render" storageKey="panel-render" theme={theme}>
          <RenderPanel render={render} onRenderChange={onRenderChange} theme={theme} />
        </CollapsibleIconPanel>
        <CollapsibleIconPanel icon="☰" label="Menu" storageKey="panel-menu" theme={theme}>
          <MenuPanel onExport={onExport} onImport={onImport} theme={theme} />
        </CollapsibleIconPanel>
      </div>

      <div style={{ position: 'absolute', bottom: theme.spacing.lg, left: theme.spacing.lg, display: 'flex', flexDirection: 'column', gap: theme.spacing.sm, pointerEvents: 'auto', alignItems: 'flex-start' }}>
        <CollapsibleIconPanel icon="🗺️" label="Maps" storageKey="panel-maps" theme={theme} direction="up">
          <MapsPanel preset={preset} onPresetChange={onPresetChange} theme={theme} />
        </CollapsibleIconPanel>
      </div>

      <div style={{ position: 'absolute', top: theme.spacing.lg, right: theme.spacing.lg, display: 'flex', gap: theme.spacing.sm, pointerEvents: 'auto' }}>
        <ThemedIconButton icon="🔄" label="Reset" onClick={onReset} {...toolbarButtonProps} title="Reset accum" />
        <ThemedIconButton icon="🎲" label="Randomize" onClick={onRandomize} {...toolbarButtonProps} title="Randomize" />
        <ThemedIconButton icon="✨" label="Mutate" onClick={onMutate} {...toolbarButtonProps} title="Mutate" />
        <ThemedIconButton icon="📐" label="Fit view" onClick={onFitView} {...toolbarButtonProps} title="Fit to view" />
      </div>

      <div style={{ position: 'absolute', bottom: theme.spacing.lg, right: theme.spacing.lg, pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center', gap: theme.spacing.xs, padding: `${theme.spacing.xs + 2}px ${theme.spacing.sm}px`, background: theme.colors.badgeBg, border: theme.border, borderRadius: theme.radius, color: theme.colors.text, fontFamily: theme.font, fontSize: 12 }}>
        <span style={{ opacity: 0.8 }}>IFS Studio</span>
      </div>
    </div>
  );
}
