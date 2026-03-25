'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

const NAMES = { laser: 'Fiber laser', waterjet: 'Waterjet', plasma: 'Plasma', oxyfuel: 'Oxyfuel' }
const COLORS = { laser: '#378ADD', waterjet: '#1D9E75', plasma: '#EF9F27', oxyfuel: '#D85A30' }

function scoreReport(answers) {
  const t = parseFloat(answers.thickness) || 8
  const lr = parseFloat(answers.labor_rate) || 35
  const mult = (t > 30 ? 2.2 : t > 15 ? 1.5 : 1) * (lr > 50 ? 1.3 : lr < 20 ? 0.8 : 1)
  const mat = answers.material || ''
  const noOxy = ['Aluminum', 'Stainless', 'Copper', 'Titanium'].some(m => mat.includes(m))
  const fin = answers.finish || '', tol = answers.tolerance || ''
  const haz = answers.haz || '', pri = answers.priority || ''

  let scores = { laser: 75, waterjet: 58, plasma: 65, oxyfuel: noOxy ? 0 : 50 }
  if (fin.includes('Fine')) { scores.laser += 10; scores.waterjet += 8; scores.plasma -= 20; scores.oxyfuel -= 30 }
  if (tol.includes('0.1') || tol.includes('0.05')) { scores.laser += 10; scores.waterjet += 8; scores.plasma -= 15; scores.oxyfuel -= 25 }
  if (haz?.includes('Very')) { scores.waterjet += 15; scores.laser -= 10 }
  if (pri?.includes('Lowest')) { scores.plasma += 15; scores.laser -= 5; scores.oxyfuel += 20 }
  if (t > 50 && !noOxy) scores.oxyfuel += 15

  const costs = {
    laser:    { total: (3.2 * mult).toFixed(2), labor: (0.6 * mult).toFixed(2), gas: '0.30', elec: '0.25', cons: '0.65', time: '~2.5 min' },
    waterjet: { total: (5.8 * mult).toFixed(2), labor: (0.9 * mult).toFixed(2), gas: '1.10', elec: '0.30', cons: '0.60', time: '~7.5 min' },
    plasma:   { total: (1.4 * mult).toFixed(2), labor: (0.35 * mult).toFixed(2), gas: '0.25', elec: '0.20', cons: '0.20', time: '~1.4 min' },
    oxyfuel:  noOxy ? null : { total: (0.8 * mult).toFixed(2), labor: (0.3 * mult).toFixed(2), gas: '0.35', elec: '0.05', cons: '0.10', time: '~4.5 min' },
  }

  const sorted = Object.entries(scores).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  return { scores, costs, sorted, noOxy }
}

export default function CutReport({ answers, units, onRestart }) {
  const [fbOpen, setFbOpen] = useState(false)
  const [fbScore, setFbScore] = useState(0)
  const [fbComment, setFbComment] = useState('')
  const [fbDone, setFbDone] = useState(false)

  const t = parseFloat(answers.thickness) || 8
  const thickStr = units === 'imperial' ? `${(t / 25.4).toFixed(2)} in` : `${t}mm`
  const { costs, sorted, noOxy } = scoreReport(answers)
  const winner = sorted[0]
  const winnerName = NAMES[winner[0]]
  const winnerCost = costs[winner[0]]
  const cols = noOxy ? 3 : 4

  async function submitFeedback() {
    try {
      await supabase.from('feedback_submissions').insert([{
        overall_score: fbScore,
        comment: fbComment,
        answers_payload: answers,
        recommended_process: winner[0]
      }])
    } catch (e) {}
    setFbDone(true)
  }

  const secTitle = txt => (
    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #e8e8e8' }}>{txt}</div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 24px', borderBottom: '1px solid #e8e8e8', background: '#f9f9f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, color: '#666' }}>Report · {answers.material || 'Mild steel'} · {thickStr}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onRestart} style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid #e0e0e0', fontSize: 12, color: '#666' }}>New analysis</button>
          <button onClick={() => window.print()} style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid #85B7EB', background: '#E6F1FB', fontSize: 12, color: '#0C447C', fontWeight: 500 }}>Export PDF</button>
        </div>
      </div>

      <div style={{ maxWidth: 820, width: '100%', margin: '0 auto', padding: '24px 20px 48px' }}>

        <div style={{ padding: '14px 18px', borderRadius: 12, border: '2px solid #85B7EB', background: '#E6F1FB', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#185FA5', letterSpacing: '0.5px', marginBottom: 3 }}>RECOMMENDED TECHNOLOGY</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: '#0C447C', marginBottom: 4 }}>{winnerName}</div>
            <div style={{ fontSize: 12, color: '#185FA5', lineHeight: 1.5, maxWidth: 480 }}>
              For {answers.material || 'your material'} at {thickStr}, {winnerName.toLowerCase()} delivers the best balance of quality, speed, and cost.
              {noOxy ? ' Note: oxyfuel is not compatible with this material.' : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: '#185FA5', marginBottom: 2 }}>Est. cost per part</div>
            <div style={{ fontSize: 26, fontWeight: 500, color: '#0C447C' }}>${winnerCost.total}</div>
            <div style={{ fontSize: 11, color: '#185FA5' }}>industry average basis</div>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          {secTitle('Cost per part — breakdown')}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 10 }}>
            {sorted.map(([key]) => {
              const d = costs[key]
              if (!d) return null
              const isWin = key === winner[0]
              const gasLabel = key === 'waterjet' ? 'Abrasive' : key === 'oxyfuel' ? 'O₂ + fuel' : 'Gas'
              return (
                <div key={key} style={{ border: isWin ? '2px solid #85B7EB' : '1px solid #e0e0e0', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '9px 13px', background: isWin ? '#E6F1FB' : '#f9f9f9', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: isWin ? '#0C447C' : '#1a1a1a' }}>{NAMES[key]}</span>
                    <span style={{ fontSize: 15, fontWeight: 500, color: isWin ? '#0C447C' : '#1a1a1a' }}>${d.total}</span>
                  </div>
                  {[['Labor', d.labor],[gasLabel, d.gas],['Electricity', d.elec],['Consumables', d.cons]].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 13px', borderBottom: '1px solid #f0f0f0', fontSize: 12 }}>
                      <span style={{ color: '#666' }}>{l}</span>
                      <span style={{ fontWeight: 500 }}>${v}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          {secTitle('Time estimates per part')}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 10 }}>
            {sorted.map(([key], i) => {
              const d = costs[key]
              if (!d) return null
              const isWin = key === winner[0]
              const pct = [40, 80, 22, 60][i] || 40
              return (
                <div key={key} style={{ border: isWin ? '2px solid #85B7EB' : '1px solid #e0e0e0', borderRadius: 12, padding: '11px 13px', background: isWin ? 'rgba(230,241,251,0.15)' : '#fff' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: isWin ? '#0C447C' : '#1a1a1a' }}>{NAMES[key]}</div>
                  <div style={{ height: 5, background: '#e0e0e0', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{ height: '100%', borderRadius: 3, background: COLORS[key], width: `${pct}%` }} />
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>{d.time} / part</div>
                </div>
              )
            })}
          </div>
        </div>

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