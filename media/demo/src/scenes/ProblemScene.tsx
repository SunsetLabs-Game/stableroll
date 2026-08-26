import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../theme";

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleOpacity = interpolate(frame, [0, 1 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const diagramOpacity = interpolate(frame, [1.5 * fps, 2.5 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const diagramScale = interpolate(frame, [1.5 * fps, 2.5 * fps], [0.96, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.spring({ damping: 200 }),
    output: "perceptual-scale",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, padding: "100px 80px" }}>
      <div style={{ opacity: titleOpacity }}>
        <div
          style={{
            color: COLORS.accent,
            fontFamily: FONTS.sans,
            fontSize: 28,
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          StableRoll
        </div>
        <div
          style={{
            color: COLORS.text,
            fontFamily: FONTS.sans,
            fontSize: 72,
            lineHeight: 1.1,
            fontWeight: 700,
            maxWidth: 1400,
          }}
        >
          Public payroll leaks headcount and compensation.
        </div>
        <div
          style={{
            color: COLORS.muted,
            fontFamily: FONTS.sans,
            fontSize: 36,
            marginTop: 28,
            maxWidth: 1400,
            lineHeight: 1.35,
          }}
        >
          A run funded in the open on a public ledger publishes org structure
          to anyone watching the chain. StableRoll funds once on Starknet
          through the STRK20 privacy pool. This is not fully private: run
          totals stay public so completeness can be checked.
        </div>
      </div>
      <div
        style={{
          opacity: diagramOpacity,
          scale: diagramScale,
          marginTop: 48,
          backgroundColor: COLORS.panel,
          borderRadius: 16,
          padding: 24,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Img
          src={staticFile("architecture.svg")}
          style={{ height: 420, width: "auto", backgroundColor: "white", borderRadius: 8 }}
        />
      </div>
    </AbsoluteFill>
  );
};
