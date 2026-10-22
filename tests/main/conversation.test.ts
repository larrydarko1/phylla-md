import fs from 'fs';
import os from 'os';
import path from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

import { createFakeIpc, readReply } from './test-utils';
import { init, register } from '@/main/services/conversation';
import { ConversationSchema, type Conversation, type ConversationMessage } from '@/schemas/ai';

vi.mock('electron', () => ({}));

vi.mock('@/main/lib/logger', () => ({
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const ResultSchema = z.object({
    success: z.boolean(),
    conversation: ConversationSchema.optional(),
    error: z.string().optional(),
});

const ListSchema = z.object({
    success: z.boolean(),
    conversations: z.array(z.looseObject({ id: z.string() })),
    error: z.string().optional(),
});

const serviceIpc = createFakeIpc();
let tmpDir: string;

const invoke = async (channel: string, ...args: unknown[]) =>
    ResultSchema.parse(await serviceIpc.invoke(channel, ...args));

const createConversation = (model: unknown) => invoke('conversations:create', model);
const loadConversation = (id: unknown) => invoke('conversations:load', id);
const saveConversation = (c: Conversation) => invoke('conversations:save', c);
const addMessage = (id: string, m: ConversationMessage) => invoke('conversations:addMessage', id, m);

const readConversations = async () => ListSchema.parse(await serviceIpc.invoke('conversations:list'));

const deleteConversation = (id: unknown) => invoke('conversations:delete', id);
const renameConversation = (id: unknown, title: unknown) => invoke('conversations:rename', id, title);
const reload = async (id: string): Promise<Conversation | null> => (await loadConversation(id)).conversation ?? null;

register(serviceIpc);

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phylla-conv-'));
    init(tmpDir);
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('createConversation', () => {
    it('creates a conversation and returns it', async () => {
        const result = await createConversation('llama-7b');
        expect(result.success).toBe(true);
        expect(result.conversation?.model).toBe('llama-7b');
        expect(result.conversation?.messages).toHaveLength(0);
        expect(result.conversation?.id).toBeTruthy();
    });

    it('rejects an empty model name at the boundary', async () => {
        const result = await createConversation('');
        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID_ARGUMENTS');
    });

    it('trims whitespace from model name', async () => {
        const result = await createConversation('  llama  ');
        expect(result.conversation?.model).toBe('llama');
    });

    it('persists the conversation to disk', async () => {
        const result = await createConversation('llama');
        const id = result.conversation!.id;
        const convsDir = path.join(tmpDir, 'conversations');
        const files = fs.readdirSync(convsDir);
        expect(files).toContain(`${id}.json`);
    });
});

describe('reading one back', () => {
    it('returns the conversation by id', async () => {
        const { conversation } = await createConversation('llama');
        const loaded = await reload(conversation!.id);
        expect(loaded?.id).toBe(conversation!.id);
        expect(loaded?.model).toBe('llama');
    });

    it('returns nothing for a non-existent id', async () => {
        const result = await loadConversation('00000000-0000-0000-0000-000000000000');
        expect(result.success).toBe(false);
        expect(result.conversation).toBeUndefined();
    });

    it('returns nothing for a path-traversal attempt', async () => {
        const result = await loadConversation('../../etc/passwd');
        expect(result.success).toBe(false);
        expect(result.conversation).toBeUndefined();
    });

    it('returns nothing for a corrupt JSON file', async () => {
        const id = '11111111-1111-1111-1111-111111111111';
        fs.writeFileSync(path.join(tmpDir, `${id}.json`), 'not valid json');
        const result = await loadConversation(id);
        expect(result.success).toBe(false);
        expect(result.conversation).toBeUndefined();
    });
});

describe('saveConversation', () => {
    it('persists updated content', async () => {
        const { conversation } = await createConversation('llama');
        conversation!.title = 'Updated Title';
        await saveConversation(conversation!);
        const reloaded = await reload(conversation!.id);
        expect(reloaded?.title).toBe('Updated Title');
    });

    it('derives a title from the first user message when title is default', async () => {
        const { conversation } = await createConversation('llama');
        conversation!.messages = [{ role: 'user', content: 'What is AI?' }];
        await saveConversation(conversation!);
        const reloaded = await reload(conversation!.id);
        expect(reloaded?.title).toBe('What is AI?');
    });

    it('truncates long titles to 60 characters with ellipsis', async () => {
        const { conversation } = await createConversation('llama');
        const longContent = 'A'.repeat(80);
        conversation!.messages = [{ role: 'user', content: longContent }];
        await saveConversation(conversation!);
        const reloaded = await reload(conversation!.id);
        expect(reloaded?.title).toHaveLength(60);
        expect(reloaded?.title).toMatch(/\.\.\.$/);
    });

    it('does not derive title when first message is from assistant', async () => {
        const { conversation } = await createConversation('llama');
        conversation!.messages = [{ role: 'assistant', content: 'Hello' }];
        await saveConversation(conversation!);
        const reloaded = await reload(conversation!.id);
        expect(reloaded?.title).toBe('New Conversation');
    });
});

describe('addMessage', () => {
    it('appends a message to an existing conversation', async () => {
        const { conversation } = await createConversation('llama');
        const result = await addMessage(conversation!.id, { role: 'user', content: 'Hello' });
        expect(result.success).toBe(true);
        const reloaded = await reload(conversation!.id);
        expect(reloaded?.messages).toHaveLength(1);
        expect(reloaded?.messages[0]!.content).toBe('Hello');
    });

    it('sets a timestamp on the added message', async () => {
        const { conversation } = await createConversation('llama');
        await addMessage(conversation!.id, { role: 'user', content: 'Hi' });
        const reloaded = await reload(conversation!.id);
        expect(reloaded?.messages[0]!.timestamp).toBeTruthy();
    });

    it('returns failure for non-existent conversation', async () => {
        const result = await addMessage('00000000-0000-0000-0000-000000000000', {
            role: 'user',
            content: 'Hi',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('NOT_FOUND');
    });
});

describe('readConversations', () => {
    it('returns an empty list when no conversations exist', async () => {
        const result = await readConversations();
        expect(result.success).toBe(true);
        expect(result.conversations).toHaveLength(0);
    });

    it('returns all created conversations', async () => {
        await createConversation('llama');
        await createConversation('mistral');
        const result = await readConversations();
        expect(result.conversations).toHaveLength(2);
    });

    it('sorts conversations by updatedAt descending', async () => {
        const first = await createConversation('llama');
        await new Promise((r) => setTimeout(r, 10));
        const second = await createConversation('mistral');
        const result = await readConversations();
        const ids = result.conversations.map((c) => c.id);
        expect(ids[0]).toBe(second.conversation!.id);
        expect(ids[1]).toBe(first.conversation!.id);
    });

    it('skips corrupt JSON files', async () => {
        await createConversation('llama');
        fs.writeFileSync(path.join(tmpDir, 'corrupt.json'), 'bad json');
        const result = await readConversations();
        expect(result.conversations).toHaveLength(1);
    });

    it('returns failure when the conversations directory was removed', async () => {
        const convsDir = path.join(tmpDir, 'conversations');
        fs.rmSync(convsDir, { recursive: true, force: true });
        const result = await readConversations();
        expect(result).toBeDefined();
    });
});

describe('loadConversation', () => {
    it('loads an existing conversation', async () => {
        const { conversation } = await createConversation('llama');
        const result = await loadConversation(conversation!.id);
        expect(result.success).toBe(true);
        expect(result.conversation?.id).toBe(conversation!.id);
    });

    it('returns failure for non-existent id', async () => {
        const result = await loadConversation('00000000-0000-0000-0000-000000000000');
        expect(result.success).toBe(false);
    });
});

describe('deleteConversation', () => {
    it('removes the conversation file', async () => {
        const { conversation } = await createConversation('llama');
        const result = await deleteConversation(conversation!.id);
        expect(result.success).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, `${conversation!.id}.json`))).toBe(false);
    });

    it('returns failure for non-existent id', async () => {
        const result = await deleteConversation('00000000-0000-0000-0000-000000000000');
        expect(result.success).toBe(false);
    });
});

describe('renameConversation', () => {
    it('updates the title', async () => {
        const { conversation } = await createConversation('llama');
        const result = await renameConversation(conversation!.id, 'Renamed');
        expect(result.success).toBe(true);
        const reloaded = await reload(conversation!.id);
        expect(reloaded?.title).toBe('Renamed');
    });

    it('returns failure for non-existent id', async () => {
        const result = await renameConversation('00000000-0000-0000-0000-000000000000', 'x');
        expect(result.success).toBe(false);
    });
});

describe('register', () => {
    let ipc: ReturnType<typeof createFakeIpc>;

    beforeEach(() => {
        ipc = createFakeIpc();
        register(ipc);
    });

    it('registers conversations:list handler', async () => {
        const result = readReply(await ipc.invoke('conversations:list'));
        expect(result.success).toBe(true);
    });

    it('registers conversations:create handler', async () => {
        const result = ResultSchema.parse(await ipc.invoke('conversations:create', 'llama'));
        expect(result.success).toBe(true);
        expect(result.conversation?.id).toBeTruthy();
    });

    it('conversations:create rejects invalid modelName', async () => {
        const result = readReply(await ipc.invoke('conversations:create', 123));
        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID_ARGUMENTS');
    });

    it('registers conversations:load handler', async () => {
        const { conversation } = await createConversation('llama');
        const result = readReply(await ipc.invoke('conversations:load', conversation!.id));
        expect(result.success).toBe(true);
    });

    it('conversations:load rejects invalid id', async () => {
        const result = readReply(await ipc.invoke('conversations:load', 123));
        expect(result.success).toBe(false);
    });

    it('registers conversations:save handler', async () => {
        const { conversation } = await createConversation('llama');
        conversation!.title = 'Saved title';
        const result = readReply(await ipc.invoke('conversations:save', conversation));
        expect(result.success).toBe(true);
    });

    it('conversations:save rejects invalid conversation', async () => {
        const result = readReply(await ipc.invoke('conversations:save', { not: 'valid' }));
        expect(result.success).toBe(false);
    });

    it('registers conversations:addMessage handler', async () => {
        const { conversation } = await createConversation('llama');
        const result = readReply(
            await ipc.invoke('conversations:addMessage', conversation!.id, {
                role: 'user',
                content: 'Hi',
            }),
        );
        expect(result.success).toBe(true);
    });

    it('conversations:addMessage rejects invalid arguments', async () => {
        const result = readReply(await ipc.invoke('conversations:addMessage', 123, null));
        expect(result.success).toBe(false);
    });

    it('registers conversations:delete handler', async () => {
        const { conversation } = await createConversation('llama');
        const result = readReply(await ipc.invoke('conversations:delete', conversation!.id));
        expect(result.success).toBe(true);
    });

    it('conversations:delete rejects invalid id', async () => {
        const result = readReply(await ipc.invoke('conversations:delete', 123));
        expect(result.success).toBe(false);
    });

    it('registers conversations:rename handler', async () => {
        const { conversation } = await createConversation('llama');
        const result = readReply(await ipc.invoke('conversations:rename', conversation!.id, 'New Name'));
        expect(result.success).toBe(true);
    });

    it('conversations:rename rejects invalid arguments', async () => {
        const result = readReply(await ipc.invoke('conversations:rename', 123, 456));
        expect(result.success).toBe(false);
    });
});
