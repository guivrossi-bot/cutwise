'use client'
export default function Hero({ onStart, onSample }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '48px 24px', textAlign: 'center', gap: 20
    }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: '#888', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
        Cutting technology selector
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.5px', maxWidth: 520, color: '#1a1a1a' }}>
        Find the right cut for your{' '}
        <span style={{ color: '#378ADD' }}>material, tolerance,</span>
        {' '}and budget
      </h1>
      <p style={{ fontSize: 15, color: '#666', lineHeight: 1.6, maxWidth: 440 }}>
        Answer a few questions about your job. Get a full comparison report across
        Laser, Plasma, Waterjet, and Oxyfuel — with cost breakdowns and a clear recommendation.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['Fiber laser', 'Plasma', 'Waterjet', 'Oxyfuel'].map(t => (
          <div key={t} style={{
            padding: '5px 14px', borderRadius: 20, border: '1px solid #e0e0e0',
            background: '#f5f5f5', fontSize: 12, color: '#666'
          }}>{t}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
        <button onClick={onStart} style={{
          padding: '10px 24px', borderRadius: 24, background: '#378ADD',
          color: '#fff', fontSize: 14, fontWeight: 500, border: 'none'
        }}>
          Start free analysis →
        </button>
        <button onClick={onSample} style={{
          padding: '10px 20px', borderRadius: 24, border: '1px solid #e0e0e0',
          background: 'transparent', color: '#666', fontSize: 14
        }}>
          See sample report
        </button>
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
        {['No sign-up to start', 'Metric & Imperial', 'Report sent to your inbox'].map(t => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#999' }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#1D9E75' }} />
            {t}
          </div>
        ))}
      </div>
    </div>
  )
}