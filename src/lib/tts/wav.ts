/**
 * Peak-normalise model output (piper voices come out at roughly 0.3–0.6 peak, which is
 * noticeably quieter than system voices) and encode it as 16-bit mono WAV.
 */
export function toNormalizedWav(pcm: Float32Array, sampleRate: number, target = 0.9): Blob {
  let peak = 0
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]!))
  // cap the boost so near-silent output is not blown up into noise
  const gain = peak > 0 ? Math.min(target / peak, 4) : 1

  const view = new DataView(new ArrayBuffer(44 + pcm.length * 2))
  const str = (o: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  view.setUint32(4, 36 + pcm.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  str(36, 'data')
  view.setUint32(40, pcm.length * 2, true)
  for (let i = 0; i < pcm.length; i++) {
    const v = Math.max(-1, Math.min(1, pcm[i]! * gain))
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true)
  }
  return new Blob([view.buffer], { type: 'audio/wav' })
}
