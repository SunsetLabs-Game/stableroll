export default async function ClaimPage({
  params,
}: PageProps<"/claim/[secret]">) {
  const { secret } = await params;

  return (
    <main>
      <h1>Claim</h1>
      <p>secret: {secret}</p>
    </main>
  );
}
