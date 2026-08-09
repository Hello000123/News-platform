import { describe, expect, it } from "vitest";

import { FeedParseError, parseFeedXml } from "@/lib/server/feeds/rss-parser";

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example News</title>
    <link>https://example.com/</link>
    <description>Example feed</description>
    <item>
      <title>First story</title>
      <link>https://example.com/first</link>
      <description>First &amp; description</description>
      <author>Jane Doe</author>
      <pubDate>Tue, 02 Jun 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Second story</title>
      <link>https://example.com/second</link>
      <description><![CDATA[<p>Contains <b>HTML</b> markup</p>]]></description>
      <dc:creator>Sam</dc:creator>
      <pubDate>Invalid date here</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <title>Atom Feed</title>
  <author><name>Atom Author</name></author>
  <entry>
    <title>Atom entry one</title>
    <link href="https://atom.example/one" />
    <summary>Summary one</summary>
    <published>2026-06-02T10:00:00Z</published>
  </entry>
  <entry>
    <title>Atom entry two</title>
    <link rel="alternate" type="text/html" href="https://atom.example/two" />
    <content type="xhtml">Content two</content>
    <updated>2026-06-03T10:00:00Z</updated>
  </entry>
</feed>`;

describe("RSS/Atom feed parser", () => {
  it("parses RSS 2.0 items with entities, CDATA, and dates", () => {
    const items = parseFeedXml(RSS_XML);
    expect(items).toHaveLength(2);

    expect(items[0]).toEqual({
      title: "First story",
      url: "https://example.com/first",
      description: "First & description",
      author: "Jane Doe",
      pubDate: 1_780_394_400,
    });

    expect(items[1].title).toBe("Second story");
    expect(items[1].description).toBe("Contains HTML markup");
    expect(items[1].author).toBe("Sam");
    expect(items[1].pubDate).toBeNull();
  });

  it("parses Atom entries using href links, summaries, and published dates", () => {
    const items = parseFeedXml(ATOM_XML);
    expect(items).toHaveLength(2);

    expect(items[0]).toEqual({
      title: "Atom entry one",
      url: "https://atom.example/one",
      description: "Summary one",
      author: "Atom Author",
      pubDate: 1_780_394_400,
    });

    expect(items[1].url).toBe("https://atom.example/two");
    expect(items[1].description).toBe("Content two");
  });

  it("falls back to a non-alternate Atom link when no alternate link exists", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
      <title>Atom Feed</title>
      <entry>
        <title>Self-linked entry</title>
        <link rel="self" href="https://atom.example/self-linked" />
      </entry>
    </feed>`;
    expect(parseFeedXml(xml)).toEqual([
      expect.objectContaining({
        title: "Self-linked entry",
        url: "https://atom.example/self-linked",
      }),
    ]);
  });

  it("ignores items without a resolvable title or link", () => {
    const xml = `<rss version="2.0"><channel><title>T</title>
      <item><title>No link</title><link></link></item>
      <item><title></title><link>https://example.com/x</link></item>
      <item><title>Valid</title><link>https://example.com/valid</link></item>
    </channel></rss>`;
    const items = parseFeedXml(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Valid");
  });

  it("handles nested comments and CDATA safely", () => {
    const xml = `<rss version="2.0"><channel><title>T</title>
      <!-- comment with <b> tags </b> -->
      <item><title>A &amp; B</title><link>https://example.com/ab</link></item>
    </channel></rss>`;
    const items = parseFeedXml(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("A & B");
  });

  it("rejects unrecognised feed formats", () => {
    expect(() => parseFeedXml("<html><body>not a feed</body></html>")).toThrow(
      FeedParseError,
    );
  });
});
