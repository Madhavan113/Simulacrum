interface PageHeaderProps {
  title: string
  meta?: string
}

export function PageHeader({ title, meta }: PageHeaderProps) {
  return (
    <header style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="px-8 pt-10 pb-6">
        {meta && <p className="label mb-2">{meta}</p>}
        <h1 className="editorial text-primary">{title}</h1>
      </div>
    </header>
  )
}
