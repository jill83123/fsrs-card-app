/*
 * Integer → hiragana reading (up to 9 digits).
 * Ported from misaki/num2kana.py (Apache-2.0), itself from
 * Greatdane/Convert-Numbers-to-Japanese (MIT).
 */
const H: Record<string, string> = {
  '0': 'ゼロ',
  '1': 'いち',
  '2': 'に',
  '3': 'さん',
  '4': 'よん',
  '5': 'ご',
  '6': 'ろく',
  '7': 'なな',
  '8': 'はち',
  '9': 'きゅう',
  '10': 'じゅう',
  '100': 'ひゃく',
  '1000': 'せん',
  '10000': 'まん',
  '100000000': 'おく',
  '300': 'さんびゃく',
  '600': 'ろっぴゃく',
  '800': 'はっぴゃく',
  '3000': 'さんぜん',
  '8000': 'はっせん',
  '01000': 'いっせん',
}

const one = (n: string) => H[n]!

function two(n: string): string {
  if (n[0] === '0') return one(n[1]!)
  if (n === '10') return H['10']!
  if (n[0] === '1') return H['10']! + one(n[1]!)
  if (n[1] === '0') return one(n[0]!) + H['10']
  return one(n[0]!) + H['10'] + one(n[1]!)
}

function three(n: string): string {
  let out = ''
  const d = n[0]!
  if (d === '1') out += H['100']
  else if (d === '3' || d === '6' || d === '8') out += H[`${d}00`]
  else out += one(d) + H['100']
  if (n.slice(1) !== '00') out += n[1] === '0' ? one(n[2]!) : two(n.slice(1))
  return out
}

function four(n: string, standAlone: boolean): string {
  if (n === '0000') return ''
  n = n.replace(/^0+/, '')
  if (n.length === 1) return one(n)
  if (n.length === 2) return two(n)
  if (n.length === 3) return three(n)
  let out = ''
  const d = n[0]!
  if (d === '1') out += standAlone ? H['1000'] : H['01000']
  else if (d === '3' || d === '8') out += H[`${d}000`]
  else out += one(d) + H['1000']
  if (n.slice(1) !== '000') out += n[1] === '0' ? two(n.slice(2)) : three(n.slice(1))
  return out
}

function many(n: string): string {
  const head = n.slice(0, -4)
  let out = ''
  if (head.length === 1) out += one(head) + H['10000']
  else if (head.length === 2) out += two(head) + H['10000']
  else if (head.length === 3) out += three(head) + H['10000']
  else if (head.length === 4) out += four(head, false) + H['10000']
  else if (head.length === 5) {
    out += one(n[0]!) + H['100000000'] + four(n.slice(1, 5), false)
    if (n.slice(1, 5) !== '0000') out += H['10000']
  }
  return out + four(n.slice(-4), false)
}

export function numberToKana(digits: string): string {
  let n = digits.replace(/,/g, '')
  if (n.length > 9) return n.split('').map(one).join('')
  n = n.replace(/^0+(?=\d)/, '')
  if (n.length === 1) return one(n)
  if (n.length === 2) return two(n)
  if (n.length === 3) return three(n)
  if (n.length === 4) return four(n, true)
  return many(n)
}
