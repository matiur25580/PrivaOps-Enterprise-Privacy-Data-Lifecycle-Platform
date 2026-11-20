const capabilities = [
  { title: 'Data inventory', detail: 'Map systems, data assets, owners, and processing activities.' },
  { title: 'Privacy requests', detail: 'Coordinate incoming requests with clear ownership and status.' },
  { title: 'Governance & evidence', detail: 'Track assessments, controls, vendors, and audit evidence.' },
];

export default function App() {
  return (
    <main className="shell">
      <nav className="topbar" aria-label="Main navigation">
        <a className="brand" href="/" aria-label="PrivaOps home">
          <span className="brand-mark">P</span>
          <span>PrivaOps</span>
        </a>
        <span className="environment">FOUNDATION PREVIEW</span>
      </nav>

      <section className="hero">
        <p className="eyebrow">PRIVACY OPERATIONS PLATFORM</p>
        <h1>Privacy governance,<br /><span>made operational.</span></h1>
        <p className="intro">
          A unified workspace for understanding personal-data processing, coordinating privacy
          workflows, and maintaining accountable evidence across your organization.
        </p>
        <div className="status"><span className="status-dot" /> Application foundation is running</div>
      </section>

      <section className="capabilities" aria-labelledby="capabilities-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PLATFORM MODULES</p>
            <h2 id="capabilities-title">Built for privacy teams</h2>
          </div>
          <span className="module-count">01 / 03</span>
        </div>
        <div className="cards">
          {capabilities.map((item, index) => (
            <article className="module-card" key={item.title}>
              <span className="card-index">0{index + 1}</span>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
              <span className="planned">PLANNED MODULE</span>
            </article>
          ))}
        </div>
      </section>

      <footer>PrivaOps · Engineering foundation · Features will appear as they are implemented.</footer>
    </main>
  );
}