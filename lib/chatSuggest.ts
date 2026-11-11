// Chat autocomplete: slash commands and player names. Pure, so it is unit tested.

export const CHAT_COMMANDS = [
  { name: 'tip', args: 'Name Betrag', description: 'Einem Freund NVC schenken', takesName: true },
  { name: 'profil', args: 'Name', description: 'Profil eines Spielers öffnen', takesName: true },
  { name: 'clear', args: '', description: 'Chatverlauf bei dir ausblenden', takesName: false },
] as const;

export type Suggestion = { key: string; label: string; hint: string; text: string };

const MAX = 6;
const starts = (value: string, prefix: string) => value.toLowerCase().startsWith(prefix.toLowerCase());

/** Suggestions for the current input; `text` of each is the full input after picking it. */
export function suggest(input: string, names: string[]): Suggestion[] {
  const command = /^\/(\w*)$/.exec(input);
  if (command) {
    return CHAT_COMMANDS.filter((c) => starts(c.name, command[1])).map((c) => ({
      key: c.name,
      label: `/${c.name}${c.args && ` ${c.args}`}`,
      hint: c.description,
      text: `/${c.name}${c.args ? ' ' : ''}`,
    }));
  }

  const commandName = /^\/(\w+)\s+(\S*)$/.exec(input);
  if (commandName && CHAT_COMMANDS.some((c) => c.takesName && c.name === commandName[1].toLowerCase())) {
    return names
      .filter((n) => starts(n, commandName[2]))
      .slice(0, MAX)
      .map((n) => ({ key: n, label: n, hint: '', text: `/${commandName[1]} ${n} ` }));
  }

  const mention = /(^|\s)@(\w*)$/.exec(input);
  if (mention) {
    const before = input.slice(0, input.length - mention[2].length - 1);
    return names
      .filter((n) => starts(n, mention[2]))
      .slice(0, MAX)
      .map((n) => ({ key: n, label: `@${n}`, hint: '', text: `${before}@${n} ` }));
  }
  return [];
}
