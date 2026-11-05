import { describe, expect, it, vi } from "vitest";
import { requestTransitResponse } from "./chat-client";
import { respond, type Context } from "./engine";

describe("Transit chat preview resilience", () => {
  it("uses a successful server result and does not invoke the fallback", async () => {
    const ctx: Context = {};
    const serverReply = respond("Koyambedu to Guindy", ctx);
    const send = vi.fn(async () => serverReply);

    const result = await requestTransitResponse("Koyambedu to Guindy", ctx, send);

    expect(result.transport).toBe("server");
    expect(result.reply).toBe(serverReply);
    expect(send).toHaveBeenCalledWith("Koyambedu to Guindy", ctx);
  });

  it("answers with the bundled planner if the server function is unavailable", async () => {
    const ctx: Context = {};
    const send = vi.fn(async () => {
      throw new Error("Server functions are unavailable in this applet preview");
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const result = await requestTransitResponse("Koyambedu to Guindy", ctx, send);

      expect(result.transport).toBe("local");
      expect(result.reply.context.origin).toBe("Koyambedu");
      expect(result.reply.context.destination).toBe("Guindy");
      expect(result.reply.cards.length).toBeGreaterThan(0);
    } finally {
      warning.mockRestore();
    }
  });

  it("preserves conversation context during offline follow-up questions", async () => {
    const send = async () => {
      throw new Error("HTTP 404");
    };
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const first = await requestTransitResponse("Guindy to Chennai Beach", {}, send);
      const second = await requestTransitResponse(
        "Is there a bus route?",
        first.reply.context,
        send,
      );
      expect(first.transport).toBe("local");
      expect(second.transport).toBe("local");
      expect(second.reply.context.origin).toBe("Guindy");
      expect(second.reply.context.destination).toBe("Chennai Beach");
      if (second.reply.status === "NO_MATCH_IN_DATASET") {
        expect(second.reply.cards).toHaveLength(0);
      }
    } finally {
      warning.mockRestore();
    }
  });
});
