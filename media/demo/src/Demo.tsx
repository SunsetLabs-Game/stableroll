import { AbsoluteFill, Series } from "remotion";
import { ArchitectureScene } from "./scenes/ArchitectureScene";
import { ClosingScene } from "./scenes/ClosingScene";
import { CompletenessScene } from "./scenes/CompletenessScene";
import { MainnetProofScene } from "./scenes/MainnetProofScene";
import { ProblemScene } from "./scenes/ProblemScene";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const PROBLEM_FRAMES = 12 * FPS;
export const ARCHITECTURE_FRAMES = 22 * FPS;
export const COMPLETENESS_FRAMES = 28 * FPS;
export const MAINNET_FRAMES = 16 * FPS;
export const CLOSING_FRAMES = 10 * FPS;

export type DemoProps = {
  transactions: string[];
};

export function demoDurationInFrames(transactions: string[]): number {
  return (
    PROBLEM_FRAMES +
    ARCHITECTURE_FRAMES +
    COMPLETENESS_FRAMES +
    (transactions.length > 0 ? MAINNET_FRAMES : 0) +
    CLOSING_FRAMES
  );
}

export const Demo: React.FC<DemoProps> = ({ transactions }) => {
  return (
    <AbsoluteFill>
      <Series>
        <Series.Sequence durationInFrames={PROBLEM_FRAMES} name="Problem">
          <ProblemScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={ARCHITECTURE_FRAMES} name="Architecture">
          <ArchitectureScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={COMPLETENESS_FRAMES} name="Completeness">
          <CompletenessScene />
        </Series.Sequence>
        {transactions.length > 0 ? (
          <Series.Sequence durationInFrames={MAINNET_FRAMES} name="MainnetProof">
            <MainnetProofScene transactions={transactions} />
          </Series.Sequence>
        ) : null}
        <Series.Sequence durationInFrames={CLOSING_FRAMES} name="Closing">
          <ClosingScene />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
