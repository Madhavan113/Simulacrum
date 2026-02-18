import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch } from './client'

describe('apiFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns parsed JSON on success', async () => {
    const mockResponse = { markets: [] }
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    )

    const result = await apiFetch<{ markets: unknown[] }>('/markets')
    expect(result).toEqual(mockResponse)
    expect(fetch).toHaveBeenCalledWith(
      '/markets',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
  })

  it('throws ApiError on non-ok response with error body', async () => {
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })),
    )

    await expect(apiFetch('/markets/bad')).rejects.toThrow(ApiError)
    await expect(apiFetch('/markets/bad')).rejects.toThrow('Not found')
  })

  it('throws ApiError with statusText when body has no error field', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('{}', { status: 500, statusText: 'Internal Server Error' }),
    )

    try {
      await apiFetch('/fail')
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(500)
    }
  })

  it('sets Content-Type header and merges custom headers', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('{}', { status: 200 }),
    )

    await apiFetch('/test', {
      method: 'POST',
      headers: { 'X-Custom': 'value' },
    })

    expect(fetch).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Custom': 'value',
        },
      }),
    )
  })
})
