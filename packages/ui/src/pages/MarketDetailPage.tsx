import { useParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { MarketDetail } from './MarketDetail'

export function MarketDetailPage() {
  const { marketId } = useParams<{ marketId: string }>()

  if (!marketId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="label">Market not found</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PageHeader title="Market Detail" />
      <div className="flex-1 overflow-y-auto">
        <MarketDetail marketId={marketId} />
      </div>
    </div>
  )
}
