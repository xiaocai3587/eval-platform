/** Passed 徽章：通过 绿 / 不通过 红 / null = 人工参与（蓝，未判定） */
export default function PassedBadge({ passed }: { passed: boolean | null }) {
  if (passed === null) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
        人工参与
      </span>
    )
  }
  return passed ? (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      通过
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      不通过
    </span>
  )
}
