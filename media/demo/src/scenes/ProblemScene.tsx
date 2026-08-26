import { Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Stage } from "../components/Stage";
import { sans } from "../fonts";

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Stage>
      <Interactive.Div
        name="Kicker"
        style={{
          position: "absolute",
          top: 100,
          left: 80,
          color: "#7DD3FC",
          fontFamily: sans,
          fontSize: 22,
          letterSpacing: 6,
          fontWeight: 600,
          opacity: interpolate(frame, [0, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        THE PROBLEM
      </Interactive.Div>
      <Interactive.Div
        name="Headline"
        style={{
          position: "absolute",
          top: 150,
          left: 80,
          right: 80,
          color: "#F8FAFC",
          fontFamily: sans,
          fontSize: 68,
          fontWeight: 700,
          lineHeight: 1.08,
          letterSpacing: -1.5,
          opacity: interpolate(frame, [0.2 * fps, 1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        A public payroll run publishes headcount and compensation to anyone watching the chain.
      </Interactive.Div>
      <Interactive.Div
        name="Public card"
        style={{
          position: "absolute",
          top: 520,
          left: 80,
          width: 820,
          height: 420,
          backgroundColor: "#1C1010",
          border: "1px solid #7F1D1D",
          borderRadius: 20,
          padding: 40,
          opacity: interpolate(frame, [1.4 * fps, 2.2 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [1.4 * fps, 2.2 * fps], ["-40px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
          }),
        }}
      >
        <div style={{ color: "#FCA5A5", fontFamily: sans, fontSize: 20, letterSpacing: 3, fontWeight: 600 }}>
          PUBLIC LEDGER
        </div>
        <div style={{ color: "#FECACA", fontFamily: sans, fontSize: 34, fontWeight: 600, marginTop: 16, lineHeight: 1.3 }}>
          Payer address, recipient addresses, amounts, and org shape are all recoverable from the same run.
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="Private card"
        style={{
          position: "absolute",
          top: 520,
          right: 80,
          width: 820,
          height: 420,
          backgroundColor: "#0B1A14",
          border: "1px solid #065F46",
          borderRadius: 20,
          padding: 40,
          opacity: interpolate(frame, [2.2 * fps, 3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [2.2 * fps, 3 * fps], ["40px 0px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
          }),
        }}
      >
        <div style={{ color: "#6EE7B7", fontFamily: sans, fontSize: 20, letterSpacing: 3, fontWeight: 600 }}>
          THROUGH THE POOL
        </div>
        <div style={{ color: "#D1FAE5", fontFamily: sans, fontSize: 34, fontWeight: 600, marginTop: 16, lineHeight: 1.3 }}>
          Run totals stay public so completeness can be checked. Who paid whom does not.
        </div>
      </Interactive.Div>
    </Stage>
  );
};
