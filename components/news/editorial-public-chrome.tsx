import Link from "next/link";

import { NEWS_CATEGORIES } from "@/lib/shared/news-categories";

interface EditorialPublicHeaderProps {
  issueDate?: string;
  issueLabel?: string;
}

export function EditorialPublicHeader({
  issueDate = "待更新",
  issueLabel = "ISSUE 01",
}: EditorialPublicHeaderProps) {
  const publicLinks = [
    { href: "/", label: "首頁" },
    ...NEWS_CATEGORIES.map(({ href, label }) => ({ href, label })),
    { href: "/#news-v1-latest", label: "最新短訊" },
  ];

  return (
    <header className="news-v1-site-header">
      <a className="news-v1-skip-link" href="#news-v1-main">跳至主要內容</a>
      <div className="news-v1-page-shell news-v1-prototype-strip">
        <p>PRESSREADY NEWSROOM</p>
        <nav aria-label="編輯工具捷徑">
          <Link href="/pipeline">發布工作台</Link>
          <Link href="/review">編輯工作區</Link>
        </nav>
      </div>

      <div className="news-v1-page-shell news-v1-masthead">
        <Link className="news-v1-brand-lockup" href="/" aria-label="PressReady 首頁">
          <p className="news-v1-brand-name">
            PressReady<span aria-hidden="true">.</span>
          </p>
          <p className="news-v1-brand-descriptor">Approved Newsroom</p>
        </Link>

        <nav className="news-v1-primary-nav" aria-label="內容分類">
          <ul>
            {publicLinks.map((item) => (
              <li key={item.href}><Link href={item.href}>{item.label}</Link></li>
            ))}
          </ul>
        </nav>

        <div className="news-v1-edition">
          <p>{issueLabel}</p>
          <time>{issueDate}・PRESSREADY</time>
        </div>

        <details className="news-v1-mobile-menu">
          <summary>
            <span>目錄</span>
            <span className="news-v1-menu-icon" aria-hidden="true"><i /><i /></span>
          </summary>
          <div className="news-v1-mobile-menu-panel">
            <p>PUBLIC EDITION</p>
            <nav aria-label="流動版內容分類">
              <ul>
                {publicLinks.map((item) => (
                  <li key={item.href}><Link href={item.href}>{item.label}</Link></li>
                ))}
              </ul>
            </nav>
            <p>NEWSROOM TOOLS</p>
            <nav aria-label="流動版編輯工具">
              <ul>
                <li><Link href="/pipeline">發布工作台</Link></li>
                <li><Link href="/review">編輯工作區</Link></li>
              </ul>
            </nav>
          </div>
        </details>
      </div>
    </header>
  );
}

export function EditorialPublicFooter() {
  return (
    <footer className="news-v1-site-footer">
      <div className="news-v1-page-shell news-v1-footer-main">
        <div>
          <p className="news-v1-footer-brand">PressReady<span aria-hidden="true">.</span></p>
          <p>Approved Newsroom</p>
        </div>
        <div className="news-v1-footer-sections" aria-label="頁尾內容分類">
          <Link href="/technology">科技</Link>
          <Link href="/social-enterprise">社企專欄</Link>
          <Link href="/#news-v1-latest">最新短訊</Link>
        </div>
      </div>
      <div className="news-v1-page-shell news-v1-footer-bottom">
        <p>TRADITIONAL CHINESE・PRESSREADY NEWSROOM</p>
        <p>© {new Date().getFullYear()} PressReady</p>
      </div>
    </footer>
  );
}
