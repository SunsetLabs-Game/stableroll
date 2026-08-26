import { Easing, Img, Interactive, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Stage } from "../components/Stage";
import { sans } from "../fonts";

export const ArchitectureScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Stage>
      <Interactive.Div
        name="Kicker"
        style={{
          position: "absolute",
          top: 56,
          left: 80,
          color: "#7DD3FC",
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
        ARCHITECTURE
      </Interactive.Div>
      <Interactive.Div
        name="Headline"
        style={{
          position: "absolute",
          top: 92,
          left: 80,
          color: "#F8FAFC",
          fontFamily: sans,
          fontSize: 48,
          fontWeight: 700,
          opacity: interpolate(frame, [0.2 * fps, 0.8 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        The pool is the only caller. RunInfo stores no payer.
      </Interactive.Div>
      <Interactive.Div
        name="Diagram"
        style={{
          position: "absolute",
          top: 170,
          left: 80,
          right: 80,
          height: 780,
          backgroundColor: "#F8FAFC",
          borderRadius: 20,
          padding: 24,
          opacity: interpolate(frame, [0.6 * fps, 1.4 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [0.6 * fps, 1.8 * fps], [0.96, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 200 }),
            output: "perceptual-scale",
          }),
        }}
      >
        <Img
          src={staticFile("architecture.svg")}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </Interactive.Div>
    </Stage>
  );
};
