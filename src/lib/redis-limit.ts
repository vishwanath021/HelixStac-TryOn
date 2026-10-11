import net from "node:net";
import tls from "node:tls";

const SCRIPT = "local n = redis.call('INCR', KEYS[1]) if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end return n";

function encode(parts: string[]) {
  return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`;
}

function readReply(buffer: Buffer): number {
  const text = buffer.toString("utf8");
  const line = text.split("\r\n").find((row) => row.startsWith(":"));
  if (!line) throw new Error("Redis reply was not an integer");
  return Number(line.slice(1));
}

/** One INCR with a TTL. Used only when REDIS_URL is set. */
export function redisIncrement(key: string, ttlMs: number): Promise<number> {
  const raw = process.env.REDIS_URL || "";
  const url = new URL(raw);
  const secure = url.protocol === "rediss:";
  const port = Number(url.port || (secure ? 6380 : 6379));
  const host = url.hostname;
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });
    const chunks: Buffer[] = [];
    const fail = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(1500, () => fail(new Error("Redis timed out")));
    socket.on("error", fail);
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("connect", () => {
      const commands: string[] = [];
      if (url.password) commands.push(encode(["AUTH", decodeURIComponent(url.password)]));
      commands.push(encode(["EVAL", SCRIPT, "1", key, String(ttlMs)]));
      socket.end(commands.join(""));
    });
    socket.on("end", () => {
      try {
        resolve(readReply(Buffer.concat(chunks)));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Redis reply failed"));
      }
    });
  });
}
