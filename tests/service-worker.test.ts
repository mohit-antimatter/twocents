import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

type FetchEvent = {
  request: { method: string; url: string };
  respondWith: (response: Promise<Response>) => void;
  waitUntil: (work: Promise<unknown>) => void;
};

test("the service worker never intercepts authenticated pages", () => {
  let fetchHandler: ((event: FetchEvent) => void) | undefined;
  const context = {
    URL,
    Response,
    fetch: async () => new Response("asset"),
    caches: {
      keys: async () => [],
      delete: async () => true,
      match: async () => undefined,
      open: async () => ({ put: async () => undefined }),
    },
    self: {
      location: { origin: "https://twocents.test" },
      skipWaiting: () => undefined,
      clients: { claim: async () => undefined },
      addEventListener: (type: string, handler: (event: FetchEvent) => void) => {
        if (type === "fetch") fetchHandler = handler;
      },
    },
  };

  const source = fs.readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8");
  vm.runInNewContext(source, context);
  assert.ok(fetchHandler);

  function isIntercepted(url: string) {
    let intercepted = false;
    fetchHandler?.({
      request: { method: "GET", url },
      respondWith: () => {
        intercepted = true;
      },
      waitUntil: () => undefined,
    });
    return intercepted;
  }

  assert.equal(isIntercepted("https://twocents.test/"), false);
  assert.equal(isIntercepted("https://twocents.test/insights?_rsc=private"), false);
  assert.equal(isIntercepted("https://twocents.test/settings"), false);
  assert.equal(isIntercepted("https://twocents.test/api/capture"), false);
  assert.equal(isIntercepted("https://other.test/_next/static/chunk.js"), false);

  assert.equal(isIntercepted("https://twocents.test/_next/static/chunk.js"), true);
  assert.equal(isIntercepted("https://twocents.test/icon-192.png"), true);
  assert.equal(isIntercepted("https://twocents.test/manifest.webmanifest"), true);
});
