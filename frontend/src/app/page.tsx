import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>StableRoll</h1>
      <ul>
        <li>
          <Link href="/admin">Admin</Link>
        </li>
        <li>
          <Link href="/claim/example-secret">Claim</Link>
        </li>
      </ul>
    </main>
  );
}
