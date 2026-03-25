'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const STEPS = [
  { id: 'material', title: 'What are you cutting?', sub: 'Tell us about the material.',
    fields: [
      { id: 'material', label: 'Material type', type: 'chips', required: true,
        options: ['Mild steel', 'Stainless steel', 'Aluminum', 'Copper', 'Titanium', 'Other'] },
      { id: 'thickness', label: 'Material thickness (mm)', type: 'number', required: true, placeholder: 'e.g. 6' },
      { id: 'size', label: 'Part size (approx.)', type: 'chips', optional: true,
        options: ['< 100mm', '100–500mm', '500mm–1m', '> 1m'] }
    ]
  },
  { id: 'cut', title: 'Describe the cut', sub: 'Geometry and finish requirements.',
    fields: [
      { id: 'geometry', label: 'Cut geometry', type: 'chips', required: true,
        options: ['Straight lines', 'Simple curves', 'Complex contours', 'Holes / piercing', 'Mixed'] },
      { id: 'finish', label: 'Surface finish needed', type: 'chips', required: true,
        options: ['Rough (structural)', 'Medium (functional)', 'Fine (visible / precise)'] },
      { id: 'haz', label: 'Heat sensitivity', type: 'chips', optional: true,
        options: ['Not sensitive', 'Somewhat sensitive', 'Very sensitive'] }
    ]
  },
  { id: 'precision', title: 'Precision requirements', sub: 'How tight does it need to be?',
    fields: [
      { id: 'tolerance', label: 'Dimensional tolerance', type: 'chips', required: true,
        options: ['±0.5mm (loose)', '±0.2mm (standard)', '±0.1mm (tight)', '< ±0.05mm (precision)'] },
      { id: 'squareness', label: 'Edge squareness', type: 'chips', optional: true,
        options: ['Not critical', 'Important', 'Critical'] }
    ]
  },
  { id: 'volume', title: 'Volume & production', sub: 'How many parts, how often?',
    fields: [
      { id: 'quantity', label: 'Quantity per run', type: 'chips', required: true,
        options: ['1–5 (prototype)', '6–50 (small batch)', '51–500 (medium)', '500+ (production)'] },
      { id: 'frequency', label: 'How often?', type: 'chips', optional: true,
        options: ['One-off', 'Occasionally', 'Monthly', 'Weekly / continuous'] }
    ]
  },
  { id: 'priority', title: 'What matters most?', sub: 'This drives the recommendation.',
    fields: [
      { id: 'priority', label: 'Top priority', type: 'chips', required: true,
        options: ['Lowest cost', 'Fastest turnaround', 'Best quality', 'No heat distortion'] },
      { id: 'budget', label: 'Rough budget per part', type: 'chips', optional: true,
        options: ['< $2', '$2–10', '$10–50', '$50+', 'Not sure yet'] }
    ]
  },
  { id: 'email', title: 'Where should we send your report?', sub: 'Emailed to you instantly.', special: 'email' }
]

// ── Technology definitions ────────────────────────────────────────────────────
const TECHS = {
  plasma_conv:  { label: 'Plasma (Conventional)', short: 'Plasma Conv.', color: '#EF9F27', group: 'plasma' },
  plasma_hidef: { label: 'Plasma (High Definition)', short: 'Plasma HiDef', color: '#BA7517', group: 'plasma' },
  laser_low:    { label: 'Laser (Low End)', short: 'Laser Low', color: '#85B7EB', group: 'laser' },
  laser_high:   { label: 'Laser (High End)', short: 'Laser High', color: '#185FA5', group: 'laser' },
  waterjet:     { label: 'Waterjet', short: 'Waterjet', color: '#1D9E75', group: 'waterjet' },
  oxyfuel:      { label: 'Oxyfuel', short: 'Oxyfuel', color: '#D85A30', group: 'oxyfuel' },
}

// ── Thickness caps from manufacturer data ─────────────────────────────────────
// Laser: 3kW→25mm, 6kW→25mm, 12kW→30mm, 20kW→40mm (low end ≈ 6kW cap, high end ≈ 20kW cap)
// Plasma conv (Powermax/MAXPRO): up to ~50mm
// Plasma HiDef (XPR/HPR): up to ~80mm
// Waterjet: up to ~300mm (practical)
// Oxyfuel: mild steel only, up to ~400mm
const THICKNESS_CAPS = {
  plasma_conv:  50,
  plasma_hidef: 80,
  laser_low:    25,
  laser_high:   40,
  waterjet:     300,
  oxyfuel:      400,
}

// ── Material restrictions ─────────────────────────────────────────────────────
// Oxyfuel: ONLY mild steel
// Specialty materials (not MS/SS/Al): waterjet preferred, others possible
const SPECIALTY_MATERIALS = ['Copper', 'Titanium', 'Other']
const OXYFUEL_MATERIALS = ['Mild steel'] // oxyfuel only works on mild steel

function isTechAvailable(techKey, answers) {
  const mat = answers.material || ''
  const t = parseFloat(answers.thickness) || 0

  // Oxyfuel: only mild steel
  if (techKey === 'oxyfuel') {
    if (!mat.includes('Mild steel')) return { available: false, reason: 'Oxyfuel only cuts mild steel' }
  }

  // Thickness cap check
  if (t > 0 && t > THICKNESS_CAPS[techKey]) {
    return { available: false, reason: `Max ${THICKNESS_CAPS[techKey]}mm for this process` }
  }

  return { available: true, reason: null }
}

function score(answers) {
  const t = parseFloat(answers.thickness) || 0
  const fin = answers.finish || ''
  const tol = answers.tolerance || ''
  const haz = answers.haz || ''
  const pri = answers.priority || ''
  const mat = answers.material || ''
  const isSpecialty = SPECIALTY_MATERIALS.some(m => mat.includes(m))
  const geo = answers.geometry || ''
  const qty = answers.quantity || ''

  // Base scores: quality, speed, cost, overall
  let scores = {
    plasma_conv:  { q: 45, s: 92, c: 95, sc: 65 },
    plasma_hidef: { q: 72, s: 88, c: 75, sc: 72 },
    laser_low:    { q: 82, s: 72, c: 68, sc: 74 },
    laser_high:   { q: 92, s: 85, c: 55, sc: 80 },
    waterjet:     { q: 88, s: 42, c: 52, sc: 62 },
    oxyfuel:      { q: 30, s: 28, c: 98, sc: 48 },
  }

  // ── Material adjustments ───────────────────────────────────────────────────
  if (isSpecialty) {
    scores.waterjet.sc += 25
    scores.waterjet.q  += 10
    scores.plasma_conv.sc  -= 15
    scores.plasma_hidef.sc -= 10
    scores.oxyfuel.sc = 0
  }
  if (mat.includes('Stainless')) {
    scores.laser_high.sc += 8
    scores.laser_low.sc  += 5
    scores.plasma_conv.q -= 10
  }
  if (mat.includes('Aluminum')) {
    scores.laser_high.sc += 10
    scores.laser_low.sc  += 8
    scores.plasma_conv.sc -= 5
  }

  // ── Thickness adjustments ─────────────────────────────────────────────────
  if (t > 20) {
    scores.plasma_hidef.sc += 12
    scores.plasma_conv.sc  += 8
    scores.laser_high.sc   -= 5
    scores.laser_low.sc    -= 15
    scores.oxyfuel.sc      += 15
  }
  if (t > 40) {
    scores.plasma_hidef.sc += 10
    scores.oxyfuel.sc      += 20
    scores.laser_high.sc   -= 10
    scores.laser_low.sc    -= 20
  }
  if (t > 80) {
    scores.oxyfuel.sc      += 15
    scores.waterjet.sc     += 10
  }
  if (t <= 6) {
    scores.laser_high.sc   += 15
    scores.laser_low.sc    += 12
    scores.plasma_conv.sc  -= 10
    scores.oxyfuel.sc      -= 20
  }

  // ── Finish / tolerance adjustments ────────────────────────────────────────
  if (fin.includes('Fine')) {
    scores.laser_high.q  += 8
    scores.laser_low.q   += 5
    scores.waterjet.q    += 6
    scores.plasma_conv.q -= 25
    scores.plasma_hidef.q -= 12
    scores.oxyfuel.q     -= 35
    scores.laser_high.sc += 10
    scores.waterjet.sc   += 8
    scores.plasma_conv.sc -= 20
  }
  if (tol.includes('0.1') || tol.includes('0.05')) {
    scores.laser_high.sc += 12
    scores.waterjet.sc   += 10
    scores.laser_low.sc  += 6
    scores.plasma_conv.sc -= 18
    scores.plasma_hidef.sc -= 8
    scores.oxyfuel.sc    -= 30
  }

  // ── Heat sensitivity ──────────────────────────────────────────────────────
  if (haz.includes('Very')) {
    scores.waterjet.sc    += 22
    scores.laser_high.sc  -= 12
    scores.laser_low.sc   -= 10
    scores.plasma_conv.sc -= 22
    scores.plasma_hidef.sc -= 15
    scores.oxyfuel.sc     -= 25
  }
  if (haz.includes('Somewhat')) {
    scores.waterjet.sc   += 8
    scores.plasma_conv.sc -= 8
    scores.oxyfuel.sc    -= 12
  }

  // ── Priority adjustments ──────────────────────────────────────────────────
  if (pri.includes('Lowest')) {
    scores.oxyfuel.sc      += 22
    scores.plasma_conv.sc  += 18
    scores.plasma_hidef.sc += 8
    scores.laser_high.sc   -= 8
    scores.laser_low.sc    += 5
  }
  if (pri.includes('quality')) {
    scores.laser_high.sc  += 15
    scores.waterjet.sc    += 10
    scores.laser_low.sc   += 8
    scores.plasma_conv.sc -= 15
    scores.oxyfuel.sc     -= 20
  }
  if (pri.includes('heat')) {
    scores.waterjet.sc    += 25
    scores.laser_high.sc  -= 15
    scores.laser_low.sc   -= 12
    scores.plasma_conv.sc -= 25
    scores.plasma_hidef.sc -= 18
    scores.oxyfuel.sc     -= 28
  }
  if (pri.includes('Fastest')) {
    scores.plasma_conv.sc  += 18
    scores.plasma_hidef.sc += 15
    scores.laser_high.sc   += 10
    scores.laser_low.sc    += 8
    scores.waterjet.sc     -= 15
    scores.oxyfuel.sc      -= 10
  }

  // ── Geometry ──────────────────────────────────────────────────────────────
  if (geo.includes('Complex') || geo.includes('Holes')) {
    scores.laser_high.sc  += 10
    scores.laser_low.sc   += 8
    scores.waterjet.sc    += 8
    scores.plasma_conv.sc -= 12
    scores.oxyfuel.sc     -= 25
  }

  // ── Volume ────────────────────────────────────────────────────────────────
  if (qty.includes('500+')) {
    scores.plasma_conv.sc  += 10
    scores.plasma_hidef.sc += 8
    scores.laser_high.sc   += 12
  }
  if (qty.includes('1–5')) {
    scores.waterjet.sc += 8
    scores.oxyfuel.sc  += 5
  }

  // ── Apply availability caps ───────────────────────────────────────────────
  Object.keys(scores).forEach(key => {
    const avail = isTechAvailable(key, answers)
    if (!avail.available) {
      scores[key].sc = 0
      scores[key].q  = 0
      scores[key].s  = 0
      scores[key].c  = 0
    }
  })

  const cl = v => Math.min(99, Math.max(0, Math.round(v)))
  const result = {}
  Object.keys(scores).forEach(k => {
    result[k] = { q: cl(scores[k].q), s: cl(scores[k].s), c: cl(scores[k].c), sc: cl(scores[k].sc) }
  })
  return result
}

function costRange(key, answers) {
  // Base $/part ranges from manufacturer data
  const base = {
    plasma_conv:  [0.8, 4],
    plasma_hidef: [1.5, 6],
    laser_low:    [2, 7],
    laser_high:   [3, 10],
    waterjet:     [4, 14],
    oxyfuel:      [0.4, 2.5],
  }
  const r = base[key]
  const t = parseFloat(answers.thickness) || 5
  const isSpecialty = SPECIALTY_MATERIALS.some(m => (answers.material||'').includes(m))
  let mult = t > 50 ? 3.5 : t > 30 ? 2.2 : t > 15 ? 1.5 : 1
  if (isSpecialty && key === 'waterjet') mult *= 1.6
  if (isSpecialty && key !== 'waterjet') mult *= 1.2
  return `$${(r[0] * mult).toFixed(1)}–$${(r[1] * mult).toFixed(1)}`
}

// ── Animated bar component ────────────────────────────────────────────────────
function AnimatedBar({ value, color, prevValue }) {
  const [width, setWidth] = useState(prevValue || 0)

  useEffect(() => {
    const timer = setTimeout(() => setWidth(value), 50)
    return () => clearTimeout(timer)
  }, [value])

  return (
    <div style={{ flex: 1, height: 4, background: '#e0e0e0', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        height: '100%', borderRadius: 2, background: color,
        width: `${width}%`,
        transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
      }} />
    </div>
  )
}

export default function Wizard({ units, onComplete }) {
  const [answers, setAnswers] = useState({})
  const [current, setCurrent] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const prevScores = useRef({})

  const step = STEPS[current]
  const filled = Object.keys(answers).filter(k => answers[k]).length
  const sc = score(answers)

  // Sort: available first by sc desc, then unavailable
  const sorted = Object.entries(sc).sort((a, b) => {
    if (a[1].sc === 0 && b[1].sc === 0) return 0
    if (a[1].sc === 0) return 1
    if (b[1].sc === 0) return -1
    return b[1].sc - a[1].sc
  })

  function pick(id, val) {
    prevScores.current = { ...sc }
    setAnswers(prev => ({ ...prev, [id]: val }))
  }

  async function handleSubmit() {
    if (!answers.email?.includes('@')) return
    try {
      await supabase.from('leads').insert([{
        email: answers.email,
        input_payload: answers,
        recommended_process: sorted[0][0]
      }])
    } catch (e) { console.log('Supabase not connected yet') }
    setSubmitted(true)
    setTimeout(() => onComplete(answers), 1200)
  }

  if (submitted) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 40 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 500 }}>Building your report...</div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 'calc(100vh - 52px)' }}>

      {/* ── LEFT: wizard ── */}
      <div style={{ borderRight: '1px solid #e8e8e8', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 3, padding: '10px 20px', borderBottom: '1px solid #e8e8e8' }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: i < current ? '#1D9E75' : i === current ? '#378ADD' : '#e0e0e0', transition: 'background 0.3s' }} />
          ))}
        </div>

        <div style={{ padding: '16px 20px 8px' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#999', letterSpacing: '0.5px', marginBottom: 3 }}>STEP {current + 1} OF {STEPS.length}</div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{step.title}</div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>{step.sub}</div>
        </div>

        <div style={{ padding: '4px 20px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>

          {step.special === 'email' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ padding: '10px 12px', borderRadius: 8, background: '#f5f5f5', borderLeft: '3px solid #378ADD' }}>
                <p style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>Your report includes a <strong>technology recommendation</strong>, full cost breakdown, quality scorecard, and time estimates.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 5 }}>First name <span style={{ fontSize: 10, color: '#aaa' }}>optional</span></div>
                  <input type="text" placeholder="Ana" value={answers.first_name || ''} onChange={e => pick('first_name', e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 5 }}>Company <span style={{ fontSize: 10, color: '#aaa' }}>optional</span></div>
                  <input type="text" placeholder="Acme Mfg." value={answers.company || ''} onChange={e => pick('company', e.target.value)} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 5 }}>Email address</div>
                <input type="email" placeholder="you@company.com" value={answers.email || ''} onChange={e => pick('email', e.target.value)} />
              </div>
              <div style={{ fontSize: 11, color: '#aaa', textAlign: 'center' }}>No spam. Only used to send this report.</div>
            </div>
          )}

          {!step.special && step.fields?.map(f => (
            <div key={f.id}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                {f.label}
                {f.optional && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#f0f0f0', color: '#aaa' }}>optional</span>}
              </div>
              {f.type === 'chips' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {f.options.map(o => (
                    <button key={o} onClick={() => pick(f.id, o)} style={{
                      padding: '5px 11px', borderRadius: 20, fontSize: 12, transition: 'all 0.15s',
                      border: answers[f.id] === o ? '1px solid #85B7EB' : '1px solid #e0e0e0',
                      background: answers[f.id] === o ? '#E6F1FB' : '#fff',
                      color: answers[f.id] === o ? '#0C447C' : '#1a1a1a'
                    }}>{o}</button>
                  ))}
                </div>
              )}
              {f.type === 'number' && (
                <input type="number" placeholder={f.placeholder} value={answers[f.id] || ''} onChange={e => pick(f.id, e.target.value)} />
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderTop: '1px solid #e8e8e8' }}>
          <button onClick={() => setCurrent(c => Math.max(0, c - 1))} style={{
            padding: '6px 12px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 12, color: '#666',
            visibility: current === 0 ? 'hidden' : 'visible'
          }}>← Back</button>
          {step.special === 'email'
            ? <button onClick={handleSubmit} disabled={!answers.email?.includes('@')} style={{
                padding: '7px 20px', borderRadius: 8, border: '1px solid #5DCAA5', background: '#E1F5EE',
                fontSize: 13, fontWeight: 500, color: '#085041',
                opacity: answers.email?.includes('@') ? 1 : 0.4
              }}>Get my report →</button>
            : <button onClick={() => setCurrent(c => Math.min(STEPS.length - 1, c + 1))} style={{
                padding: '7px 20px', borderRadius: 8, border: '1px solid #85B7EB', background: '#E6F1FB',
                fontSize: 13, fontWeight: 500, color: '#0C447C'
              }}>Continue →</button>
          }
        </div>
      </div>

      {/* ── RIGHT: live comparison ── */}
      <div style={{ background: '#f9f9f9', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#f9f9f9', zIndex: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Live comparison</div>
          <div style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 10,
            background: filled < 2 ? '#FAEEDA' : filled < 5 ? '#E6F1FB' : '#E1F5EE',
            color: filled < 2 ? '#633806' : filled < 5 ? '#0C447C' : '#085041'
          }}>
            {filled < 2 ? 'Waiting for input' : filled < 5 ? 'Partial estimate' : 'Good estimate'}
          </div>
        </div>

        {sorted.map(([key, s], i) => {
          const avail = isTechAvailable(key, answers)
          const isLeading = i === 0 && avail.available && filled > 1
          const prev = prevScores.current[key] || {}

          return (
            <div key={key} style={{
              padding: '11px 18px',
              borderBottom: '1px solid #e8e8e8',
              background: isLeading ? '#fff' : 'transparent',
              opacity: avail.available ? 1 : 0.35,
              transition: 'opacity 0.4s, background 0.3s'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: avail.available ? TECHS[key].color : '#ccc', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: avail.available ? '#1a1a1a' : '#aaa' }}>{TECHS[key].label}</span>
                  {isLeading && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#E6F1FB', color: '#0C447C' }}>Leading</span>}
                  {!avail.available && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#f0f0f0', color: '#aaa' }}>Not applicable</span>}
                </div>
                <span style={{ fontSize: 11, color: avail.available && filled > 0 ? '#666' : '#ccc' }}>
                  {avail.available && filled > 0 ? costRange(key, answers) + ' / part' : avail.available ? '—' : avail.reason}
                </span>
              </div>

              {avail.available ? (
                [['Quality', s.q, prev.q], ['Speed', s.s, prev.s], ['Cost fit', s.c, prev.c]].map(([label, val, pval]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: '#aaa', width: 56, flexShrink: 0 }}>{label}</span>
                    <AnimatedBar value={val} color={TECHS[key].color} prevValue={pval} />
                    <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>{val}</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 11, color: '#bbb', fontStyle: 'italic', marginTop: 2 }}>{avail.reason}</div>
              )}
            </div>
          )
        })}

        {filled >= 2 && sorted[0] && isTechAvailable(sorted[0][0], answers).available && (
          <div style={{ margin: '10px 14px', padding: '10px 12px', borderRadius: 8, background: '#fff', border: '1px solid #e0e0e0', borderLeft: '3px solid #378ADD' }}>
            <p style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>
              <strong style={{ color: '#1a1a1a' }}>Signal:</strong> For {answers.material || 'your material'}{answers.thickness ? ` at ${answers.thickness}mm` : ''}, <strong style={{ color: '#1a1a1a' }}>{TECHS[sorted[0][0]].label}</strong> is currently leading.
              {answers.haz?.includes('Very') ? ' Waterjet advantage: zero heat-affected zone.' : ''}
              {answers.material && SPECIALTY_MATERIALS.some(m => answers.material.includes(m)) ? ' Waterjet preferred for specialty materials.' : ''}
              {answers.material?.includes('Mild steel') && parseFloat(answers.thickness) > 50 ? ' Oxyfuel is highly competitive at this thickness.' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}