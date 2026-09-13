import { notFound } from 'next/navigation'
import { PublicBoardView } from '@/components/public-board-view'
import { isPublicBoardId } from '@/lib/public-showcase-boards'

export default async function PublicBoardViewPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = await params
  // URL still uses the master id; the client mints an ephemeral clone
  if (!isPublicBoardId(conversationId)) notFound()

  return <PublicBoardView masterBoardId={conversationId} />
}
