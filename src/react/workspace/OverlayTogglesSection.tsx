/**
 * The two overlay switches, and the density knobs that only exist while their field is drawn.
 *
 * ZERO PROPS, BY CONTRACT: delivered as a section body, so both what it shows and where it writes
 * come from the setup.
 *
 * THE SLIDERS SIT BESIDE THE SWITCH AND ONLY WHILE THE FIELD IS ON. A slider for a layer that is
 * not drawn is a control with nothing on the other end of it.
 */
import { memo } from 'react';
import type { CSSProperties, ReactElement } from 'react';

import { useWorkspaceChrome } from '../chrome/ChromeContext';
import { DensityControls } from '../DensityControls';
import { useWorkspaceSetup, useWorkspaceSetupWriter } from './setupContext';

const ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
};

export const OverlayTogglesSection = memo(function OverlayTogglesSection(): ReactElement {
  const { theme, components, labels, testIdPrefix } = useWorkspaceChrome();
  const text = labels.overlays;
  const { Pill } = components;
  const showDensity = useWorkspaceSetup((setup) => setup.showDensity);
  const showProfile = useWorkspaceSetup((setup) => setup.showProfile);
  const density = useWorkspaceSetup((setup) => setup.density);
  const write = useWorkspaceSetupWriter();

  return (
    <div style={ROW}>
      <Pill
        theme={theme}
        state={{ kind: 'toggle', pressed: showDensity }}
        onSelect={() => write({ showDensity: !showDensity })}
      >
        {text.density}
      </Pill>
      {showDensity ? (
        <DensityControls
          tuning={density}
          onChange={(tuning) => write({ density: tuning })}
          labels={labels.density}
          theme={theme}
          testIdPrefix={`${testIdPrefix}-density`}
        />
      ) : null}
      <Pill
        theme={theme}
        state={{ kind: 'toggle', pressed: showProfile }}
        onSelect={() => write({ showProfile: !showProfile })}
      >
        {text.profile}
      </Pill>
    </div>
  );
});
