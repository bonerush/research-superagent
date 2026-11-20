/** Opens the research database beside the orchestrator's and closes it on shutdown. */
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { ResearchRepo, createResearchSchema } from './store-research.ts'

/** The open research store and the way to close it. */
export interface ResearchRuntime {
  repo: ResearchRepo
  close(): void
}

/**
 * A separate file, not the ticket store: the research domain replaces that schema rather than extending it, and the
 * two must be able to move on different schedules while the old one is still being removed.
 */
export function openResearch(stateDir: string): ResearchRuntime {
  const db = new DatabaseSync(join(stateDir, 'research.sqlite'))
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL')
  createResearchSchema(db)
  return { repo: new ResearchRepo(db), close: () => db.close() }
}