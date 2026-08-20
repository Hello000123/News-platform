import { resolve4, resolve6 } from "node:dns/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchPublicContent } from "@/lib/server/sources/source-context";

vi.mock("node:dns/promises", () => ({
  resolve4: vi.fn(),
  resolve6: vi.fn(),
}));

const resolve4Mock = vi.mocked(resolve4);
const resolve6Mock = vi.mocked(resolve6);

function feedResponse() {
  return new Response("<?xml version=\"1.0\"?><rss version=\"2.0\"><channel /></rss>", {
    headers: { "Content-Type": "application/rss+xml" },
  });
}

describe("source context default DNS resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("combines public IPv4 and IPv6 answers before fetching", async () => {
    resolve4Mock.mockResolvedValue(["93.184.216.34"]);
    resolve6Mock.mockResolvedValue(["2606:2800:220:1:248:1893:25c8:1946"]);
    const fetchMock = vi.fn().mockResolvedValue(feedResponse());

    const result = await fetchPublicContent(
      "https://feeds.example/news.xml",
      { fetchImpl: fetchMock as unknown as typeof fetch },
      { allowXmlFeed: true },
    );

    expect(result.url).toBe("https://feeds.example/news.xml");
    expect(resolve4Mock).toHaveBeenCalledWith("feeds.example");
    expect(resolve6Mock).toHaveBeenCalledWith("feeds.example");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("ignores CNAME aliases that Workerd includes beside terminal IP answers", async () => {
    resolve4Mock.mockResolvedValue(["edge.example.net.", "93.184.216.34"]);
    resolve6Mock.mockResolvedValue(["edge.example.net."]);
    const fetchMock = vi.fn().mockResolvedValue(feedResponse());

    await expect(
      fetchPublicContent(
        "https://feeds.example/news.xml",
        { fetchImpl: fetchMock as unknown as typeof fetch },
        { allowXmlFeed: true },
      ),
    ).resolves.toMatchObject({ url: "https://feeds.example/news.xml" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("accepts an IPv6-only hostname when its A lookup has no data", async () => {
    resolve4Mock.mockRejectedValue(Object.assign(new Error("No A records"), { code: "ENODATA" }));
    resolve6Mock.mockResolvedValue(["2606:2800:220:1:248:1893:25c8:1946"]);
    const fetchMock = vi.fn().mockResolvedValue(feedResponse());

    await expect(
      fetchPublicContent(
        "https://ipv6.example/news.xml",
        { fetchImpl: fetchMock as unknown as typeof fetch },
        { allowXmlFeed: true },
      ),
    ).resolves.toMatchObject({ url: "https://ipv6.example/news.xml" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects the hostname when either address family contains a private answer", async () => {
    resolve4Mock.mockResolvedValue(["93.184.216.34"]);
    resolve6Mock.mockResolvedValue(["fd00::1"]);
    const fetchMock = vi.fn();

    await expect(
      fetchPublicContent(
        "https://mixed.example/news.xml",
        { fetchImpl: fetchMock as unknown as typeof fetch },
        { allowXmlFeed: true },
      ),
    ).rejects.toMatchObject({ code: "NON_PUBLIC_SOURCE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
