import { useParams } from 'react-router-dom'
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

  return <MarketDetail marketId={marketId} />
}
