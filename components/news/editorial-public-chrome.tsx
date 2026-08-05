import Link from "next/link";

interface EditorialPublicHeaderProps {
  issueDate?: string;
  topics?: readonly string[];
  issueLabel?: string;
}

export function EditorialPublicHeader({
  issueDate = "待更新",
  topics = [],
  issueLabel = "ISSUE 01",
}: EditorialPublicHeaderProps) {
  const visibleTopics = topics.filter(Boolean).slice(0, 4);

  return (
    <header className="news-v1-site-header">
      <a className="news-v1-skip-link" href="#news-v1-main">跳至主要內容</a>
      <div className="news-v1-page-shell news-v1-prototype-strip">
        <p>PRESSREADY NEWSROOM</p>
        <p>已核准新聞・編輯平台</p>
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
            <li><Link href="/#news-v1-features">精選報道</Link></li>
            <li><Link href="/#news-v1-latest">最新短訊</Link></li>
            <li><Link href="/pipeline">News Pipeline</Link></li>
            <li><Link href="/review">編輯工作區</Link></li>
          </ul>
        </nav>

        <div className="news-v1-edition">
          <p>{issueLabel}</p>
          <time>{issueDate}・PRESSREADY</time>
        </div>
      </div>

      <div className="news-v1-page-shell news-v1-topic-index">
        <p>NOW READING</p>
        <ul aria-label="本期關注主題">
          {(visibleTopics.length > 0 ? visibleTopics : ["等待新報道"]).map((topic) => (
            <li key={topic}><span>{topic}</span></li>
          ))}
        </ul>
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
          <Link href="/#news-v1-features">精選報道</Link>
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
