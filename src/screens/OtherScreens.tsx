import type React from "react";
import { Panel } from "../components/Panel";
import { EmptyState } from "../components/States";

export const Library: React.FC = () => (
  <div className="max-w-4xl mx-auto w-full">
    <Panel title="Styles & Charts Library">
      <EmptyState
        title="Default Styles Loaded"
        message="Six built-in backing styles are bundled (Blues Shuffle, Slow Blues, Rock, Funk, Ballad, Country)."
      />
    </Panel>
  </div>
);

export const Sessions: React.FC = () => (
  <div className="max-w-4xl mx-auto w-full">
    <Panel title="Session Takes">
      <EmptyState
        title="No Takes Recorded"
        message="Takes and audio recordings will appear here. Recorded tracks remain in ~/JosefinesJamstudio/takes."
      />
    </Panel>
  </div>
);

export const Rig: React.FC = () => (
  <div className="max-w-4xl mx-auto w-full">
    <Panel title="Rig Profiles">
      <EmptyState
        title="Hardware Profiles"
        message="Hughes & Kettner Black Spirit 200 (MIDI Channel 1) and HeadRush Pedalboard profiles loaded."
      />
    </Panel>
  </div>
);
