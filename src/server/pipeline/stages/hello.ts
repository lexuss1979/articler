import { z } from 'zod';
import type { Stage } from '../stage';

export const hello: Stage<Record<string, never>, { greeted: true }> = {
  name: 'hello',
  modelClass: 'fast',
  inputSchema: z.object({}),
  outputSchema: z.object({ greeted: z.literal(true) }),
  async run(_input, ctx) {
    await ctx.emit('agent_message', { text: 'Hi! Type anything to continue.' });
    const reply = await ctx.userInput('reply', z.object({ text: z.string() }));
    await ctx.emit('task_completed', reply);
    return { greeted: true };
  },
};
