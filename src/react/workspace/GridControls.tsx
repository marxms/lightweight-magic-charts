/**
 * Grid mode, and the one action that only exists inside it.
 *
 * THE CEILING IS THE HOST'S NUMBER, not ours: how many cells fit is calibration, and a default
 * written here would be this package having an opinion about somebody else's screen. What IS ours
 * is that the control disappears at the ceiling instead of staying and doing nothing.
 */
import { memo } from 'react';
import type { ReactElement } from 'react';

import { useWorkspaceChrome } from '../chrome/ChromeContext';
import { useWorkspaceSetup } from './setupContext';

export interface GridControlsActions {
  readonly maxCells: number;
  readonly onToggleMode: () => void;
  readonly onAddCell: () => void;
}

export interface GridControlsProps {
  readonly grid: GridControlsActions;
}

export const GridControls = memo(function GridControls({ grid }: GridControlsProps): ReactElement {
  const { theme, components, labels } = useWorkspaceChrome();
  const text = labels.grid;
  const { Pill, IconButton } = components;
  const gridMode = useWorkspaceSetup((setup) => setup.layoutMode === 'grade');
  const cells = useWorkspaceSetup((setup) => setup.gridCells.length);

  return (
    <>
      <Pill
        theme={theme}
        state={{ kind: 'toggle', pressed: gridMode }}
        onSelect={grid.onToggleMode}
      >
        {text.mode}
      </Pill>
      {gridMode && cells < grid.maxCells ? (
        <IconButton theme={theme} label={text.addCell} onSelect={grid.onAddCell}>
          +
        </IconButton>
      ) : null}
    </>
  );
});
