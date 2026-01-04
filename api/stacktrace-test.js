// api/stacktrace-test.js
export default async function handler(req, res) {
  throw new Error("STACKTRACE_TEST");
}
