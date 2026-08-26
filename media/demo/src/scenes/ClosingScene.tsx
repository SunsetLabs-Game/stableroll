import { Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Stage } from "../components/Stage";
import { sans } from "../fonts";

export const ClosingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Stage>
      <Interactive.Div
        name="Title"
        style={{
          position: "absolute",
          top: 320,
          left: 80,
          color: "#F8FAFC",
          fontFamily: sans,
          fontSize: 96,
          fontWeight: 700,
          letterSpacing: -2,
          opacity: interpolate(frame, [0, 0.8 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        StableRoll
      </Interactive.Div>
      <Interactive.Div
        name="Repo"
        style={{
          position: "absolute",
          top: 450,
          left: 80,
          color: "#7DD3FC",
          fontFamily: sans,
          fontSize: 36,
          opacity: interpolate(frame, [0.5 * fps, 1.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        github.com/SunsetLabs-Game/stableroll
      </Interactive.Div>
      <Interactive.Div
        name="License"
        style={{
          position: "absolute",
          top: 520,
          left: 80,
          color: "#94A3B8",
          fontFamily: sans,
          fontSize: 28,
          lineHeight: 1.5,
          opacity: interpolate(frame, [0.9 * fps, 1.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Apache-2.0
        <br />
        Read the README for what is and is not private.
      </Interactive.Div>
    </Stage>
  );
};
