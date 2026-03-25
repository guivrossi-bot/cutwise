'use client'
import { useState } from 'react'
import Hero from './components/Hero'
import Wizard from './components/Wizard'
import Report from './components/CutReport'

export default function Home() {
  const [screen, setScreen] = useState('hero')
  const [answers, setAnswers] = useState({})
  const [units, setUnits] = useState('metric')

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: '52px',
        borderBottom: '1px solid #e8e8e8', background: '#fff',
        position: 'sticky', top: 0, zIndex: 10
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.3px' }}>
          cut<span style={{ color: '#378ADD' }}>wise</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', background: '#f5f5f5', borderRadius: 20, border: '1px solid #e0e0e0', overflow: 'hidden' }}>
            {['imperial', 'metric'].map(u => (
              <button key={u} onClick={() => setUnits(u)} style={{
                padding: '4px 12px', fontSize: 11, fontWeight: 500,
                background: units === u ? '#fff' : 'transparent',
                color: units === u ? '#1a1a1a' : '#888',
                borderRadius: 20, border: 'none',
                boxShadow: units === u ? '0 0 0 1px #e0e0e0' : 'none'
              }}>
                {u === 'imperial' ? 'in / lb' : 'mm / kg'}
              </button>
            ))}
          </div>
          <button onClick={() => setScreen('wizard')} style={{
            padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
            background: '#E6F1FB', border: '1px solid #85B7EB', color: '#0C447C'
          }}>
            Start analysis
          </button>
        </div>
      </nav>

      {screen === 'hero' && <Hero onStart={() => setScreen('wizard')} onSample={() => setScreen('report')} />}
      {screen === 'wizard' && <Wizard key={units} units={units} onComplete={(a) => { setAnswers(a); setScreen('report') }} />}
      {screen === 'report' && <Report key={units} answers={answers} units={units} onRestart={() => { setAnswers({}); setScreen('wizard') }} />}
    </div>
  )
}