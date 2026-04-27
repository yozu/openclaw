import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageCliHelpers } from "./helpers.js";
import { registerMessageSearchCommand } from "./register.permissions-search.js";

function createHelpers(runMessageAction: MessageCliHelpers["runMessageAction"]): MessageCliHelpers {
  return {
    withMessageBase: (command) => command.option("--channel <channel>", "Channel"),
    withMessageTarget: (command) => command.option("-t, --target <dest>", "Target"),
    withRequiredMessageTarget: (command) => command.requiredOption("-t, --target <dest>", "Target"),
    runMessageAction,
  };
}

describe("registerMessageSearchCommand", () => {
  const runMessageAction = vi.fn(
    async (_action: string, _opts: Record<string, unknown>) => undefined,
  );

  beforeEach(() => {
    runMessageAction.mockClear();
  });

  it("keeps Discord guild-id validation for message search", async () => {
    const message = new Command().exitOverride();
    registerMessageSearchCommand(message, createHelpers(runMessageAction));

    await expect(
      message.parseAsync(["search", "--channel", "discord", "--query", "hello"], {
        from: "user",
      }),
    ).rejects.toThrow("--guild-id <id> is required for Discord message search");
    expect(runMessageAction).not.toHaveBeenCalled();
  });

  it("passes Slack channel-name search scoping without guild-id", async () => {
    const message = new Command().exitOverride();
    registerMessageSearchCommand(message, createHelpers(runMessageAction));

    await message.parseAsync(
      ["search", "--channel", "slack", "--query", "hello", "--channel-name", "general"],
      { from: "user" },
    );

    expect(runMessageAction).toHaveBeenCalledWith(
      "search",
      expect.objectContaining({
        channel: "slack",
        query: "hello",
        channelName: "general",
      }),
    );
  });
});
