interface MeterProps {
  value: number
  label: string
  overloaded?: boolean
}

/** Simple ±10 V analog-style meter. */
export function Meter({ value, label, overloaded }: MeterProps) {
  const clamped = Math.max(-10, Math.min(10, value))
  const angle = (clamped / 10) * 60 // −60° … +60°

  return (
    <div className={`meter ${overloaded ? 'overloaded' : ''}`}>
      <svg viewBox="0 0 120 80" className="meter-face" aria-hidden>
        <path
          d="M 20 65 A 40 40 0 0 1 100 65"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.35"
        />
        {[-10, -5, 0, 5, 10].map((tick) => {
          const a = ((tick / 10) * 60 * Math.PI) / 180
          const x1 = 60 + Math.sin(a) * 34
          const y1 = 65 - Math.cos(a) * 34
          const x2 = 60 + Math.sin(a) * 40
          const y2 = 65 - Math.cos(a) * 40
          return (
            <line
              key={tick}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeWidth="1.5"
            />
          )
        })}
        <line
          x1="60"
          y1="65"
          x2={60 + Math.sin((angle * Math.PI) / 180) * 36}
          y2={65 - Math.cos((angle * Math.PI) / 180) * 36}
          stroke={overloaded ? '#c0392b' : '#1a1a1a'}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="60" cy="65" r="3" fill="#1a1a1a" />
      </svg>
      <div className="meter-readout">
        <span className="meter-label">{label}</span>
        <span className="meter-value">{value.toFixed(2)} V</span>
      </div>
    </div>
  )
}

interface ScopeProps {
  samples: number[]
  label: string
}

export function Scope({ samples, label }: ScopeProps) {
  const w = 240
  const h = 80
  if (samples.length < 2) {
    return (
      <div className="scope">
        <div className="scope-label">{label}</div>
        <svg viewBox={`0 0 ${w} ${h}`} className="scope-svg" />
      </div>
    )
  }
  const min = -10
  const max = 10
  const pts = samples
    .map((v, i) => {
      const x = (i / (samples.length - 1)) * (w - 4) + 2
      const y = h - ((v - min) / (max - min)) * (h - 4) - 2
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div className="scope">
      <div className="scope-label">{label}</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="scope-svg">
        <line
          x1="0"
          y1={h / 2}
          x2={w}
          y2={h / 2}
          stroke="currentColor"
          opacity="0.2"
        />
        <polyline
          fill="none"
          stroke="#2c5f4a"
          strokeWidth="1.5"
          points={pts}
        />
      </svg>
    </div>
  )
}
