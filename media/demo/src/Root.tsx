import "./index.css";
import { Composition, Folder, type CalculateMetadataFunction } from "remotion";
import manifest from "../../../strk20.json";
import {
  ARCHITECTURE_FRAMES,
  CLOSING_FRAMES,
  COMPLETENESS_FRAMES,
  Demo,
  FPS,
  HEIGHT,
  MAINNET_FRAMES,
  PROBLEM_FRAMES,
  ROUTING_FRAMES,
  STATE_FRAMES,
  TITLE_FRAMES,
  WIDTH,
  demoDurationInFrames,
  type DemoProps,
} from "./Demo";
import { ArchitectureScene } from "./scenes/ArchitectureScene";
import { ClaimRoutingScene } from "./scenes/ClaimRoutingScene";
import { ClosingScene } from "./scenes/ClosingScene";
import { CompletenessScene } from "./scenes/CompletenessScene";
import { MainnetProofScene } from "./scenes/MainnetProofScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { StateMachineScene } from "./scenes/StateMachineScene";
import { TitleScene } from "./scenes/TitleScene";

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
          id="TitleScene"
          component={TitleScene}
          durationInFrames={TITLE_FRAMES}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="ProblemScene"
          component={ProblemScene}
          durationInFrames={PROBLEM_FRAMES}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="ArchitectureScene"
          component={ArchitectureScene}
          durationInFrames={ARCHITECTURE_FRAMES}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="StateMachineScene"
          component={StateMachineScene}
          durationInFrames={STATE_FRAMES}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="ClaimRoutingScene"
          component={ClaimRoutingScene}
          durationInFrames={ROUTING_FRAMES}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="CompletenessScene"
          component={CompletenessScene}
          durationInFrames={COMPLETENESS_FRAMES}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
        <Composition
          id="MainnetProofScene"
          component={MainnetProofScene}
          durationInFrames={MAINNET_FRAMES}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
          defaultProps={{ transactions }}
        />
        <Composition
          id="ClosingScene"
          component={ClosingScene}
          durationInFrames={CLOSING_FRAMES}
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
