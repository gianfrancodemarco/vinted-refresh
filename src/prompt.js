import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export function createPrompt() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  return {
    async ask(question) {
      const answer = await rl.question(question);
      return answer.trim();
    },
    async choose(title, choices) {
      console.log(`\n${title}`);
      for (let i = 0; i < choices.length; i++) {
        console.log(`  ${i + 1}) ${choices[i].label}`);
      }

      while (true) {
        const answer = await this.ask('\nChoice: ');
        const index = Number.parseInt(answer, 10);
        if (index >= 1 && index <= choices.length) {
          return choices[index - 1];
        }
        console.log(`Enter a number between 1 and ${choices.length}.`);
      }
    },
    close() {
      rl.close();
    },
  };
}

export function isInteractiveTerminal() {
  return Boolean(stdin.isTTY && stdout.isTTY);
}
