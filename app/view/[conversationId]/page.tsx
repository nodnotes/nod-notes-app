import { notFound } from 'next/navigation'
import { BoardFlow } from '@/components/board-flow'
import { EditorProvider } from '@/components/editor-context'
import { ReactFlowContextProvider } from '@/components/react-flow-context'
import { isPublicBoardId } from '@/lib/public-showcase-boards'

export default async function PublicBoardViewPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = await params
  if (!isPublicBoardId(conversationId)) notFound()

  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      <EditorProvider>
        <ReactFlowContextProvider conversationId={conversationId}>
          <BoardFlow conversationId={conversationId} hideMapChrome />
        </ReactFlowContextProvider>
      </EditorProvider>
    </div>
  )
}
