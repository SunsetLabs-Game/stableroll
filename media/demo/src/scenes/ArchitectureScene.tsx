import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../theme";

export const ArchitectureScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const firstOpacity = interpolate(frame, [0, 0.8 * fps, 10 * fps, 11 * fps], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const secondOpacity = interpolate(frame, [10 * fps, 11 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const firstScale = interpolate(frame, [0, 0.8 * fps], [0.96, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.spring({ damping: 200 }),
    output: "perceptual-scale",
  });
  const secondScale = interpolate(frame, [10 * fps, 11 * fps], [0.96, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.spring({ damping: 200 }),
    output: "perceptual-scale",
  });

  const showingSecond = frame >= 10 * fps;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, padding: "80px 80px" }}>
      <div
        style={{
          color: COLORS.text,
          fontFamily: FONTS.sans,
          fontSize: 56,
          fontWeight: 700,
          marginBottom: 12,
        }}
      >
        What the contract actually enforces
      </div>
      <div
        style={{
          color: COLORS.muted,
          fontFamily: FONTS.sans,
          fontSize: 32,
          marginBottom: 28,
          maxWidth: 1600,
        }}
      >
        Generated from typed specs, not redrawn. EVM destinations are the five
        chains in docs/evm-claim-coverage.md. Solana is a live-quoted NEAR
        Intents connector; the end-to-end claim is not exercised.
      </div>
      <div
        style={{
          flex: 1,
          backgroundColor: COLORS.panel,
          borderRadius: 16,
          padding: 24,
          opacity: showingSecond ? secondOpacity : firstOpacity,
          scale: showingSecond ? secondScale : firstScale,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            color: COLORS.accent,
            fontFamily: FONTS.sans,
            fontSize: 28,
            marginBottom: 12,
          }}
        >
          {showingSecond ? "Claim routing" : "Run state machine"}
        </div>
        <Img
          src={staticFile(showingSecond ? "claim-routing.svg" : "state-machine.svg")}
          style={{
            width: "100%",
            height: 640,
            objectFit: "contain",
            backgroundColor: "white",
            borderRadius: 8,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
