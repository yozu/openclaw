import type { Command } from "commander";
import { collectOption } from "../helpers.js";
import type { MessageCliHelpers } from "./helpers.js";

function isDiscordSearch(opts: Record<string, unknown>): boolean {
  return typeof opts.channel === "string" && opts.channel.trim().toLowerCase() === "discord";
}

export function registerMessagePermissionsCommand(message: Command, helpers: MessageCliHelpers) {
  helpers
    .withMessageBase(
      helpers.withRequiredMessageTarget(
        message.command("permissions").description("Fetch channel permissions"),
      ),
    )
    .action(async (opts) => {
      await helpers.runMessageAction("permissions", opts);
    });
}

export function registerMessageSearchCommand(message: Command, helpers: MessageCliHelpers) {
  helpers
    .withMessageBase(message.command("search").description("Search messages"))
    .option("--guild-id <id>", "Guild id (required for Discord)")
    .requiredOption("--query <text>", "Search query")
    .option("--channel-id <id>", "Channel id")
    .option("--channel-name <name>", "Slack channel name for search scoping")
    .option("--channel-ids <id>", "Channel id (repeat)", collectOption, [] as string[])
    .option("--author-id <id>", "Author id")
    .option("--author-ids <id>", "Author id (repeat)", collectOption, [] as string[])
    .option("--limit <n>", "Result limit")
    .option("--sort <type>", "Sort by (score, timestamp)")
    .option("--sort-dir <dir>", "Sort direction (asc, desc)")
    .action(async (opts) => {
      if (isDiscordSearch(opts) && (typeof opts.guildId !== "string" || !opts.guildId.trim())) {
        throw new Error("--guild-id <id> is required for Discord message search.");
      }
      await helpers.runMessageAction("search", opts);
    });
}
