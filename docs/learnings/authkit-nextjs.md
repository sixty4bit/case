# AuthKit Next.js Learnings

Tactical knowledge from completed tasks. Read by agents before working in this repo.

<!-- Retrospective agent appends entries below. Do not edit existing entries. -->

## Server actions must not call redirect() to external URLs (issue #385)

**Problem**: Calling Next.js `redirect()` inside a server action (e.g., `getAuthAction`, `refreshAuthAction`) to an external URL (like WorkOS authorization endpoints) causes CORS errors. Server actions execute via `fetch` — the browser follows the HTTP redirect cross-origin, and the external server doesn't have CORS headers for the caller's origin.

**Pattern**: When a server action needs to redirect the user to an external URL, return the URL in the response instead. Let the client redirect via `window.location.href`.

```ts
// BAD — causes CORS errors from server actions
redirect(signInUrl);

// GOOD — return URL, client redirects
return { ...result, signInUrl };
// then in the client component:
window.location.href = auth.signInUrl;
```

## window.location.href redirects are async — guard against effect retriggering

**Problem**: Setting `window.location.href` does not immediately stop JavaScript execution. If the redirect is in a `try` block with a `finally` that calls `setLoading(false)`, the state update runs before navigation completes, which can retrigger a `useEffect` dependency and create an infinite loop.

**Pattern**: Use a ref guard (e.g., `redirectingRef`) set to `true` before the redirect. Check the ref at the top of the callback to bail out if a redirect is already in progress.

```tsx
const redirectingRef = useRef(false);

const getAuth = useCallback(async () => {
  if (redirectingRef.current) return;
  // ...
  if (auth.signInUrl) {
    redirectingRef.current = true;
    window.location.href = auth.signInUrl;
    return; // skip setLoading(false) in finally
  }
}, []);
```

## Next.js 16 example app uses proxy.ts, not middleware.ts

The example app at `example/` uses `proxy.ts` (Next.js 16's proxy-based middleware) instead of `middleware.ts`. When adding test routes or modifying middleware matchers for verification, update `proxy.ts`, not `middleware.ts`.
