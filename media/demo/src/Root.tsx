import "./index.css";
import { Composition, Folder, type CalculateMetadataFunction } from "remotion";
import manifest from "../../../strk20.json";
import { Demo, FPS, HEIGHT, WIDTH, demoDurationInFrames, type DemoProps } from "./Demo";
import { ArchitectureScene } from "./scenes/ArchitectureScene";
import { ClosingScene } from "./scenes/ClosingScene";
import { CompletenessScene } from "./scenes/CompletenessScene";
import { MainnetProofScene } from "./scenes/MainnetProofScene";
import { ProblemScene } from "./scenes/ProblemScene";

const transactions: string[] = Array.isArray(manifest.transactions)
  ? manifest.transactions
  : [];

const calculateMetadata: CalculateMetadataFunction<DemoProps> = () => {
  return {
    props: { transactions },
    durationInFrames: demoDurationInFrames(transactions),
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="Demo-Scenes">
        <Composition
          id="ProblemScene"
          component={ProblemScene}
          durationInFrames={12 * FPS}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="ArchitectureScene"
          component={ArchitectureScene}
          durationInFrames={22 * FPS}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="CompletenessScene"
          component={CompletenessScene}
          durationInFrames={28 * FPS}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="MainnetProofScene"
          component={MainnetProofScene}
          durationInFrames={16 * FPS}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
          defaultProps={{ transactions }}
        />
        <Composition
          id="ClosingScene"
          component={ClosingScene}
          durationInFrames={10 * FPS}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
      </Folder>
      <Composition
        id="Demo"
        component={Demo}
        durationInFrames={demoDurationInFrames(transactions)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ transactions }}
        calculateMetadata={calculateMetadata}
      />
    </>
  );
};
