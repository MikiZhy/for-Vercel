const ORIGIN = "https://test.caxlotus.com";
const PROXY_KEY = "caxl-22ae6dfd7828441661ccb5445236fa4b";

function legacySiteFromPath(pathname) {
  const path = String(pathname || "").toLowerCase();
  if (path.includes("/fofa/bbs/")) return 1;
  if (path.includes("/fofa/bkqj/")) return 2;
  if (path.includes("/fofa/xlbk/")) return 3;
  if (/\/forum\.php$/i.test(path)) return 1;
  return 0;
}

function spaRedirect(requestUrl) {
  const url = new URL(requestUrl);
  const path = url.pathname.toLowerCase();

  if (
    path === "/portal.php" ||
    /\/fofa\/bbs\/portal\.php$/i.test(path)
  ) {
    return url.origin + "/#/";
  }

  const site = legacySiteFromPath(url.pathname);
  const isForum = /\/forum\.php$/i.test(url.pathname);

  if (isForum && site) {
    const mod = url.searchParams.get("mod");
    const fid = url.searchParams.get("fid");
    const tid = url.searchParams.get("tid");

    if (
      mod === "forumdisplay" &&
      fid && /^\d+$/.test(fid)
    ) {
      return url.origin + `/#/${site}/f/${fid}`;
    }

    if (tid && /^\d+$/.test(tid)) {
      return url.origin + `/#/${site}/${tid}`;
    }

    return url.origin + `/#/${site}`;
  }

  const seoMatch =
    url.pathname.match(/\/thread-(\d+)-[^/]*\.html$/i);

  if (seoMatch && site) {
    return url.origin + `/#/${site}/${seoMatch[1]}`;
  }

  return "";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();

    // APP 安装目录：无斜杠时先规范到目录 URL，确保页面内相对资源路径正确。
    if (path === "/appxz" || path === "/caapp") {
      const normalized = new URL(url.toString());
      normalized.pathname = url.pathname + "/";
      return Response.redirect(normalized.toString(), 302);
    }

    const redirectTarget = spaRedirect(request.url);
    if (redirectTarget) {
      return Response.redirect(redirectTarget, 302);
    }

    const shouldProxy =
      url.pathname.startsWith("/api/") ||
      url.pathname === "/search-gate.php" ||
      url.pathname.startsWith("/fofa/") ||
      path === "/appxz/" ||
      path.startsWith("/appxz/") ||
      path === "/caapp/" ||
      path.startsWith("/caapp/");

    if (!shouldProxy) {
      return env.ASSETS.fetch(request);
    }

    let proxyPath = url.pathname;
    if (path === "/appxz/") proxyPath = "/appxz/index.html";
    if (path === "/caapp/") proxyPath = "/caapp/index.html";

    const target = new URL(
      proxyPath + url.search,
      ORIGIN
    );

    const headers = new Headers(request.headers);

    /*
     * 仅供 test.caxlotus.com 的 Cloudflare WAF
     * 识别这是来自我们 Pages Worker 的合法请求。
     */
    headers.set(
      "X-CAXL-Proxy-Key",
      PROXY_KEY
    );

    /*
     * 避免把 Pages 域名的 Host / Origin 直接带给源站。
     */
    headers.delete("host");

    const proxyRequest = new Request(
      target.toString(),
      {
        method: request.method,
        headers,
        body:
          request.method === "GET" ||
          request.method === "HEAD"
            ? undefined
            : request.body,
        redirect: "manual"
      }
    );

    const response =
      await fetch(proxyRequest);

    const responseHeaders =
      new Headers(response.headers);

    const location =
      responseHeaders.get("location");

    if (location) {
      try {
        const redirected =
          new URL(location, ORIGIN);

        if (
          redirected.origin ===
          new URL(ORIGIN).origin
        ) {
          redirected.protocol =
            url.protocol;

          redirected.host =
            url.host;

          responseHeaders.set(
            "location",
            redirected.toString()
          );
        }
      } catch {}
    }

    return new Response(
      response.body,
      {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      }
    );
  }
};
