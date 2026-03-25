'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

const TECHS = {
  plasma_conv:  { label: 'Plasma (Conventional)', short: 'Plasma Conv.', color: '#EF9F27' },
  plasma_hidef: { label: 'Plasma (High Definition)', short: 'Plasma HiDef', color: '#BA7517' },
  laser_low:    { label: 'Laser (Low End)', short: 'Laser Low', color: '#85B7EB' },
  laser_high:   { label: 'Laser (High End)', short: 'Laser High', color: '#185FA5' },
  waterjet:     { label: 'Waterjet', short: 'Waterjet', color: '#1D9E75' },
  oxyfuel:      { label: 'Oxyfuel', short: 'Oxyfuel', color: '#D85A30' },
}

const SPECIALTY_MATERIALS = ['Copper', 'Titanium', 'Other']
const THICKNESS_CAPS = {
  plasma_conv: 50, plasma_hidef: 80,
  laser_low: 25, laser_high: 40,
  waterjet: 300, oxyfuel: 400,
}

function isTechAvailable(key, answers) {
  const mat = answers.material || ''
  const t = parseFloat(answers.thickness) || 0
  if (key === 'oxyfuel' && !mat.includes('Mild steel')) return { available: false, reason: 'Mild steel only' }
  if (t > 0 && t > THICKNESS_CAPS[key]) return { available: false, reason: `Max ${THICKNESS_CAPS[key]}mm` }
  return { available: true }
}

function scoreReport(answers) {
  const t = parseFloat(answers.thickness) || 8
  const lr = parseFloat(answers.labor_rate) || 35
  const mult = (t > 50 ? 3.5 : t > 30 ? 2.2 : t > 15 ? 1.5 : 1) * (lr > 50 ? 1.3 : lr < 20 ? 0.8 : 1)
  const mat = answers.material || ''
  const isSpecialty = SPECIALTY_MATERIALS.some(m => mat.includes(m))
  const fin = answers.finish || '', tol = answers.tolerance || ''
  const haz = answers.haz || '', pri = answers.priority || ''

  let sc = {
    plasma_conv:  { q: 45, s: 92, c: 95, sc: 65 },
    plasma_hidef: { q: 72, s: 88, c: 75, sc: 72 },
    laser_low:    { q: 82, s: 72, c: 68, sc: 74 },
    laser_high:   { q: 92, s: 85, c: 55, sc: 80 },
    waterjet:     { q: 88, s: 42, c: 52, sc: 62 },
    oxyfuel:      { q: 30, s: 28, c: 98, sc: 48 },
  }

  if (isSpecialty) { sc.waterjet.sc += 25; sc.plasma_conv.sc -= 15; sc.plasma_hidef.sc -= 10 }
  if (fin.includes('Fine')) { sc.laser_high.sc += 10; sc.waterjet.sc += 8; sc.plasma_conv.sc -= 20; sc.plasma_hidef.sc -= 10; sc.oxyfuel.sc -= 35 }
  if (tol.includes('0.1') || tol.includes('0.05')) { sc.laser_high.sc += 12; sc.waterjet.sc += 10; sc.plasma_conv.sc -= 18; sc.oxyfuel.sc -= 30 }
  if (haz?.includes('Very')) { sc.waterjet.sc += 22; sc.laser_high.sc -= 12; sc.plasma_conv.sc -= 22; sc.oxyfuel.sc -= 25 }
  if (pri?.includes('Lowest')) { sc.oxyfuel.sc += 22; sc.plasma_conv.sc += 18; sc.laser_high.sc -= 8 }
  if (pri?.includes('quality')) { sc.laser_high.sc += 15; sc.waterjet.sc += 10; sc.plasma_conv.sc -= 15 }
  if (t > 20) { sc.plasma_hidef.sc += 12; sc.laser_low.sc -= 15; sc.oxyfuel.sc += 15 }
  if (t > 50) { sc.oxyfuel.sc += 20; sc.waterjet.sc += 10; sc.laser_high.sc -= 10 }

  // Apply availability
  Object.keys(sc).forEach(key => {
    if (!isTechAvailable(key, answers).available) {
      sc[key] = { q: 0, s: 0, c: 0, sc: 0 }
    }
  })

  const cl = v => Math.min(99, Math.max(0, Math.round(v)))
  Object.keys(sc).forEach(k => { sc[k] = { q: cl(sc[k].q), s: cl(sc[k].s), c: cl(sc[k].c), sc: cl(sc[k].sc) } })

  // Cost per part estimates
  const wjMult = isSpecialty ? mult * 1.6 : mult
  const spMult = isSpecialty ? mult * 1.2 : mult
  const costs = {
    plasma_conv:  { total: (1.2 * spMult).toFixed(2), labor: (0.3 * spMult).toFixed(2), gas: '0.20', elec: '0.15', cons: '0.15', time: '~1.2 min' },
    plasma_hidef: { total: (1.8 * spMult).toFixed(2), labor: (0.4 * spMult).toFixed(2), gas: '0.28', elec: '0.22', cons: '0.30', time: '~1.5 min' },
    laser_low:    { total: (2.5 * spMult).toFixed(2), labor: (0.5 * spMult).toFixed(2), gas: '0.25', elec: '0.20', cons: '0.55', time: '~2.2 min' },
    laser_high:   { total: (3.8 * spMult).toFixed(2), labor: (0.7 * spMult).toFixed(2), gas: '0.32', elec: '0.28', cons: '0.70', time: '~1.8 min' },
    waterjet:     { total: (5.5 * wjMult).toFixed(2), labor: (0.9 * wjMult).toFixed(2), gas: '1.20', elec: '0.32', cons: '0.65', time: '~7.0 min' },
    oxyfuel:      isTechAvailable('oxyfuel', answers).available ? { total: (0.7 * mult).toFixed(2), labor: (0.25 * mult).toFixed(2), gas: '0.30', elec: '0.04', cons: '0.08', time: '~4.0 min' } : null,
  }

  const sorted = Object.entries(sc).filter(([, v]) => v.sc > 0).sort((a, b) => b[1].sc - a[1].sc)
  return { sc, costs, sorted }
}

export default function CutReport({ answers, units, onRestart }) {
  const [fbOpen, setFbOpen] = useState(false)
  const [fbScore, setFbScore] = useState(0)
  const [fbComment, setFbComment] = useState('')
  const [fbDone, setFbDone] = useState(false)

  const t = parseFloat(answers.thickness) || 8
  const thickStr = units === 'imperial' ? `${(t / 25.4).toFixed(2)} in` : `${t}mm`
  const { sc, costs, sorted } = scoreReport(answers)
  const winner = sorted[0]
  const winnerName = TECHS[winner[0]].label
  const winnerCost = costs[winner[0]]

  async function submitFeedback() {
    try {
      await supabase.from('feedback_submissions').insert([{
        overall_score: fbScore, comment: fbComment,
        answers_payload: answers, recommended_process: winner[0]
      }])
    } catch (e) {}
    setFbDone(true)
  }

  const secTitle = txt => (
    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #e8e8e8' }}>{txt}</div>
  )

  const availableKeys = sorted.map(([k]) => k)
  const unavailableKeys = Object.keys(TECHS).filter(k => !availableKeys.includes(k))

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

      {/* Sub-nav */}
      <div style={{ padding: '10px 24px', borderBottom: '1px solid #e8e8e8', background: '#f9f9f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, color: '#666' }}>Report · {answers.material || 'Mild steel'} · {thickStr}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onRestart} style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid #e0e0e0', fontSize: 12, color: '#666' }}>New analysis</button>
          <button onClick={() => window.print()} style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid #85B7EB', background: '#E6F1FB', fontSize: 12, color: '#0C447C', fontWeight: 500 }}>Export PDF</button>
        </div>
      </div>

      <div style={{ maxWidth: 860, width: '100%', margin: '0 auto', padding: '24px 20px 48px' }}>

        {/* Recommendation banner */}
        <div style={{ padding: '14px 18px', borderRadius: 12, border: '2px solid #85B7EB', background: '#E6F1FB', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#185FA5', letterSpacing: '0.5px', marginBottom: 3 }}>RECOMMENDED TECHNOLOGY</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: '#0C447C', marginBottom: 4 }}>{winnerName}</div>
            <div style={{ fontSize: 12, color: '#185FA5', lineHeight: 1.5, maxWidth: 500 }}>
              For {answers.material || 'your material'} at {thickStr}, {winnerName.toLowerCase()} delivers the best balance of quality, speed, and cost for your requirements.
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: '#185FA5', marginBottom: 2 }}>Est. cost per part</div>
            <div style={{ fontSize: 26, fontWeight: 500, color: '#0C447C' }}>${winnerCost.total}</div>
            <div style={{ fontSize: 11, color: '#185FA5' }}>industry average basis</div>
          </div>
        </div>

        {/* Not applicable notice */}
        {unavailableKeys.length > 0 && (
          <div style={{ marginBottom: 16, padding: '8px 14px', borderRadius: 8, background: '#f9f9f9', border: '1px solid #e0e0e0', fontSize: 12, color: '#888', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#ccc', fontSize: 14 }}>⊘</span>
            <span><strong style={{ color: '#666' }}>Not applicable for this job:</strong> {unavailableKeys.map(k => TECHS[k].label).join(', ')} — {unavailableKeys.map(k => isTechAvailable(k, answers).reason).filter((v,i,a) => a.indexOf(v) === i).join('; ')}</span>
          </div>
        )}

        {/* Scorecard */}
        <div style={{ marginBottom: 24 }}>
          {secTitle('Side-by-side scorecard')}
          <div style={{ border: '1px solid #e0e0e0', borderRadius: 12, overflow: 'hidden', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={{ padding: '9px 12px', background: '#f9f9f9', fontSize: 11, color: '#aaa', fontWeight: 500, textAlign: 'left', borderBottom: '1px solid #e0e0e0', width: 120 }}>Criterion</th>
                  {sorted.map(([key], i) => (
                    <th key={key} style={{ padding: '9px 10px', background: i === 0 ? '#E6F1FB' : '#f9f9f9', fontSize: 11, fontWeight: 500, color: i === 0 ? '#0C447C' : '#1a1a1a', borderBottom: '1px solid #e0e0e0', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: TECHS[key].color }} />
                        {TECHS[key].short}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Cut quality', vals: { plasma_conv: '⚡ Fair', plasma_hidef: '✓ Good', laser_low: '✓ Very good', laser_high: '★ Excellent', waterjet: '★ Excellent', oxyfuel: '✗ Rough' } },
                  { label: 'Tolerance', vals: { plasma_conv: '±0.5mm', plasma_hidef: '±0.2mm', laser_low: '±0.15mm', laser_high: '±0.05mm', waterjet: '±0.1mm', oxyfuel: '±1.5mm' } },
                  { label: 'Speed', vals: { plasma_conv: '⚡ Fastest', plasma_hidef: '⚡ Very fast', laser_low: '✓ Fast', laser_high: '✓ Fast', waterjet: '✗ Slow', oxyfuel: '✗ Slow' } },
                  { label: 'Heat zone', vals: { plasma_conv: '✗ High', plasma_hidef: '⚡ Medium', laser_low: '⚡ Low', laser_high: '⚡ Low', waterjet: '★ None', oxyfuel: '✗ High' } },
                  { label: 'Cost fit', vals: { plasma_conv: '★ Lowest', plasma_hidef: '✓ Low', laser_low: '✓ Medium', laser_high: '⚡ Higher', waterjet: '⚡ Higher', oxyfuel: '★ Lowest' } },
                  { label: 'Thick plate', vals: { plasma_conv: '✓ Good', plasma_hidef: '★ Excellent', laser_low: '✗ Limited', laser_high: '⚡ Medium', waterjet: '★ Excellent', oxyfuel: '★ Best' } },
                ].map(row => (
                  <tr key={row.label}>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: '#666', borderBottom: '1px solid #f0f0f0' }}>{row.label}</td>
                    {sorted.map(([key], i) => {
                      const val = row.vals[key] || '—'
                      const isGood = val.startsWith('★') || val.startsWith('✓')
                      const isBad = val.startsWith('✗')
                      const bg = i === 0 ? 'rgba(230,241,251,0.15)' : 'transparent'
                      const pillBg = isGood ? '#E1F5EE' : isBad ? '#FCEBEB' : '#FAEEDA'
                      const pillColor = isGood ? '#085041' : isBad ? '#791F1F' : '#633806'
                      return (
                        <td key={key} style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0', background: bg, textAlign: 'center' }}>
                          <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: pillBg, color: pillColor, fontWeight: 500, whiteSpace: 'nowrap' }}>{val}</span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cost breakdown */}
        <div style={{ marginBottom: 24 }}>
          {secTitle('Cost per part — breakdown')}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(sorted.length, 3)}, minmax(0,1fr))`, gap: 10 }}>
            {sorted.map(([key]) => {
              const d = costs[key]
              if (!d) return null
              const isWin = key === winner[0]
              const gasLabel = key === 'waterjet' ? 'Abrasive' : key === 'oxyfuel' ? 'O₂ + fuel' : 'Gas'
              return (
                <div key={key} style={{ border: isWin ? '2px solid #85B7EB' : '1px solid #e0e0e0', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '9px 13px', background: isWin ? '#E6F1FB' : '#f9f9f9', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: TECHS[key].color }} />
                      <span style={{ fontSize: 11, fontWeight: 500, color: isWin ? '#0C447C' : '#1a1a1a' }}>{TECHS[key].short}</span>
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 500, color: isWin ? '#0C447C' : '#1a1a1a' }}>${d.total}</span>
                  </div>
                  {[['Labor', d.labor],[gasLabel, d.gas],['Electricity', d.elec],['Consumables', d.cons],['Cycle time', d.time]].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 13px', borderBottom: '1px solid #f0f0f0', fontSize: 11 }}>
                      <span style={{ color: '#666' }}>{l}</span>
                      <span style={{ fontWeight: 500 }}>{l === 'Cycle time' ? v : `$${v}`}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {sorted.length > 3 && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sorted.length - 3}, minmax(0,1fr))`, gap: 10, marginTop: 10 }}>
              {sorted.slice(3).map(([key]) => {
                const d = costs[key]
                if (!d) return null
                const isWin = key === winner[0]
                const gasLabel = key === 'waterjet' ? 'Abrasive' : key === 'oxyfuel' ? 'O₂ + fuel' : 'Gas'
                return (
                  <div key={key} style={{ border: isWin ? '2px solid #85B7EB' : '1px solid #e0e0e0', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '9px 13px', background: isWin ? '#E6F1FB' : '#f9f9f9', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: TECHS[key].color }} />
                        <span style={{ fontSize: 11, fontWeight: 500, color: isWin ? '#0C447C' : '#1a1a1a' }}>{TECHS[key].short}</span>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 500, color: isWin ? '#0C447C' : '#1a1a1a' }}>${d.total}</span>
                    </div>
                    {[['Labor', d.labor],[gasLabel, d.gas],['Electricity', d.elec],['Consumables', d.cons],['Cycle time', d.time]].map(([l, v]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 13px', borderBottom: '1px solid #f0f0f0', fontSize: 11 }}>
                        <span style={{ color: '#666' }}>{l}</span>
                        <span style={{ fontWeight: 500 }}>{l === 'Cycle time' ? v : `$${v}`}</span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Score bars */}
        <div style={{ marginBottom: 24 }}>
          {secTitle('Quality · Speed · Cost comparison')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[['Quality', 'q'], ['Speed', 's'], ['Cost fit', 'c']].map(([label, key]) => (
              <div key={label}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 6, fontWeight: 500 }}>{label}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {sorted.map(([tech, s]) => (
                    <div key={tech} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 90, fontSize: 11, color: '#888', flexShrink: 0, textAlign: 'right' }}>{TECHS[tech].short}</div>
                      <div style={{ flex: 1, height: 10, background: '#f0f0f0', borderRadius: 5, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 5, background: TECHS[tech].color, width: `${s[key]}%`, transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)' }} />
                      </div>
                      <div style={{ width: 28, fontSize: 11, color: '#aaa' }}>{s[key]}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Feedback */}
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 12, overflow: 'hidden' }}>
          <div onClick={() => setFbOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Were these estimates accurate?</div>
                <div style={{ fontSize: 12, color: '#aaa' }}>Help improve the cost engine</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#185FA5', fontWeight: 500 }}>{fbOpen ? 'Close ×' : 'Leave feedback →'}</div>
          </div>

          {fbOpen && !fbDone && (
            <div style={{ borderTop: '1px solid #e8e8e8' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #e8e8e8' }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>How accurate was the overall recommendation?</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[[1,'Way off'],[2,'Somewhat off'],[3,'Close enough'],[4,'Pretty accurate'],[5,'Spot on']].map(([n, label]) => (
                    <button key={n} onClick={() => setFbScore(n)} style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                      border: fbScore === n ? (n <= 2 ? '1px solid #F09595' : n === 3 ? '1px solid #FAC775' : '1px solid #9FE1CB') : '1px solid #e0e0e0',
                      background: fbScore === n ? (n <= 2 ? '#FCEBEB' : n === 3 ? '#FAEEDA' : '#E1F5EE') : '#fff',
                      color: fbScore === n ? (n <= 2 ? '#791F1F' : n === 3 ? '#633806' : '#085041') : '#666'
                    }}>{n} — {label}</button>
                  ))}
                </div>
              </div>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #e8e8e8' }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Any context helps — what did you actually observe?</div>
                <textarea value={fbComment} onChange={e => setFbComment(e.target.value)} rows={3}
                  placeholder="e.g. Laser cost was accurate but plasma was 30% high for our shop rate..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px' }}>
                <div style={{ fontSize: 11, color: '#aaa' }}>Anonymous · used only to improve estimates</div>
                <button onClick={submitFeedback} disabled={fbScore === 0} style={{
                  padding: '7px 18px', borderRadius: 8, border: '1px solid #85B7EB',
                  background: '#E6F1FB', fontSize: 13, fontWeight: 500, color: '#0C447C',
                  opacity: fbScore === 0 ? 0.4 : 1
                }}>Send feedback</button>
              </div>
            </div>
          )}

          {fbOpen && fbDone && (
            <div style={{ borderTop: '1px solid #e8e8e8', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Thank you — that genuinely helps.</div>
              <div style={{ fontSize: 12, color: '#666', maxWidth: 280, lineHeight: 1.5 }}>Every piece of feedback directly adjusts our cost model.</div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}