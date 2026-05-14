/**
 * Seletor de estrelas (1–5) e exibição de média.
 */

interface StarPickerProps {
  value: number
  onChange: (value: number) => void
}

export function StarPicker({ value, onChange }: StarPickerProps) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="text-2xl leading-none transition-transform hover:scale-110 focus:outline-none"
          aria-label={`${star} estrela${star > 1 ? "s" : ""}`}
        >
          <span className={star <= value ? "text-amber-400" : "text-slate-300"}>★</span>
        </button>
      ))}
    </div>
  )
}

interface StarDisplayProps {
  avg: number | null
  count: number
  size?: "sm" | "md"
}

export function StarDisplay({ avg, count, size = "md" }: StarDisplayProps) {
  if (avg === null) {
    return <span className="text-xs text-slate-400">Sem avaliações ainda</span>
  }

  const filled = Math.round(avg)
  const textSize = size === "sm" ? "text-sm" : "text-base"

  return (
    <div className={`flex items-center gap-1.5 ${textSize}`}>
      <span className="flex">
        {[1, 2, 3, 4, 5].map((star) => (
          <span key={star} className={star <= filled ? "text-amber-400" : "text-slate-300"}>
            ★
          </span>
        ))}
      </span>
      <span className="font-semibold text-[#12202d]">{avg.toFixed(1)}</span>
      <span className="text-slate-400">({count})</span>
    </div>
  )
}
