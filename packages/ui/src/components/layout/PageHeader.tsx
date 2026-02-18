import { DitherPanel } from '../dither/DitherPanel'

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
      <DitherPanel pattern="bayer4" intensity={0.22} height={3} className="w-full" />
    </header>
  )
}
