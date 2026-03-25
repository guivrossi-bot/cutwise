'use client'
import { useState } from 'react'
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

const TECH_NAMES = { laser: 'Fiber laser', waterjet: 'Waterjet', plasma: 'Plasma', oxyfuel: 'Oxyfuel' }
const TECH_COLORS = { laser: '#378ADD', waterjet: '#1D9E75', plasma: '#EF9F27', oxyfuel: '#D85A30' }

function score(answers) {
  const t = parseFloat(answers.thickness) || 0
  const fin = answers.finish || '', tol = answers.tolerance || ''
  const haz = answers.haz || '', pri = answers.priority || '', m = answers.material || ''
  let L = { q: 80, s: 75, c: 70, sc: 75 }
  let W = { q: 75, s: 45, c: 55, sc: 58 }
  let P = { q: 50, s: 90, c: 85, sc: 65 }
  let O = { q: 35, s: 30, c: 95, sc: 50 }
  if (t > 25) { O.sc += 20; L.sc -= 10 }
  if (t > 50) { O.sc += 15; L.sc -= 20 }
  if (fin.includes('Fine')) { L.q += 10; W.q += 8; P.q -= 20; O.q -= 30 }
  if (tol.includes('0.1') || tol.includes('0.05')) { L.sc += 10; W.sc += 8; P.sc -= 15; O.sc -= 25 }
  if (haz.includes('Very')) { W.sc += 15; L.sc -= 10; O.sc -= 15 }
  if (pri.includes('Lowest')) { O.sc += 20; P.sc += 15; L.sc -= 5 }
  if (pri.includes('quality')) { L.sc += 12; P.sc -= 10; O.sc -= 15 }
  if (pri.includes('heat')) { W.sc += 20; L.sc -= 15; P.sc -= 20; O.sc -= 20 }
  if (['Aluminum', 'Stainless', 'Copper', 'Titanium'].some(x => m.includes(x))) {
    O.sc = Math.max(O.sc - 40, 5)
  }
  const cl = v => Math.min(99, Math.max(5, Math.round(v)))
  return {
    laser: { q: cl(L.q), s: cl(L.s), c: cl(L.c), sc: cl(L.sc) },
    waterjet: { q: cl(W.q), s: cl(W.s), c: cl(W.c), sc: cl(W.sc) },
    plasma: { q: cl(P.q), s: cl(P.s), c: cl(P.c), sc: cl(P.sc) },
    oxyfuel: { q: cl(O.q), s: cl(O.s), c: cl(O.c), sc: cl(O.sc) }
  }
}

function costRange(key, answers) {
  const base = { laser: [2, 8], waterjet: [4, 14], plasma: [1, 5], oxyfuel: [0.5, 3] }
  const r = base[key]
  const t = parseFloat(answers.thickness) || 5
  const mult = t > 30 ? 2.2 : t > 15 ? 1.5 : 1
  return `$${(r[0] * mult).toFixed(1)}–$${(r[1] * mult).toFixed(1)}`
}

export default function Wizard({ units, onComplete }) {
  const [answers, setAnswers] = useState({})
  const [current, setCurrent] = useState(0)
  const [submitted, setSubmitted] = useState(false)

  const step = STEPS[current]
  const filled = Object.keys(answers).filter(k => answers[k]).length
  const sc = score(answers)
  const sorted = Object.entries(sc).sort((a, b) => b[1].sc - a[1].sc)

  function pick(id, val) {
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

      <div style={{ background: '#f9f9f9', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Live comparison</div>
          <div style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 10,
            background: filled < 2 ? '#FAEEDA' : filled < 5 ? '#E6F1FB' : '#E1F5EE',
            color: filled < 2 ? '#633806' : filled < 5 ? '#0C447C' : '#085041'
          }}>
            {filled < 2 ? 'Waiting for input' : filled < 5 ? 'Partial estimate' : 'Good estimate'}
          </div>
        </div>

        {sorted.map(([key, s], i) => (
          <div key={key} style={{ padding: '12px 18px', borderBottom: '1px solid #e8e8e8', background: i === 0 && filled > 1 ? '#fff' : 'transparent' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{TECH_NAMES[key]}</span>
                {i === 0 && filled > 1 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#E6F1FB', color: '#0C447C' }}>Leading</span>}
              </div>
              <span style={{ fontSize: 12, color: '#666' }}>{filled > 0 ? costRange(key, answers) + ' / part' : '—'}</span>
            </div>
            {[['Quality', s.q], ['Speed', s.s], ['Cost fit', s.c]].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: '#aaa', width: 60, flexShrink: 0 }}>{label}</span>
                <div style={{ flex: 1, height: 4, background: '#e0e0e0', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 2, background: TECH_COLORS[key], width: `${val}%`, transition: 'width 0.5s' }} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}