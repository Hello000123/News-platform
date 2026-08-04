import Link from "next/link";

import { EditorialPublicFooter, EditorialPublicHeader } from "@/components/news/editorial-public-chrome";

export default function NewsNotFound() {
  return (
    <div className="news-v1-article-page">
      <EditorialPublicHeader />
      <main className="news-v1-article-main" id="news-v1-main">
        <section className="news-v1-page-shell news-v1-article-not-found" aria-labelledby="not-found-heading">
          <p>APPROVED NEWSROOM</p>
          <h1 id="not-found-heading">找不到這篇報道</h1>
          <p>這篇文章可能尚未公開，或已不再提供。你可以回到已核准報道查看最新內容。</p>
          <Link href="/">返回所有已核准報道 <span aria-hidden="true">→</span></Link>
        </section>
      </main>
      <EditorialPublicFooter />
    </div>
  );
}
