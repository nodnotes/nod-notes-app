// Holds chrome height while the create-template page gates on auth.

export default function CreatePublicTemplateLoading() {
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-[var(--nod-chat-prompt)]"
      aria-busy="true"
      aria-label="Loading template"
    >
      <div className="flex h-[52px] shrink-0 items-center border-b border-black/10 px-3 dark:border-white/10">
        <div className="h-7 w-12 animate-pulse rounded-md bg-gray-200/80 dark:bg-white/10" />
        <div className="mx-auto h-4 w-44 animate-pulse rounded bg-gray-200/80 dark:bg-white/10" />
        <div className="h-7 w-16 animate-pulse rounded-md bg-gray-200/80 dark:bg-white/10" />
      </div>
      <div className="min-h-0 flex-1 bg-muted/30" />
    </div>
  )
}
