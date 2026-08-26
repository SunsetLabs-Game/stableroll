import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { ArchitectureScene } from "./scenes/ArchitectureScene";
import { ClaimRoutingScene } from "./scenes/ClaimRoutingScene";
import { ClosingScene } from "./scenes/ClosingScene";
import { CompletenessScene } from "./scenes/CompletenessScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { StateMachineScene } from "./scenes/StateMachineScene";
import { TitleScene } from "./scenes/TitleScene";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const TITLE_FRAMES = 5 * FPS;
export const PROBLEM_FRAMES = 14 * FPS;
export const ARCHITECTURE_FRAMES = 16 * FPS;
export const STATE_FRAMES = 16 * FPS;
export const ROUTING_FRAMES = 14 * FPS;
export const COMPLETENESS_FRAMES = 22 * FPS;
export const MAINNET_FRAMES = 12 * FPS;
export const CLOSING_FRAMES = 8 * FPS;
export const FADE_FRAMES = 12;

export type DemoProps = {
  transactions: string[];
};

export function demoDurationInFrames(transactions: string[]): number {
  const sequences = [
    TITLE_FRAMES,
    PROBLEM_FRAMES,
    ARCHITECTURE_FRAMES,
    STATE_FRAMES,
    ROUTING_FRAMES,
    COMPLETENESS_FRAMES,
    ...(transactions.length > 0 ? [MAINNET_FRAMES] : []),
    CLOSING_FRAMES,
  ];
  return sequences.reduce((sum, n) => sum + n, 0) - (sequences.length - 1) * FADE_FRAMES;
}

export const Demo: React.FC<DemoProps> = ({ transactions: _transactions }) => {
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={TITLE_FRAMES} name="Title">
          <TitleScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: FADE_FRAMES })}
        />
        <TransitionSeries.Sequence durationInFrames={PROBLEM_FRAMES} name="Problem">
          <ProblemScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: FADE_FRAMES })}
        />
        <TransitionSeries.Sequence durationInFrames={ARCHITECTURE_FRAMES} name="Architecture">
          <ArchitectureScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: FADE_FRAMES })}
        />
        <TransitionSeries.Sequence durationInFrames={STATE_FRAMES} name="StateMachine">
          <StateMachineScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: FADE_FRAMES })}
        />
        <TransitionSeries.Sequence durationInFrames={ROUTING_FRAMES} name="ClaimRouting">
          <ClaimRoutingScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: FADE_FRAMES })}
        />
        <TransitionSeries.Sequence durationInFrames={COMPLETENESS_FRAMES} name="Completeness">
          <CompletenessScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: FADE_FRAMES })}
        />
        <TransitionSeries.Sequence durationInFrames={CLOSING_FRAMES} name="Closing">
          <ClosingScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
