/**
 * Shared owner of ~/.phylla/state.json.
 *
 * Three services (systemPrompt, theme, language) each persist a single key
 * into the same state file. Left to themselves they each did an independent
 * read-whole-file → merge one key → write-whole-file, with no lock and a
 * non-atomic write — so a `theme:setActive` overlapping a `systemPrompt`
 * seed-write could drop one change or leave a half-written, unparseable file.
 *
 * This module serialises every access through a single promise chain (an
 * async mutex) and writes atomically via a temp file + rename, so concurrent
 * callers can't interleave or corrupt the file. Each service still validates
 * the raw object against its own Zod schema; the `.catchall()` on those
 * schemas means unknown keys (other services' values) survive round-trips.
 */

import fs from 'fs/promises';

import { PHYLLA_HOME, STATE_FILE } from '@/main/lib/paths';
import { JsonObjectSchema } from '@/schemas/json';

type State = Record<string, unknown>;

let queue: Promise<unknown> = Promise.resolve();

/** Read the full raw state object, serialised against concurrent writes. */
export function readState(): Promise<State> {
    return enqueue(readRaw);
}

/**
 * Atomically read-modify-write the shared state under the lock. `mutate`
 * receives the current state and returns the next one; returning the same
 * object unchanged is fine (it just rewrites identical content).
 */
export function updateState(mutate: (current: State) => State): Promise<void> {
    return enqueue(async (): Promise<void> => {
        const current = await readRaw();
        const next = mutate(current);
        await writeRaw(next);
    });
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.then(
        (): undefined => undefined,
        (): undefined => undefined,
    );
    return run;
}

async function readRaw(): Promise<State> {
    try {
        const raw = await fs.readFile(STATE_FILE, 'utf-8');
        const parsed = JsonObjectSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : {};
    } catch {
        return {};
    }
}

async function writeRaw(state: State): Promise<void> {
    await fs.mkdir(PHYLLA_HOME, { recursive: true });
    const tmp = `${STATE_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf-8');
    await fs.rename(tmp, STATE_FILE);
}
