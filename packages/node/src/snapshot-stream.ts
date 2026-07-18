export type SnapshotStreamEvent =
  | { type: "heartbeat" }
  | { reason?: string; type: "snapshot.invalidate"; version?: string }
  | { type: "snapshot.ready"; version?: string }
  | { reason?: string; type: "stream.close" };

interface ParsedServerSentEvent {
  data: string;
  event: string;
  id?: string;
}

export async function consumeSnapshotStream(
  response: Response,
  onEvent: (event: SnapshotStreamEvent) => void | Promise<void>,
): Promise<void> {
  if (!response.body) {
    throw new Error("FeatureGate snapshot stream response did not include a body.");
  }

  const decoder = new TextDecoder();
  const parser = new ServerSentEventParser();
  const reader = response.body.getReader();

  try {
    while (true) {
      const result = await reader.read();

      if (result.done) {
        break;
      }

      await emitEvents(parser.push(decoder.decode(result.value, { stream: true })), onEvent);
    }

    await emitEvents(parser.finish(decoder.decode()), onEvent);
  } finally {
    reader.releaseLock();
  }
}

async function emitEvents(
  events: readonly ParsedServerSentEvent[],
  onEvent: (event: SnapshotStreamEvent) => void | Promise<void>,
): Promise<void> {
  for (const event of events) {
    const streamEvent = toSnapshotStreamEvent(event);

    if (streamEvent) {
      await onEvent(streamEvent);
    }
  }
}

class ServerSentEventParser {
  #data: string[] = [];
  #event = "message";
  #id: string | undefined;
  #lineBuffer = "";

  push(chunk: string): ParsedServerSentEvent[] {
    this.#lineBuffer += chunk;

    return this.#drainLines();
  }

  finish(chunk: string): ParsedServerSentEvent[] {
    this.#lineBuffer += chunk;
    const events = this.#drainLines(true);

    if (this.#lineBuffer.length > 0) {
      this.#processLine(this.#lineBuffer);
      this.#lineBuffer = "";
    }

    const finalEvent = this.#flush();

    return finalEvent ? [...events, finalEvent] : events;
  }

  #drainLines(final = false): ParsedServerSentEvent[] {
    const events: ParsedServerSentEvent[] = [];

    while (true) {
      const lineEnd = this.#findLineEnd(final);

      if (!lineEnd) {
        break;
      }

      const line = this.#lineBuffer.slice(0, lineEnd.index);
      this.#lineBuffer = this.#lineBuffer.slice(lineEnd.nextIndex);
      const event = this.#processLine(line);

      if (event) {
        events.push(event);
      }
    }

    return events;
  }

  #findLineEnd(final: boolean): { index: number; nextIndex: number } | undefined {
    const index = this.#lineBuffer.search(/[\r\n]/);

    if (index === -1) {
      return undefined;
    }

    // A carriage return at the end of a network chunk may be the first half of CRLF. Wait for the
    // next chunk so its line feed is consumed as part of the same delimiter rather than as a blank
    // line that prematurely dispatches the pending event.
    if (!final && this.#lineBuffer[index] === "\r" && index === this.#lineBuffer.length - 1) {
      return undefined;
    }

    return {
      index,
      nextIndex:
        this.#lineBuffer[index] === "\r" && this.#lineBuffer[index + 1] === "\n"
          ? index + 2
          : index + 1,
    };
  }

  #processLine(line: string): ParsedServerSentEvent | undefined {
    if (line === "") {
      return this.#flush();
    }

    if (line.startsWith(":")) {
      return undefined;
    }

    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    const rawValue = separator === -1 ? "" : line.slice(separator + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

    if (field === "data") {
      this.#data.push(value);
    } else if (field === "event") {
      this.#event = value;
    } else if (field === "id" && !value.includes("\0")) {
      this.#id = value;
    }

    return undefined;
  }

  #flush(): ParsedServerSentEvent | undefined {
    if (this.#data.length === 0) {
      this.#event = "message";
      return undefined;
    }

    const event = {
      data: this.#data.join("\n"),
      event: this.#event,
      ...(this.#id === undefined ? {} : { id: this.#id }),
    };
    this.#data = [];
    this.#event = "message";

    return event;
  }
}

function toSnapshotStreamEvent(event: ParsedServerSentEvent): SnapshotStreamEvent | undefined {
  const payload = readPayload(event.data);

  if (event.event === "heartbeat") {
    return { type: "heartbeat" };
  }

  if (event.event === "snapshot.ready") {
    return {
      type: "snapshot.ready",
      ...optionalString("version", readString(payload, "version") ?? event.id),
    };
  }

  if (event.event === "snapshot.invalidate") {
    return {
      type: "snapshot.invalidate",
      ...optionalString("reason", readString(payload, "reason")),
      ...optionalString("version", readString(payload, "version") ?? event.id),
    };
  }

  if (event.event === "stream.close") {
    return {
      type: "stream.close",
      ...optionalString("reason", readString(payload, "reason")),
    };
  }

  return undefined;
}

function readPayload(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function readString(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = (value as Record<string, unknown>)[key];

  return typeof candidate === "string" ? candidate : undefined;
}

function optionalString<TKey extends string>(
  key: TKey,
  value: string | undefined,
): { [K in TKey]?: string } {
  return value === undefined ? {} : ({ [key]: value } as { [K in TKey]?: string });
}
