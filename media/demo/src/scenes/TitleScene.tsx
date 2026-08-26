import { Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Stage } from "../components/Stage";
import { sans } from "../fonts";

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Stage>
      <Interactive.Div
        name="Eyebrow"
        style={{
          position: "absolute",
          top: 280,
          left: 80,
          color: "#7DD3FC",
          fontFamily: sans,
          fontSize: 22,
          letterSpacing: 8,
          fontWeight: 600,
          opacity: interpolate(frame, [0, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        STRK20 PRIVATE SPRINT
      </Interactive.Div>
      <Interactive.Div
        name="Title"
        style={{
          position: "absolute",
          top: 340,
          left: 80,
          right: 80,
          color: "#F8FAFC",
          fontFamily: sans,
          fontSize: 120,
          fontWeight: 700,
          lineHeight: 0.95,
          letterSpacing: -3,
          opacity: interpolate(frame, [0.2 * fps, 1.1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [0.2 * fps, 1.1 * fps], ["0px 28px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
          }),
        }}
      >
        StableRoll
      </Interactive.Div>
      <Interactive.Div
        name="Subtitle"
        style={{
          position: "absolute",
          top: 500,
          left: 80,
          maxWidth: 1400,
          color: "#94A3B8",
          fontFamily: sans,
          fontSize: 36,
          lineHeight: 1.35,
          opacity: interpolate(frame, [1.2 * fps, 2.2 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Cross-chain private payroll. Fund once on Starknet. Recipients claim
        on Starknet, EVM, or Solana. No on-chain link between payer and recipient.
      </Interactive.Div>
    </Stage>
  );
};
