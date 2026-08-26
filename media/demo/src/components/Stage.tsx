import { AbsoluteFill } from "remotion";

export const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#070B14",
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.07) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          opacity: 0.5,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 20% 0%, rgba(2,132,199,0.18), transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(5,150,105,0.12), transparent 45%)",
        }}
      />
      {children}
    </AbsoluteFill>
  );
};
