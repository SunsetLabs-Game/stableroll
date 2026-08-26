import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../theme";

export type MainnetProofProps = {
  transactions: string[];
};

const POOL = "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";

export const MainnetProofScene: React.FC<MainnetProofProps> = ({ transactions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, 0.8 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, padding: "100px 80px", opacity }}>
      <div
        style={{
          color: COLORS.text,
          fontFamily: FONTS.sans,
          fontSize: 56,
          fontWeight: 700,
        }}
      >
        Mainnet eligibility transactions
      </div>
      <div
        style={{
          color: COLORS.muted,
          fontFamily: FONTS.sans,
          fontSize: 32,
          marginTop: 16,
          marginBottom: 40,
        }}
      >
        Hashes from strk20.json, shown as Voyager URLs. Pool {POOL} on SN_MAIN.
      </div>
      {transactions.map((hash) => (
        <div
          key={hash}
          style={{
            color: COLORS.accent,
            fontFamily: FONTS.mono,
            fontSize: 28,
            marginBottom: 18,
          }}
        >
          {`https://voyager.online/tx/${hash}`}
        </div>
      ))}
    </AbsoluteFill>
  );
};
