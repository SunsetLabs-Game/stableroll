import { Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { SNFORGE_COMPLETENESS_LOG } from "../data/snforgeCompletenessLog";
import { Stage } from "../components/Stage";
import { mono, sans } from "../fonts";

const HIGHLIGHTS = [
  "test_omitted_recipient_can_never_be_marked_complete",
  "test_run_incomplete_until_all_commitments_claimed",
  "test_underfunding_the_last_commitment_reverts",
];

export const CompletenessScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = SNFORGE_COMPLETENESS_LOG.trimEnd().split("\n");
  const revealed = Math.min(
    lines.length,
    Math.max(
      1,
      Math.floor(
        interpolate(frame, [0.8 * fps, 16 * fps], [1, lines.length], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      ),
    ),
  );

  return (
    <Stage>
      <Interactive.Div
        name="Kicker"
        style={{
          position: "absolute",
          top: 48,
          left: 80,
          color: "#6EE7B7",
          fontFamily: sans,
          fontSize: 20,
          letterSpacing: 6,
          fontWeight: 600,
          opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        PROVABLE COMPLETENESS
      </Interactive.Div>
      <Interactive.Div
        name="Headline"
        style={{
          position: "absolute",
          top: 84,
          left: 80,
          right: 80,
          color: "#F8FAFC",
          fontFamily: sans,
          fontSize: 40,
          fontWeight: 700,
          opacity: interpolate(frame, [0.15 * fps, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        A real snforge run. 17 passed. Completeness is a failing test when a recipient is omitted.
      </Interactive.Div>
      <Interactive.Div
        name="Terminal"
        style={{
          position: "absolute",
          top: 200,
          left: 80,
          right: 80,
          bottom: 60,
          backgroundColor: "#020617",
          border: "1px solid #1E293B",
          borderRadius: 16,
          padding: "28px 36px",
          fontFamily: mono,
          fontSize: 22,
          lineHeight: 1.42,
          overflow: "hidden",
          opacity: interpolate(frame, [0.5 * fps, 1.1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {lines.slice(0, revealed).map((line) => {
          const highlight = HIGHLIGHTS.some((name) => line.includes(name));
          const isSummary = line.startsWith("Tests:");
          return (
            <div
              key={line}
              style={{
                color: highlight || isSummary ? "#34D399" : "#CBD5E1",
                fontWeight: highlight || isSummary ? 700 : 400,
              }}
            >
              {line}
            </div>
          );
        })}
      </Interactive.Div>
    </Stage>
  );
};
