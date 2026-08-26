import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { SNFORGE_COMPLETENESS_LOG } from "../data/snforgeCompletenessLog";
import { COLORS, FONTS } from "../theme";

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
    Math.max(1, Math.floor(interpolate(frame, [0.5 * fps, 20 * fps], [1, lines.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }))),
  );
  const titleOpacity = interpolate(frame, [0, 0.6 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, padding: "80px 80px" }}>
      <div style={{ opacity: titleOpacity }}>
        <div
          style={{
            color: COLORS.text,
            fontFamily: FONTS.sans,
            fontSize: 56,
            fontWeight: 700,
          }}
        >
          Completeness is a failing test, not a README claim
        </div>
        <div
          style={{
            color: COLORS.muted,
            fontFamily: FONTS.sans,
            fontSize: 32,
            marginTop: 16,
            marginBottom: 28,
            maxWidth: 1600,
          }}
        >
          Real `snforge test` run inside contracts/payroll (17 passed). Omitting
          a recipient can never set is_complete. Shorting the last
          FundCommitment reverts UNDER_COMMITTED.
        </div>
      </div>
      <div
        style={{
          backgroundColor: "#0A0D16",
          borderRadius: 16,
          padding: "28px 32px",
          fontFamily: FONTS.mono,
          fontSize: 22,
          lineHeight: 1.45,
          overflow: "hidden",
          flex: 1,
        }}
      >
        {lines.slice(0, revealed).map((line) => {
          const highlight = HIGHLIGHTS.some((name) => line.includes(name));
          const isPass = line.startsWith("[PASS]");
          const isSummary = line.startsWith("Tests:");
          return (
            <div
              key={line}
              style={{
                color: highlight || isSummary ? COLORS.pass : isPass ? COLORS.text : COLORS.muted,
                fontWeight: highlight || isSummary ? 700 : 400,
              }}
            >
              {line}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
