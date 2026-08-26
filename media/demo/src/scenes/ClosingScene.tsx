import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../theme";

export const ClosingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, 0.8 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        padding: "100px 80px",
        opacity,
        justifyContent: "center",
      }}
    >
      <div
        style={{
          color: COLORS.accent,
          fontFamily: FONTS.sans,
          fontSize: 28,
          letterSpacing: 2,
          textTransform: "uppercase",
          marginBottom: 20,
        }}
      >
        StableRoll
      </div>
      <div
        style={{
          color: COLORS.text,
          fontFamily: FONTS.sans,
          fontSize: 72,
          fontWeight: 700,
          lineHeight: 1.15,
          maxWidth: 1500,
        }}
      >
        Cross-chain private payroll on Starknet.
      </div>
      <div
        style={{
          color: COLORS.muted,
          fontFamily: FONTS.sans,
          fontSize: 36,
          marginTop: 32,
          lineHeight: 1.4,
        }}
      >
        github.com/SunsetLabs-Game/stableroll
        <br />
        Apache-2.0
        <br />
        Read the README for what is and is not private.
      </div>
    </AbsoluteFill>
  );
};
