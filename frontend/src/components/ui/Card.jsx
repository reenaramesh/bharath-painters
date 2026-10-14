export function Card({ as: Component = "article", className = "", children, ...props }) {
  return (
    <Component
      {...props}
      className={`bp-card ${className}`.trim()}
    >
      {children}
    </Component>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className = "",
  bodyClassName = "",
}) {
  return (
    <section className={`bp-section-card ${className}`}>
      <header>
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      <div className={`bp-section-card-body ${bodyClassName}`.trim()}>
        {children}
      </div>
    </section>
  );
}

export function CompactCard({ as: Component = "article", className = "", ...props }) {
  return <Component {...props} className={`bp-card ${className}`.trim()} />;
}
