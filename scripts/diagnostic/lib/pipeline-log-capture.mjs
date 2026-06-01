/**
 * Tee process stdout/stderr during a pipeline run into an in-memory buffer.
 * Restores original stream writers on stop().
 */

/**
 * @returns {{ stop: () => void, getText: () => string }}
 */
export function startPipelineLogCapture() {
  const parts = [];
  const { stdout, stderr } = process;
  const origStdoutWrite = stdout.write.bind(stdout);
  const origStderrWrite = stderr.write.bind(stderr);

  /**
   * @param {typeof origStdoutWrite} origWrite
   */
  function teeWrite(origWrite) {
    return function patchedWrite(chunk, encoding, callback) {
      let enc = encoding;
      let cb = callback;
      if (typeof enc === "function") {
        cb = enc;
        enc = undefined;
      }

      if (chunk != null && chunk !== "") {
        const text =
          typeof chunk === "string"
            ? chunk
            : Buffer.isBuffer(chunk)
              ? chunk.toString(typeof enc === "string" ? enc : "utf8")
              : String(chunk);
        if (text) parts.push(text);
      }

      return origWrite(chunk, enc, cb);
    };
  }

  stdout.write = teeWrite(origStdoutWrite);
  stderr.write = teeWrite(origStderrWrite);

  return {
    stop() {
      stdout.write = origStdoutWrite;
      stderr.write = origStderrWrite;
    },
    getText() {
      return parts.join("");
    },
  };
}
