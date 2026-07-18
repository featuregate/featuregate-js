import { describe, expect, it } from "vitest";

import { consumeSnapshotStream, type SnapshotStreamEvent } from "./snapshot-stream";

describe("consumeSnapshotStream", () => {
  it("parses fragmented events, comments, multiline data, and CRLF endings", async () => {
    const events: SnapshotStreamEvent[] = [];
    const response = chunkedResponse([
      ": connected\r\n",
      "event: snapshot.ready\r\nid: snapshot-v1\r\ndata: {}\r\n\r\n",
      "event: snapshot.inval",
      'idate\ndata: {\ndata: "version":"snapshot-v2","reason":"flag_updated"}\n\n',
      "event: heartbeat\ndata: {}\n\n",
      "event: unknown\ndata: {}\n\n",
      'event: stream.close\ndata: {"reason":"max_duration"}',
    ]);

    await consumeSnapshotStream(response, (event) => {
      events.push(event);
    });

    expect(events).toEqual([
      { type: "snapshot.ready", version: "snapshot-v1" },
      {
        reason: "flag_updated",
        type: "snapshot.invalidate",
        version: "snapshot-v2",
      },
      { type: "heartbeat" },
      { reason: "max_duration", type: "stream.close" },
    ]);
  });

  it("uses event IDs when payload JSON is malformed", async () => {
    const events: SnapshotStreamEvent[] = [];

    await consumeSnapshotStream(
      chunkedResponse(["event: snapshot.invalidate\nid: snapshot-v3\ndata: not-json\n\n"]),
      (event) => {
        events.push(event);
      },
    );

    expect(events).toEqual([{ type: "snapshot.invalidate", version: "snapshot-v3" }]);
  });

  it("preserves an event when CRLF is split across chunks", async () => {
    const events: SnapshotStreamEvent[] = [];

    await consumeSnapshotStream(
      chunkedResponse([
        "event: snapshot.ready\r",
        "\nid: snapshot-v4\r",
        "\ndata: {}\r",
        "\n\r",
        "\n",
      ]),
      (event) => {
        events.push(event);
      },
    );

    expect(events).toEqual([{ type: "snapshot.ready", version: "snapshot-v4" }]);
  });

  it("rejects responses without a body", async () => {
    await expect(consumeSnapshotStream(new Response(null), () => undefined)).rejects.toThrow(
      "did not include a body",
    );
  });
});

function chunkedResponse(chunks: readonly string[]): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }

        controller.close();
      },
    }),
  );
}
