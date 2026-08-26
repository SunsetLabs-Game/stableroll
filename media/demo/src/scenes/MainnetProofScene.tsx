import { Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Stage } from "../components/Stage";
import { mono, sans } from "../fonts";

export type MainnetProofProps = {
  transactions: string[];
};

export const MainnetProofScene: React.FC<MainnetProofProps> = ({ transactions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Stage>
      <Interactive.Div
        name="Headline"
        style={{
          position: "absolute",
          top: 120,
          left: 80,
          color: "#F8FAFC",
          fontFamily: sans,
          fontSize: 56,
          fontWeight: 700,
          opacity: interpolate(frame, [0, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Mainnet eligibility transactions
      </Interactive.Div>
      <Interactive.Div
        name="Hashes"
        style={{
          position: "absolute",
          top: 240,
          left: 80,
          right: 80,
          color: "#7DD3FC",
          fontFamily: mono,
          fontSize: 28,
          lineHeight: 1.8,
          opacity: interpolate(frame, [0.4 * fps, 1.1 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {transactions.map((hash) => (
          <div key={hash}>{`https://voyager.online/tx/${hash}`}</div>
        ))}
      </Interactive.Div>
    </Stage>
  );
};
