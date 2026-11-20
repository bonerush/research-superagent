/** The taste profile: the one document that tells the scout what this researcher cares about. */

const LF = String.fromCharCode(10)
const CRLF = String.fromCharCode(13, 10)

/** The three sections a profile must carry. */
export const PROFILE_SECTIONS = ['做什么', '看重什么', '不要提什么'] as const

/** One section name. */
export type ProfileSection = typeof PROFILE_SECTIONS[number]

/** A profile, one body per section. */
export type Profile = Record<ProfileSection, string>

/** A blank profile for a first run: every section present, every body empty. */
export function emptyProfile(): Profile {
  return { '做什么': '', '看重什么': '', '不要提什么': '' }
}

/**
 * Reads the profile document. A missing section throws with its name: the scout would otherwise propose against
 * half a picture, and the person would reject the batch for reasons the file could have stated.
 */
export function parseProfile(text: string): Profile {
  const lines = text.split(CRLF).join(LF).split(LF)
  const found = new Map<string, string[]>()
  let current: string | null = null
  for (const line of lines) {
    if (line.startsWith('## ')) {
      current = line.slice(3).trim()
      found.set(current, [])
      continue
    }
    if (line.startsWith('# ')) { current = null; continue }
    if (current) found.get(current)?.push(line)
  }
  const profile = emptyProfile()
  for (const name of PROFILE_SECTIONS) {
    const body = found.get(name)
    if (!body) throw new Error(`the profile is missing the section ${name}`)
    profile[name] = body.join(LF).trim()
  }
  return profile
}