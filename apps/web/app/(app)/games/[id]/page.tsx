import { auth } from "@clerk/nextjs/server";

export default async function GamePage({ params }: PageProps<"/games/[id]">) {
  await auth.protect()

  const { id } = await params

  return <p>{id}</p>
}
